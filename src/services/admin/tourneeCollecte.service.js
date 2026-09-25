const { Op } = require('sequelize');
const {
  TourneeCollecte,
  DemandeEnlevement,
  Colis,
  User,
  Adresse,
  Ville,
  PointCollecte,
} = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { genererRefTournee } = require('../../utils/referenceGenerator');
const { envoyerModele, URL_PUBLIQUE } = require('../../utils/mailer');
const { dateFr } = require('../../utils/documents');
const logger = require('../../config/logger');
const { logActivity } = require('../activityLog.service');
const notificationService = require('../notification.service');

/**
 * Tournées de collecte à domicile.
 *
 * L'administrateur active un créneau de collecte pour une date, une liste de
 * villes et de codes postaux. Une tournée ouverte apparaît en bannière à
 * l'ouverture de l'application, et les clients déjà domiciliés dans la zone en
 * sont informés par notification et par email.
 */
class TourneeCollecteService {
  static TRANSITIONS = {
    brouillon: ['ouverte', 'annulee'],
    ouverte: ['brouillon', 'complete', 'en_cours', 'annulee'],
    complete: ['ouverte', 'en_cours', 'annulee'],
    en_cours: ['terminee'],
    terminee: [],
    annulee: [],
  };

  static INCLUDE_DETAIL = [
    { model: User, as: 'coursier', attributes: ['id', 'nom', 'prenom', 'telephone'] },
    { model: PointCollecte, as: 'pointDepot', attributes: ['id', 'code', 'nom', 'adresse'] },
  ];

  static charger = async (id, include = TourneeCollecteService.INCLUDE_DETAIL) => {
    const tournee = await TourneeCollecte.findByPk(id, { include });
    if (!tournee) throw new NotFoundError('Tournée de collecte introuvable');
    return tournee;
  };

  static enrichir = (t) => ({
    ...t.toJSON(),
    estComplete: t.estComplete,
    accepteInscriptions: t.accepteInscriptions,
  });

  static validerReferences = async (data, pays) => {
    if (data.villeIds?.length) {
      const villes = await Ville.findAll({
        where: { id: data.villeIds },
        attributes: ['id', 'pays'],
      });
      if (villes.length !== new Set(data.villeIds).size) {
        throw new BadRequestError('Une des villes de la tournée est introuvable');
      }
      if (villes.some((v) => v.pays !== pays)) {
        throw new BadRequestError('Toutes les villes de la tournée doivent être dans le même pays');
      }
    }
    if (data.coursierId) {
      const coursier = await User.findByPk(data.coursierId);
      if (!coursier || coursier.role !== 'coursier' || !coursier.isActive) {
        throw new BadRequestError('Coursier introuvable ou inactif');
      }
    }
    if (data.pointDepotId && !(await PointCollecte.findByPk(data.pointDepotId))) {
      throw new BadRequestError('Point de dépôt introuvable');
    }
    if (
      data.dateLimiteInscription &&
      data.dateCollecte &&
      data.dateLimiteInscription > data.dateCollecte
    ) {
      throw new BadRequestError('La clôture des inscriptions doit précéder la date de collecte');
    }
  };

  /* ── Back-office ────────────────────────────────────────────────────────── */

  static getAll = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.pays) where.pays = filters.pays;
    if (filters.aVenir === 'true' || filters.aVenir === true) {
      where.dateCollecte = { [Op.gte]: new Date().toISOString().slice(0, 10) };
    }
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await TourneeCollecte.findAndCountAll({
      where,
      include: TourneeCollecteService.INCLUDE_DETAIL,
      order: [['dateCollecte', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    return {
      message: 'Tournées de collecte',
      tournees: rows.map(TourneeCollecteService.enrichir),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getById = async (id) => {
    const tournee = await TourneeCollecteService.charger(id);
    const [demandes, colis] = await Promise.all([
      DemandeEnlevement.findAll({
        where: { tourneeCollecteId: id },
        include: [{ model: Ville, as: 'ville', attributes: ['id', 'nom'] }],
        order: [
          ['codePostal', 'ASC'],
          ['heureSouhaitee', 'ASC'],
        ],
      }),
      Colis.findAll({
        where: { tourneeCollecteId: id },
        attributes: ['id', 'reference', 'statut', 'categorie', 'expediteurNom', 'nbPieces'],
        order: [['reference', 'ASC']],
      }),
    ]);
    return {
      message: 'Détail de la tournée',
      tournee: { ...TourneeCollecteService.enrichir(tournee), demandes, colis },
    };
  };

  static create = async (data, adminId) => {
    const pays = data.pays || 'FR';
    await TourneeCollecteService.validerReferences(data, pays);
    const tournee = await TourneeCollecte.create({
      ...data,
      pays,
      reference: await genererRefTournee(),
      statut: 'brouillon',
      creePar: adminId,
    });
    await logActivity({
      userId: adminId,
      action: 'admin.tournee.create',
      entite: 'TourneeCollecte',
      entiteId: tournee.id,
      details: { dateCollecte: tournee.dateCollecte },
    });
    return { message: 'Tournée créée. Ouvrez-la pour la proposer aux clients.', tournee };
  };

  static update = async (id, data, adminId) => {
    const tournee = await TourneeCollecteService.charger(id, []);
    if (['terminee', 'annulee'].includes(tournee.statut)) {
      throw new BadRequestError('Une tournée terminée ou annulée ne peut plus être modifiée');
    }
    await TourneeCollecteService.validerReferences(
      { dateCollecte: tournee.dateCollecte, ...data },
      data.pays || tournee.pays
    );
    const dateModifiee = data.dateCollecte && data.dateCollecte !== String(tournee.dateCollecte);
    await tournee.update(data);

    // Changement de date : les demandes rattachées suivent et les clients sont prévenus
    if (dateModifiee) {
      await DemandeEnlevement.update(
        { dateSouhaitee: data.dateCollecte },
        { where: { tourneeCollecteId: id, statut: { [Op.in]: ['demande', 'planifie'] } } }
      );
      const demandes = await DemandeEnlevement.findAll({
        where: { tourneeCollecteId: id, statut: { [Op.in]: ['demande', 'planifie'] } },
        attributes: ['userId'],
      });
      await notificationService.notifierPlusieurs(
        demandes.map((d) => d.userId),
        {
          titre: 'Date de collecte modifiée',
          message: `Votre collecte à domicile aura lieu le ${dateFr(data.dateCollecte)}.`,
          type: 'enlevement',
          niveau: 'alerte',
          entite: 'TourneeCollecte',
          entiteId: id,
        }
      );
    }
    await logActivity({
      userId: adminId,
      action: 'admin.tournee.update',
      entite: 'TourneeCollecte',
      entiteId: id,
      details: { champs: Object.keys(data) },
    });
    return { message: 'Tournée mise à jour.', tournee };
  };

  static changerStatut = async (id, { statut, notifierClients = true }, adminId) => {
    const tournee = await TourneeCollecteService.charger(id, []);
    if (!(TourneeCollecteService.TRANSITIONS[tournee.statut] || []).includes(statut)) {
      throw new BadRequestError(`Transition invalide : ${tournee.statut} vers ${statut}`);
    }
    if (
      statut === 'ouverte' &&
      String(tournee.dateCollecte) < new Date().toISOString().slice(0, 10)
    ) {
      throw new BadRequestError('Impossible d’ouvrir une tournée dont la date est passée');
    }
    await tournee.update({ statut });

    let clientsPrevenus = 0;
    if (statut === 'ouverte' && notifierClients && !tournee.notificationEnvoyeeAt) {
      clientsPrevenus = await TourneeCollecteService.annoncerAuxClients(tournee);
      await tournee.update({ notificationEnvoyeeAt: new Date() });
    }
    if (statut === 'annulee') {
      const demandes = await DemandeEnlevement.findAll({
        where: { tourneeCollecteId: id, statut: { [Op.in]: ['demande', 'planifie'] } },
        attributes: ['userId'],
      });
      await notificationService.notifierPlusieurs(
        demandes.map((d) => d.userId),
        {
          titre: 'Tournée de collecte annulée',
          message: `La collecte du ${dateFr(tournee.dateCollecte)} est annulée. Nous revenons vers vous pour une nouvelle date.`,
          type: 'enlevement',
          niveau: 'alerte',
          entite: 'TourneeCollecte',
          entiteId: id,
        }
      );
    }

    await logActivity({
      userId: adminId,
      action: `admin.tournee.${statut}`,
      entite: 'TourneeCollecte',
      entiteId: id,
      details: { clientsPrevenus },
    });
    return {
      message:
        statut === 'ouverte'
          ? `Tournée ouverte. ${clientsPrevenus} client(s) de la zone prévenu(s).`
          : `Tournée ${statut}.`,
      tournee,
      clientsPrevenus,
    };
  };

  static remove = async (id, adminId) => {
    const tournee = await TourneeCollecteService.charger(id, []);
    if (tournee.nbInscrits > 0) {
      throw new BadRequestError(
        'Des clients sont inscrits : annulez la tournée plutôt que de la supprimer'
      );
    }
    await tournee.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.tournee.delete',
      entite: 'TourneeCollecte',
      entiteId: id,
    });
    return { message: 'Tournée supprimée.' };
  };

  /* ── Annonce aux clients de la zone ─────────────────────────────────────── */

  /** Conditions SQL de rattachement à la zone (codes postaux exacts ou préfixes, villes). */
  static conditionsZone = (tournee) => {
    const codes = (tournee.codesPostaux || []).map(String);
    const exacts = codes.filter((c) => c.length > 2);
    const prefixes = codes.filter((c) => c.length === 2);
    const conditions = [];
    if (exacts.length) conditions.push({ codePostal: { [Op.in]: exacts } });
    prefixes.forEach((p) => conditions.push({ codePostal: { [Op.startsWith]: p } }));
    if (tournee.villeIds?.length) conditions.push({ villeId: { [Op.in]: tournee.villeIds } });
    return conditions;
  };

  /**
   * Prévient les clients domiciliés dans la zone : ceux dont le profil ou le
   * carnet d'adresses (adresse d'expédition) relève de la tournée.
   */
  static annoncerAuxClients = async (tournee) => {
    try {
      const conditions = TourneeCollecteService.conditionsZone(tournee);
      if (!conditions.length) return 0;

      const [parProfil, parCarnet] = await Promise.all([
        User.findAll({
          where: { role: 'client', isActive: true, pays: tournee.pays, [Op.or]: conditions },
          attributes: ['id'],
        }),
        Adresse.findAll({
          where: {
            pays: tournee.pays,
            type: { [Op.in]: ['expediteur', 'les_deux'] },
            [Op.or]: conditions,
          },
          attributes: ['userId'],
        }),
      ]);
      const ids = [...new Set([...parProfil.map((u) => u.id), ...parCarnet.map((a) => a.userId)])];
      if (!ids.length) return 0;

      const clients = await User.findAll({
        where: { id: ids, isActive: true, role: 'client' },
        attributes: ['id', 'email', 'prenom', 'notificationsEmail'],
      });
      const horaires =
        tournee.heureDebut && tournee.heureFin
          ? `entre ${tournee.heureDebut} et ${tournee.heureFin}`
          : '';
      const date = dateFr(tournee.dateCollecte);

      for (const client of clients) {
        await notificationService.notifier({
          userId: client.id,
          titre: `Collecte à domicile le ${date}`,
          message: tournee.messageBanniere || `${tournee.titre} — réservez votre collecte.`,
          type: 'enlevement',
          niveau: 'info',
          entite: 'TourneeCollecte',
          entiteId: tournee.id,
          lienCible: `/collectes/${tournee.id}`,
        });
        if (client.notificationsEmail) {
          await envoyerModele('tournee_collecte', client.email, {
            prenom: client.prenom,
            titre: tournee.titre,
            date,
            horaires,
            zone: (tournee.codesPostaux || []).join(', ') || 'votre ville',
            message: tournee.messageBanniere || '',
            lien: URL_PUBLIQUE ? `${URL_PUBLIQUE}/collectes/${tournee.id}` : null,
          });
        }
      }
      return clients.length;
    } catch (err) {
      logger.error('Annonce de tournée non diffusée', {
        message: err.message,
        tourneeId: tournee.id,
      });
      return 0;
    }
  };

  /* ── Public ─────────────────────────────────────────────────────────────── */

  /**
   * Tournées ouvertes à venir, affichées en bannière. Avec un code postal ou une
   * ville, seules celles qui desservent l'adresse sont renvoyées.
   */
  static getTourneesOuvertes = async ({ pays, codePostal, villeId } = {}) => {
    const tournees = await TourneeCollecte.findAll({
      where: {
        statut: 'ouverte',
        dateCollecte: { [Op.gte]: new Date().toISOString().slice(0, 10) },
        ...(pays ? { pays } : {}),
      },
      attributes: [
        'id',
        'reference',
        'titre',
        'pays',
        'dateCollecte',
        'heureDebut',
        'heureFin',
        'dateLimiteInscription',
        'villeIds',
        'codesPostaux',
        'capaciteMax',
        'nbInscrits',
        'statut',
        'messageBanniere',
        'afficherBanniere',
      ],
      order: [['dateCollecte', 'ASC']],
    });
    const filtrees = tournees
      .filter((t) => t.accepteInscriptions)
      .filter((t) => (!codePostal && !villeId) || t.couvre({ codePostal, villeId }));
    return {
      message: filtrees.length
        ? `${filtrees.length} tournée(s) de collecte ouverte(s)`
        : 'Aucune tournée de collecte ouverte pour le moment',
      tournees: filtrees.map((t) => ({
        ...t.toJSON(),
        placesRestantes: t.capaciteMax ? Math.max(0, t.capaciteMax - t.nbInscrits) : null,
      })),
    };
  };
}

module.exports = TourneeCollecteService;
