const { Op } = require('sequelize');
const { sequelize, Rotation, Colis, PointCollecte, User, Ville } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const suiviService = require('../suivi.service');
const parametreService = require('../parametre.service');
const documents = require('../../utils/documents');
const { genererRefRotation, genererNumeroManifeste } = require('../../utils/referenceGenerator');
const { estInternational, PAYS } = require('../../constants/pays');

/**
 * Rotations : les départs groupés qui relient physiquement les deux pays.
 *
 * Les colis prêts à partir sont affectés à une rotation, dont le cycle de vie
 * pilote leur acheminement : la clôture fige le chargement, le départ bascule
 * tous les colis en transit, l'arrivée les positionne dans le pays de destination.
 */

class RotationService {
  static INCLUDE_DETAIL = [
    { model: PointCollecte, as: 'hubDepart', attributes: ['id', 'code', 'nom', 'pays'] },
    { model: PointCollecte, as: 'hubArrivee', attributes: ['id', 'code', 'nom', 'pays'] },
    { model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom'] },
  ];

  /** Statuts d'expédition acceptés à l'embarquement. */
  static STATUTS_EMBARQUABLES = ['receptionne', 'en_preparation'];

  static chargerRotation = async (id, include = RotationService.INCLUDE_DETAIL) => {
    const rotation = await Rotation.findByPk(id, { include });
    if (!rotation) throw new NotFoundError('Rotation introuvable');
    return rotation;
  };

  static validerHub = async (hubId, pays, libelle) => {
    if (!hubId) return null;
    const hub = await PointCollecte.findByPk(hubId);
    if (!hub) throw new BadRequestError(`Hub ${libelle} introuvable`);
    if (hub.pays !== pays) {
      throw new BadRequestError(`Le hub ${libelle} doit se situer en ${PAYS[pays]?.libelle}`);
    }
    return hub;
  };

  /* ── Cycle de vie ───────────────────────────────────────────────────────── */

  static getAllRotations = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.paysDepart) where.paysDepart = filters.paysDepart;
    if (filters.paysArrivee) where.paysArrivee = filters.paysArrivee;
    if (filters.modeTransport) where.modeTransport = filters.modeTransport;
    if (filters.ouvertes === 'true' || filters.ouvertes === true) {
      where.statut = { [Op.in]: ['planifiee', 'ouverte'] };
    }
    if (filters.dateDebut || filters.dateFin) {
      where.dateDepartPrevue = {};
      if (filters.dateDebut) where.dateDepartPrevue[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.dateDepartPrevue[Op.lte] = new Date(filters.dateFin);
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Rotation.findAndCountAll({
      where,
      include: RotationService.INCLUDE_DETAIL,
      order: [['dateDepartPrevue', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des rotations',
      rotations: rows.map((r) => ({ ...r.toJSON(), tauxRemplissagePoids: r.tauxRemplissagePoids })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getRotationById = async (id) => {
    const rotation = await RotationService.chargerRotation(id);
    const colis = await Colis.findAll({
      where: { rotationId: id },
      attributes: [
        'id',
        'reference',
        'statut',
        'expediteurNom',
        'destinataireNom',
        'nbPieces',
        'poidsFactureKg',
        'valeurDeclaree',
        'typeContenu',
      ],
      include: [{ model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }],
      order: [['reference', 'ASC']],
    });

    return {
      message: 'Détail de la rotation',
      rotation: {
        ...rotation.toJSON(),
        tauxRemplissagePoids: rotation.tauxRemplissagePoids,
        estOuverteAuChargement: rotation.estOuverteAuChargement,
        colis,
      },
    };
  };

  static createRotation = async (data, adminId) => {
    if (!estInternational(data.paysDepart, data.paysArrivee)) {
      throw new BadRequestError('Une rotation relie deux pays distincts du corridor');
    }
    await RotationService.validerHub(data.hubDepartId, data.paysDepart, 'de départ');
    await RotationService.validerHub(data.hubArriveeId, data.paysArrivee, "d'arrivée");

    const reference = await genererRefRotation();
    const rotation = await Rotation.create({ ...data, reference, creePar: adminId });

    await logActivity({
      userId: adminId,
      action: 'admin.rotation.create',
      entite: 'Rotation',
      entiteId: rotation.id,
      details: { reference, corridor: `${data.paysDepart}-${data.paysArrivee}` },
    });
    return { message: 'Rotation créée.', rotation };
  };

  static updateRotation = async (id, data, adminId) => {
    const rotation = await RotationService.chargerRotation(id, []);
    if (['arrivee', 'dechargee', 'annulee'].includes(rotation.statut)) {
      throw new BadRequestError('Une rotation terminée ou annulée ne peut plus être modifiée');
    }

    if (data.hubDepartId !== undefined)
      await RotationService.validerHub(data.hubDepartId, rotation.paysDepart, 'de départ');
    if (data.hubArriveeId !== undefined)
      await RotationService.validerHub(data.hubArriveeId, rotation.paysArrivee, "d'arrivée");

    await rotation.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.rotation.update',
      entite: 'Rotation',
      entiteId: id,
    });
    return { message: 'Rotation mise à jour.', rotation };
  };

  /* ── Chargement ─────────────────────────────────────────────────────────── */

  /**
   * Affecte des colis à une rotation.
   *
   * Chaque colis est contrôlé individuellement : corridor identique, statut
   * embarquable, absence d'affectation concurrente. Les capacités déclarées sont
   * vérifiées globalement avant écriture, pour ne pas surcharger un vol.
   */
  static chargerColis = async (id, colisIds, adminId) => {
    // Les hubs sont nécessaires pour localiser l'événement de mise au manifeste
    const rotation = await RotationService.chargerRotation(id);
    if (!rotation.estOuverteAuChargement) {
      throw new BadRequestError(
        `Cette rotation n'accepte plus de chargement (statut : ${rotation.statut})`
      );
    }

    const colisList = await Colis.findAll({ where: { id: colisIds } });
    const acceptes = [];
    const refuses = [];

    for (const colisId of colisIds) {
      const colis = colisList.find((c) => c.id === colisId);
      if (!colis) {
        refuses.push({ id: colisId, motif: 'Expédition introuvable' });
        continue;
      }
      if (colis.rotationId === rotation.id) {
        refuses.push({
          id: colisId,
          reference: colis.reference,
          motif: 'Déjà chargé sur cette rotation',
        });
        continue;
      }
      if (colis.rotationId) {
        refuses.push({
          id: colisId,
          reference: colis.reference,
          motif: 'Déjà affecté à une autre rotation',
        });
        continue;
      }
      if (colis.paysDepart !== rotation.paysDepart || colis.paysArrivee !== rotation.paysArrivee) {
        refuses.push({
          id: colisId,
          reference: colis.reference,
          motif: 'Corridor différent de celui de la rotation',
        });
        continue;
      }
      if (!RotationService.STATUTS_EMBARQUABLES.includes(colis.statut)) {
        refuses.push({
          id: colisId,
          reference: colis.reference,
          motif: `Statut « ${colis.statut} » non embarquable — le colis doit être réceptionné`,
        });
        continue;
      }
      acceptes.push(colis);
    }

    const poidsAjoute = acceptes.reduce((acc, c) => acc + Number(c.poidsFactureKg), 0);
    if (
      rotation.capacitePoidsKg &&
      Number(rotation.poidsCharge) + poidsAjoute > Number(rotation.capacitePoidsKg)
    ) {
      throw new BadRequestError(
        `Capacité dépassée : ${(Number(rotation.poidsCharge) + poidsAjoute).toFixed(2)} kg ` +
          `pour une limite de ${rotation.capacitePoidsKg} kg`
      );
    }
    if (
      rotation.capaciteColis &&
      rotation.nbColisCharges + acceptes.length > rotation.capaciteColis
    ) {
      throw new BadRequestError(
        `Capacité dépassée : ${rotation.nbColisCharges + acceptes.length} colis pour une limite de ${rotation.capaciteColis}`
      );
    }

    await sequelize.transaction(async (t) => {
      await Colis.update(
        { rotationId: rotation.id },
        { where: { id: acceptes.map((c) => c.id) }, transaction: t }
      );
      await rotation.update(
        {
          poidsCharge: Number(rotation.poidsCharge) + poidsAjoute,
          nbColisCharges: rotation.nbColisCharges + acceptes.length,
          statut: rotation.statut === 'planifiee' ? 'ouverte' : rotation.statut,
        },
        { transaction: t }
      );
    });

    // L'événement de manifeste est journalisé colis par colis, hors transaction
    for (const colis of acceptes) {
      await suiviService
        .enregistrerEvenement(
          colis,
          {
            codeEvenement: 'MANIFESTE',
            commentaire: `Affecté à la rotation ${rotation.reference}`,
            lieu: rotation.hubDepart?.nom || null,
          },
          { auteurId: adminId, notifier: false }
        )
        .catch(() => {});
    }

    await logActivity({
      userId: adminId,
      action: 'admin.rotation.charger',
      entite: 'Rotation',
      entiteId: rotation.id,
      details: { charges: acceptes.length, refuses: refuses.length },
    });

    return {
      message: `${acceptes.length} colis chargé(s), ${refuses.length} refusé(s).`,
      charges: acceptes.map((c) => ({ id: c.id, reference: c.reference })),
      refuses,
    };
  };

  /** Retire des colis d'une rotation encore ouverte. */
  static dechargerColis = async (id, colisIds, adminId) => {
    const rotation = await RotationService.chargerRotation(id, []);
    if (!rotation.estOuverteAuChargement) {
      throw new BadRequestError('Le chargement de cette rotation est figé');
    }

    const colisList = await Colis.findAll({ where: { id: colisIds, rotationId: id } });
    if (!colisList.length)
      throw new BadRequestError("Aucun de ces colis n'est chargé sur cette rotation");

    const poidsRetire = colisList.reduce((acc, c) => acc + Number(c.poidsFactureKg), 0);

    await sequelize.transaction(async (t) => {
      await Colis.update(
        { rotationId: null },
        { where: { id: colisList.map((c) => c.id) }, transaction: t }
      );
      await rotation.update(
        {
          poidsCharge: Math.max(0, Number(rotation.poidsCharge) - poidsRetire),
          nbColisCharges: Math.max(0, rotation.nbColisCharges - colisList.length),
        },
        { transaction: t }
      );
    });

    await logActivity({
      userId: adminId,
      action: 'admin.rotation.decharger',
      entite: 'Rotation',
      entiteId: id,
      details: { nbColis: colisList.length },
    });

    return { message: `${colisList.length} colis retiré(s) de la rotation.` };
  };

  /* ── Jalons ─────────────────────────────────────────────────────────────── */

  static TRANSITIONS_ROTATION = {
    planifiee: ['ouverte', 'annulee'],
    ouverte: ['cloturee', 'annulee'],
    cloturee: ['en_transit', 'ouverte', 'annulee'],
    en_transit: ['arrivee'],
    arrivee: ['dechargee'],
    dechargee: [],
    annulee: [],
  };

  /**
   * Fait progresser la rotation et propage l'événement à tous les colis embarqués.
   * C'est ce mécanisme qui évite de scanner les colis un par un à chaque étape.
   */
  static changerStatut = async (id, nouveauStatut, adminId, { commentaire = null } = {}) => {
    const rotation = await RotationService.chargerRotation(id);
    const autorises = RotationService.TRANSITIONS_ROTATION[rotation.statut] || [];
    if (!autorises.includes(nouveauStatut)) {
      throw new BadRequestError(
        `Transition de rotation invalide : ${rotation.statut} vers ${nouveauStatut}`
      );
    }
    if (nouveauStatut === 'cloturee' && rotation.nbColisCharges === 0) {
      throw new BadRequestError('Impossible de clôturer une rotation vide');
    }

    const maj = { statut: nouveauStatut };
    if (nouveauStatut === 'cloturee' && !rotation.numeroManifeste) {
      maj.numeroManifeste = await genererNumeroManifeste();
    }
    if (nouveauStatut === 'en_transit') maj.dateDepartEffective = new Date();
    if (nouveauStatut === 'arrivee') maj.dateArriveeEffective = new Date();
    if (commentaire) maj.commentaire = commentaire;

    await rotation.update(maj);

    // Événement propagé aux colis embarqués
    const EVENEMENT_PAR_STATUT = {
      en_transit: { codeEvenement: 'DEPART_HUB', pointCollecteId: null },
      arrivee: { codeEvenement: 'ARR_PAYS', pointCollecteId: rotation.hubArriveeId || null },
      dechargee: { codeEvenement: 'ARR_AGENCE', pointCollecteId: rotation.hubArriveeId || null },
    };
    const evenement = EVENEMENT_PAR_STATUT[nouveauStatut];

    let propages = 0;
    if (evenement) {
      const colisList = await Colis.findAll({ where: { rotationId: id } });
      for (const colis of colisList) {
        const resultat = await suiviService
          .enregistrerEvenement(
            colis,
            {
              ...evenement,
              lieu:
                nouveauStatut === 'en_transit'
                  ? rotation.hubDepart?.nom || PAYS[rotation.paysDepart]?.libelle
                  : rotation.hubArrivee?.nom || PAYS[rotation.paysArrivee]?.libelle,
              pays: nouveauStatut === 'en_transit' ? rotation.paysDepart : rotation.paysArrivee,
              commentaire: `Rotation ${rotation.reference}`,
            },
            { auteurId: adminId }
          )
          .catch(() => null);
        if (resultat) propages += 1;
      }
    }

    if (nouveauStatut === 'annulee') {
      await Colis.update({ rotationId: null }, { where: { rotationId: id } });
      await rotation.update({ poidsCharge: 0, nbColisCharges: 0 });
    }

    await logActivity({
      userId: adminId,
      action: `admin.rotation.${nouveauStatut}`,
      entite: 'Rotation',
      entiteId: id,
      details: { colisPropages: propages },
    });

    return {
      message: `Rotation ${nouveauStatut}. ${propages} colis mis à jour.`,
      rotation,
      colisMisAJour: propages,
    };
  };

  /** Manifeste de chargement à remettre au transporteur et aux douanes. */
  static getManifeste = async (id) => {
    const rotation = await RotationService.chargerRotation(id);
    const [colis, parametres] = await Promise.all([
      Colis.findAll({
        where: { rotationId: id },
        include: [{ model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }],
        order: [['reference', 'ASC']],
      }),
      parametreService.chargerTous(),
    ]);

    return {
      html: documents.genererManifeste(rotation, colis, parametres),
      nomFichier: `manifeste-${rotation.reference}.html`,
    };
  };

  /** Colis prêts à embarquer sur un corridor donné, pour préparer un chargement. */
  static getColisEmbarquables = async (paysDepart, paysArrivee, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Colis.findAndCountAll({
      where: {
        paysDepart,
        paysArrivee,
        rotationId: null,
        statut: { [Op.in]: RotationService.STATUTS_EMBARQUABLES },
      },
      attributes: [
        'id',
        'reference',
        'statut',
        'nbPieces',
        'poidsFactureKg',
        'destinataireNom',
        'createdAt',
      ],
      include: [
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
        { model: PointCollecte, as: 'pointActuel', attributes: ['id', 'nom'] },
      ],
      order: [['createdAt', 'ASC']],
      limit,
      offset,
    });

    return {
      message: `${count} colis en attente d'embarquement`,
      colis: rows,
      poidsTotal: rows.reduce((acc, c) => acc + Number(c.poidsFactureKg), 0),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };
}

module.exports = RotationService;
