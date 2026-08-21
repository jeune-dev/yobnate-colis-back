const { Op } = require('sequelize');
const { Tarif, Zone, ServiceExpedition } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const { PAYS } = require('../../constants/pays');

/**
 * Grille tarifaire.
 *
 * Une ligne couvre un service, un corridor et une tranche de poids. La cohérence
 * de la grille est vérifiée à l'écriture : deux tranches ne peuvent pas se
 * chevaucher pour un même couple service/corridor/zones, sans quoi le moteur de
 * tarification devrait arbitrer entre deux prix également légitimes.
 */

class TarifService {
  static INCLUDE_DETAIL = [
    { model: ServiceExpedition, as: 'service', attributes: ['id', 'code', 'nom'] },
    { model: Zone, as: 'zoneDepart', attributes: ['id', 'code', 'nom'] },
    { model: Zone, as: 'zoneArrivee', attributes: ['id', 'code', 'nom'] },
  ];

  /** Deux intervalles de poids se recouvrent-ils ? Une borne haute nulle signifie « sans limite ». */
  static tranchesSeChevauchent = (a, b) => {
    const aMin = Number(a.poidsMinKg);
    const aMax =
      a.poidsMaxKg === null || a.poidsMaxKg === undefined ? Infinity : Number(a.poidsMaxKg);
    const bMin = Number(b.poidsMinKg);
    const bMax =
      b.poidsMaxKg === null || b.poidsMaxKg === undefined ? Infinity : Number(b.poidsMaxKg);
    return aMin < bMax && bMin < aMax;
  };

  /** Les périodes de validité se recouvrent-elles ? Une borne absente vaut « toujours ». */
  static periodesSeChevauchent = (a, b) => {
    const aDebut = a.dateDebutValidite || '0000-01-01';
    const aFin = a.dateFinValidite || '9999-12-31';
    const bDebut = b.dateDebutValidite || '0000-01-01';
    const bFin = b.dateFinValidite || '9999-12-31';
    return String(aDebut) <= String(bFin) && String(bDebut) <= String(aFin);
  };

  static verifierChevauchement = async (data, idAExclure = null) => {
    const where = {
      serviceId: data.serviceId,
      paysDepart: data.paysDepart,
      paysArrivee: data.paysArrivee,
      zoneDepartId: data.zoneDepartId ?? null,
      zoneArriveeId: data.zoneArriveeId ?? null,
    };
    if (idAExclure) where.id = { [Op.ne]: idAExclure };

    const existants = await Tarif.findAll({ where });
    const conflit = existants.find(
      (t) =>
        TarifService.tranchesSeChevauchent(t, data) && TarifService.periodesSeChevauchent(t, data)
    );

    if (conflit) {
      const borne = conflit.poidsMaxKg === null ? 'et au-delà' : `à ${conflit.poidsMaxKg} kg`;
      throw new ConflictError(
        `Une tranche existe déjà pour ce corridor de ${conflit.poidsMinKg} kg ${borne} sur la même période`
      );
    }
  };

  static validerReferences = async (data) => {
    const service = await ServiceExpedition.findByPk(data.serviceId);
    if (!service) throw new BadRequestError('Service introuvable');

    for (const [champ, libelle] of [
      ['zoneDepartId', 'de départ'],
      ['zoneArriveeId', "d'arrivée"],
    ]) {
      if (!data[champ]) continue;
      const zone = await Zone.findByPk(data[champ]);
      if (!zone) throw new BadRequestError(`Zone ${libelle} introuvable`);
      const paysAttendu = champ === 'zoneDepartId' ? data.paysDepart : data.paysArrivee;
      if (zone.pays !== paysAttendu) {
        throw new BadRequestError(
          `La zone ${libelle} « ${zone.nom} » n'appartient pas au pays ${PAYS[paysAttendu]?.libelle}`
        );
      }
    }
    return service;
  };

  static getAllTarifs = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.paysDepart) where.paysDepart = filters.paysDepart;
    if (filters.paysArrivee) where.paysArrivee = filters.paysArrivee;
    if (filters.zoneDepartId) where.zoneDepartId = filters.zoneDepartId;
    if (filters.zoneArriveeId) where.zoneArriveeId = filters.zoneArriveeId;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.poids) {
      where.poidsMinKg = { [Op.lte]: Number(filters.poids) };
      where[Op.or] = [{ poidsMaxKg: null }, { poidsMaxKg: { [Op.gte]: Number(filters.poids) } }];
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Tarif.findAndCountAll({
      where,
      include: TarifService.INCLUDE_DETAIL,
      order: [
        ['paysDepart', 'ASC'],
        ['paysArrivee', 'ASC'],
        ['poidsMinKg', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Grille tarifaire',
      tarifs: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getTarifById = async (id) => {
    const tarif = await Tarif.findByPk(id, { include: TarifService.INCLUDE_DETAIL });
    if (!tarif) throw new NotFoundError('Tarif introuvable');
    return { message: 'Détail du tarif', tarif };
  };

  static createTarif = async (data, adminId) => {
    await TarifService.validerReferences(data);
    await TarifService.verifierChevauchement(data);

    const tarif = await Tarif.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.tarif.create',
      entite: 'Tarif',
      entiteId: tarif.id,
      details: {
        corridor: `${data.paysDepart}-${data.paysArrivee}`,
        tranche: `${data.poidsMinKg}-${data.poidsMaxKg ?? '∞'}`,
      },
    });
    return TarifService.getTarifById(tarif.id).then((r) => ({
      message: 'Tarif créé.',
      tarif: r.tarif,
    }));
  };

  static updateTarif = async (id, data, adminId) => {
    const tarif = await Tarif.findByPk(id);
    if (!tarif) throw new NotFoundError('Tarif introuvable');

    const fusionne = { ...tarif.toJSON(), ...data };
    if (
      data.serviceId ||
      data.zoneDepartId !== undefined ||
      data.zoneArriveeId !== undefined ||
      data.paysDepart ||
      data.paysArrivee
    ) {
      await TarifService.validerReferences(fusionne);
    }
    if (
      data.poidsMinKg !== undefined ||
      data.poidsMaxKg !== undefined ||
      data.dateDebutValidite !== undefined ||
      data.dateFinValidite !== undefined
    ) {
      await TarifService.verifierChevauchement(fusionne, id);
    }

    await tarif.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.tarif.update',
      entite: 'Tarif',
      entiteId: tarif.id,
    });
    return TarifService.getTarifById(tarif.id).then((r) => ({
      message: 'Tarif mis à jour.',
      tarif: r.tarif,
    }));
  };

  static deleteTarif = async (id, adminId) => {
    const tarif = await Tarif.findByPk(id);
    if (!tarif) throw new NotFoundError('Tarif introuvable');

    await tarif.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.tarif.delete',
      entite: 'Tarif',
      entiteId: id,
    });
    return { message: 'Tarif supprimé.' };
  };

  /**
   * Crée une grille complète en une opération : plusieurs tranches de poids pour
   * un même corridor. Toute ligne en conflit interrompt l'ensemble, afin de ne pas
   * laisser une grille à moitié importée.
   */
  static creerGrille = async (
    {
      serviceId,
      paysDepart,
      paysArrivee,
      zoneDepartId = null,
      zoneArriveeId = null,
      devise,
      tranches,
    },
    adminId
  ) => {
    const base = { serviceId, paysDepart, paysArrivee, zoneDepartId, zoneArriveeId, devise };
    await TarifService.validerReferences(base);

    // Contrôle des chevauchements internes à la grille soumise
    for (let i = 0; i < tranches.length; i += 1) {
      for (let j = i + 1; j < tranches.length; j += 1) {
        if (TarifService.tranchesSeChevauchent(tranches[i], tranches[j])) {
          throw new BadRequestError(
            `Les tranches ${tranches[i].poidsMinKg}-${tranches[i].poidsMaxKg ?? '∞'} et ` +
              `${tranches[j].poidsMinKg}-${tranches[j].poidsMaxKg ?? '∞'} se chevauchent`
          );
        }
      }
    }
    for (const tranche of tranches) {
      await TarifService.verifierChevauchement({ ...base, ...tranche });
    }

    const crees = await Tarif.bulkCreate(
      tranches.map((t) => ({ ...base, ...t })),
      { validate: true }
    );
    await logActivity({
      userId: adminId,
      action: 'admin.tarif.grille',
      entite: 'Tarif',
      details: { corridor: `${paysDepart}-${paysArrivee}`, nbTranches: crees.length },
    });

    return { message: `Grille de ${crees.length} tranche(s) créée.`, tarifs: crees };
  };

  /**
   * Contrôle de couverture : signale les trous et les incohérences de la grille,
   * corridor par corridor, pour chaque service actif.
   */
  static auditerGrille = async () => {
    const [services, tarifs] = await Promise.all([
      ServiceExpedition.findAll({ where: { isActive: true }, order: [['ordreAffichage', 'ASC']] }),
      Tarif.findAll({ where: { isActive: true }, include: TarifService.INCLUDE_DETAIL }),
    ]);

    const codesPays = Object.keys(PAYS);
    const corridors = codesPays.flatMap((d) => codesPays.map((a) => ({ depart: d, arrivee: a })));
    const anomalies = [];

    for (const service of services) {
      for (const { depart, arrivee } of corridors) {
        const lignes = tarifs
          .filter(
            (t) =>
              t.serviceId === service.id && t.paysDepart === depart && t.paysArrivee === arrivee
          )
          .sort((a, b) => Number(a.poidsMinKg) - Number(b.poidsMinKg));

        const contexte = { service: service.nom, corridor: `${depart} vers ${arrivee}` };

        if (!lignes.length) {
          anomalies.push({ ...contexte, gravite: 'bloquante', probleme: 'Aucun tarif défini' });
          continue;
        }
        if (Number(lignes[0].poidsMinKg) > 0) {
          anomalies.push({
            ...contexte,
            gravite: 'bloquante',
            probleme: `Aucune tranche en dessous de ${lignes[0].poidsMinKg} kg`,
          });
        }

        for (let i = 0; i < lignes.length - 1; i += 1) {
          const max = lignes[i].poidsMaxKg;
          if (max === null) break;
          const suivantMin = Number(lignes[i + 1].poidsMinKg);
          if (suivantMin > Number(max)) {
            anomalies.push({
              ...contexte,
              gravite: 'bloquante',
              probleme: `Trou de couverture entre ${max} kg et ${suivantMin} kg`,
            });
          }
        }

        const derniere = lignes[lignes.length - 1];
        if (
          derniere.poidsMaxKg !== null &&
          Number(derniere.poidsMaxKg) < Number(service.poidsMaxKg)
        ) {
          anomalies.push({
            ...contexte,
            gravite: 'avertissement',
            probleme:
              `La grille s'arrête à ${derniere.poidsMaxKg} kg alors que le service accepte ` +
              `jusqu'à ${service.poidsMaxKg} kg`,
          });
        }
      }
    }

    return {
      message: anomalies.length
        ? `${anomalies.length} anomalie(s) détectée(s) dans la grille tarifaire`
        : 'La grille tarifaire est complète et cohérente',
      conforme: anomalies.length === 0,
      anomalies,
    };
  };
}

module.exports = TarifService;
