const { Op } = require('sequelize');
const { DemandeEnlevement, User, Ville, PointCollecte, Colis } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const notificationService = require('../notification.service');
const suiviService = require('../suivi.service');
const { sendEnlevementPlanifieEmail } = require('../../utils/mailer');
const { PAYS } = require('../../constants/pays');

/**
 * Enlèvements à domicile — organisation des tournées de ramassage.
 *
 * Une demande passe par la planification (affectation d'un coursier et d'un point
 * de dépôt), l'exécution sur le terrain, puis la clôture. Un enlèvement réussi
 * fait basculer le colis rattaché à l'état « enlevé » via le moteur de suivi.
 */

class EnlevementService {
  static INCLUDE_DETAIL = [
    { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] },
    { model: User, as: 'coursier', attributes: ['id', 'nom', 'prenom', 'telephone'] },
    { model: Ville, as: 'ville', attributes: ['id', 'nom', 'pays'] },
    { model: PointCollecte, as: 'pointDepot', attributes: ['id', 'code', 'nom', 'adresse'] },
    {
      model: Colis,
      as: 'colis',
      attributes: ['id', 'reference', 'statut', 'nbPieces', 'poidsFactureKg'],
    },
  ];

  static TRANSITIONS = {
    demande: ['planifie', 'annule'],
    planifie: ['en_cours', 'demande', 'annule'],
    en_cours: ['effectue', 'echoue'],
    effectue: [],
    echoue: ['planifie', 'annule'],
    annule: [],
  };

  static chargerDemande = async (id) => {
    const demande = await DemandeEnlevement.findByPk(id, {
      include: EnlevementService.INCLUDE_DETAIL,
    });
    if (!demande) throw new NotFoundError("Demande d'enlèvement introuvable");
    return demande;
  };

  static getAllDemandes = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.pays) where.pays = filters.pays;
    if (filters.villeId) where.villeId = filters.villeId;
    if (filters.coursierId) where.coursierId = filters.coursierId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.sansCoursier === 'true' || filters.sansCoursier === true) where.coursierId = null;
    if (filters.aTraiter === 'true' || filters.aTraiter === true) {
      where.statut = { [Op.in]: ['demande', 'planifie', 'en_cours'] };
    }
    if (filters.dateDebut || filters.dateFin) {
      where.dateSouhaitee = {};
      if (filters.dateDebut) where.dateSouhaitee[Op.gte] = filters.dateDebut;
      if (filters.dateFin) where.dateSouhaitee[Op.lte] = filters.dateFin;
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await DemandeEnlevement.findAndCountAll({
      where,
      include: EnlevementService.INCLUDE_DETAIL,
      order: [
        ['dateSouhaitee', 'ASC'],
        ['creneau', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: "Demandes d'enlèvement",
      demandes: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getDemandeById = async (id) => ({
    message: "Détail de la demande d'enlèvement",
    demande: await EnlevementService.chargerDemande(id),
  });

  /**
   * Planifie un enlèvement : affecte un coursier du bon pays et le point où les
   * colis seront déposés à l'issue de la tournée.
   */
  static planifier = async (id, { coursierId, pointDepotId, datePlanifiee, creneau }, adminId) => {
    const demande = await EnlevementService.chargerDemande(id);
    if (!EnlevementService.TRANSITIONS[demande.statut].includes('planifie')) {
      throw new BadRequestError(
        `Une demande au statut « ${demande.statut} » ne peut pas être planifiée`
      );
    }

    const coursier = await User.findByPk(coursierId);
    if (!coursier) throw new BadRequestError('Coursier introuvable');
    if (coursier.role !== 'coursier')
      throw new BadRequestError("L'utilisateur désigné n'est pas un coursier");
    if (!coursier.isActive) throw new BadRequestError('Ce compte coursier est désactivé');
    if (coursier.pays !== demande.pays) {
      throw new BadRequestError(`Le coursier doit opérer en ${PAYS[demande.pays]?.libelle}`);
    }

    if (pointDepotId) {
      const point = await PointCollecte.findByPk(pointDepotId);
      if (!point) throw new BadRequestError('Point de dépôt introuvable');
      if (point.pays !== demande.pays) {
        throw new BadRequestError("Le point de dépôt doit se situer dans le pays de l'enlèvement");
      }
      if (!point.offreService('depot'))
        throw new BadRequestError("Ce point n'assure pas la réception de colis");
    }

    await demande.update({
      statut: 'planifie',
      coursierId,
      pointDepotId: pointDepotId || null,
      datePlanifiee: datePlanifiee || demande.dateSouhaitee,
      creneau: creneau || demande.creneau,
    });

    // Le colis rattaché passe en enlèvement programmé
    if (demande.colis) {
      await suiviService
        .enregistrerEvenement(
          demande.colis,
          {
            codeEvenement: 'ENL_PROG',
            commentaire: `Enlèvement prévu le ${demande.dateSouhaitee} (${demande.creneau})`,
            lieu: demande.ville?.nom,
          },
          { auteurId: adminId }
        )
        .catch(() => {});
    }

    await notificationService.notifier({
      userId: demande.userId,
      titre: `Enlèvement ${demande.reference} planifié`,
      message: `Un coursier passera le ${demande.dateSouhaitee} sur le créneau ${demande.creneau}.`,
      type: 'enlevement',
      niveau: 'succes',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
      lienCible: `/enlevements/${demande.id}`,
      email: () => sendEnlevementPlanifieEmail(demande.client, demande),
    });

    await notificationService.notifier({
      userId: coursierId,
      titre: `Nouvel enlèvement — ${demande.reference}`,
      message: `${demande.adresse}, ${demande.ville?.nom} — le ${demande.dateSouhaitee} (${demande.creneau})`,
      type: 'enlevement',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
      lienCible: `/coursier/enlevements/${demande.id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.enlevement.planifier',
      entite: 'DemandeEnlevement',
      entiteId: id,
      details: { coursierId, pointDepotId },
    });

    return { message: 'Enlèvement planifié et coursier averti.', demande };
  };

  /**
   * Enregistre l'issue d'un enlèvement.
   * Un enlèvement réussi confie le colis au réseau ; un échec reste ouvert à une
   * nouvelle planification.
   */
  static cloturer = async (id, { statut, motifEchec, commentaire, pointDepotId }, auteurId) => {
    const demande = await EnlevementService.chargerDemande(id);
    if (!EnlevementService.TRANSITIONS[demande.statut]?.includes(statut)) {
      throw new BadRequestError(`Transition invalide : ${demande.statut} vers ${statut}`);
    }
    if (statut === 'echoue' && !motifEchec) {
      throw new BadRequestError("Le motif de l'échec est requis");
    }

    await demande.update({
      statut,
      motifEchec: statut === 'echoue' ? motifEchec : null,
      commentaireCoursier: commentaire || demande.commentaireCoursier,
      pointDepotId: pointDepotId || demande.pointDepotId,
      dateEffective: statut === 'effectue' ? new Date() : demande.dateEffective,
    });

    if (demande.colis) {
      await suiviService
        .enregistrerEvenement(
          demande.colis,
          statut === 'effectue'
            ? {
                codeEvenement: 'ENL_OK',
                commentaire: commentaire || "Colis récupéré chez l'expéditeur",
                pointCollecteId: pointDepotId || demande.pointDepotId || undefined,
                lieu: demande.ville?.nom,
                pays: demande.pays,
              }
            : {
                codeEvenement: 'ENL_ECHEC',
                commentaire: motifEchec,
                lieu: demande.ville?.nom,
                pays: demande.pays,
              },
          { auteurId }
        )
        .catch(() => {});
    }

    await notificationService.notifier({
      userId: demande.userId,
      titre:
        statut === 'effectue'
          ? `Enlèvement ${demande.reference} effectué`
          : `Enlèvement ${demande.reference} infructueux`,
      message:
        statut === 'effectue'
          ? 'Vos colis ont été récupérés et sont pris en charge par notre réseau.'
          : `Le coursier n'a pas pu récupérer vos colis : ${motifEchec}`,
      type: 'enlevement',
      niveau: statut === 'effectue' ? 'succes' : 'alerte',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
      lienCible: `/enlevements/${demande.id}`,
    });

    await logActivity({
      userId: auteurId,
      action: `admin.enlevement.${statut}`,
      entite: 'DemandeEnlevement',
      entiteId: id,
    });

    return {
      message:
        statut === 'effectue'
          ? 'Enlèvement clôturé avec succès.'
          : "Échec d'enlèvement enregistré.",
      demande,
    };
  };

  static demarrer = async (id, auteurId) => {
    const demande = await EnlevementService.chargerDemande(id);
    if (!EnlevementService.TRANSITIONS[demande.statut].includes('en_cours')) {
      throw new BadRequestError(`Une demande au statut « ${demande.statut} » ne peut pas démarrer`);
    }
    await demande.update({ statut: 'en_cours' });
    await logActivity({
      userId: auteurId,
      action: 'admin.enlevement.demarrer',
      entite: 'DemandeEnlevement',
      entiteId: id,
    });
    return { message: 'Tournée démarrée pour cette demande.', demande };
  };

  static annuler = async (id, motif, auteurId) => {
    const demande = await EnlevementService.chargerDemande(id);
    if (!EnlevementService.TRANSITIONS[demande.statut].includes('annule')) {
      throw new BadRequestError('Cette demande ne peut plus être annulée');
    }

    await demande.update({ statut: 'annule', motifEchec: motif || null });
    await notificationService.notifier({
      userId: demande.userId,
      titre: `Enlèvement ${demande.reference} annulé`,
      message: motif || "Votre demande d'enlèvement a été annulée.",
      type: 'enlevement',
      niveau: 'alerte',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
    });

    await logActivity({
      userId: auteurId,
      action: 'admin.enlevement.annuler',
      entite: 'DemandeEnlevement',
      entiteId: id,
    });
    return { message: "Demande d'enlèvement annulée.", demande };
  };

  /**
   * Feuille de route d'un coursier pour une journée : les enlèvements à réaliser,
   * ordonnés par créneau.
   */
  static getTournee = async (coursierId, date) => {
    const jour = date || new Date().toISOString().slice(0, 10);
    const demandes = await DemandeEnlevement.findAll({
      where: {
        coursierId,
        dateSouhaitee: jour,
        statut: { [Op.in]: ['planifie', 'en_cours'] },
      },
      include: EnlevementService.INCLUDE_DETAIL,
      order: [['creneau', 'ASC']],
    });

    return {
      message: `Tournée du ${jour} — ${demandes.length} enlèvement(s)`,
      date: jour,
      demandes,
      totalColis: demandes.reduce((acc, d) => acc + Number(d.nbColis || 0), 0),
    };
  };
}

module.exports = EnlevementService;
