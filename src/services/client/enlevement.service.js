const { Op } = require('sequelize');
const { DemandeEnlevement, Ville, PointCollecte, Colis, User } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const { genererRefEnlevement } = require('../../utils/referenceGenerator');
const { CRENEAUX_ENLEVEMENT } = require('../../constants/reseau');

/**
 * Demandes d'enlèvement à domicile côté client.
 * Le client choisit une date et un créneau ; la planification opérationnelle
 * (coursier, point de dépôt) reste du ressort du back-office.
 */

class EnlevementService {
  static INCLUDE_DETAIL = [
    { model: Ville, as: 'ville', attributes: ['id', 'nom', 'pays'] },
    { model: PointCollecte, as: 'pointDepot', attributes: ['id', 'code', 'nom', 'adresse'] },
    { model: Colis, as: 'colis', attributes: ['id', 'reference', 'statut'] },
    { model: User, as: 'coursier', attributes: ['id', 'prenom', 'telephone'] },
  ];

  /** Une demande se prend au plus tôt pour le lendemain et au plus tard sous 30 jours. */
  static validerDate = (dateSouhaitee) => {
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);

    const jour = String(dateSouhaitee);
    if (jour < demain.toISOString().slice(0, 10)) {
      throw new BadRequestError('Un enlèvement se programme au plus tôt pour le lendemain');
    }
    if (jour > limite.toISOString().slice(0, 10)) {
      throw new BadRequestError('Un enlèvement ne peut pas être programmé à plus de 30 jours');
    }
  };

  static creerDemande = async (userId, data) => {
    EnlevementService.validerDate(data.dateSouhaitee);
    if (!CRENEAUX_ENLEVEMENT.includes(data.creneau)) {
      throw new BadRequestError(
        `Créneau invalide. Créneaux disponibles : ${CRENEAUX_ENLEVEMENT.join(', ')}`
      );
    }

    const ville = await Ville.findByPk(data.villeId);
    if (!ville) throw new BadRequestError('Ville introuvable');
    if (!ville.isActive)
      throw new BadRequestError(`La ville « ${ville.nom} » n'est plus desservie`);
    if (!ville.enlevementDomicileDisponible) {
      throw new BadRequestError(`L'enlèvement à domicile n'est pas assuré à ${ville.nom}`);
    }
    if (ville.pays !== data.pays) {
      throw new BadRequestError("La ville choisie n'appartient pas au pays indiqué");
    }

    // Un colis rattaché doit appartenir au demandeur et attendre encore sa prise en charge
    if (data.colisId) {
      const colis = await Colis.findOne({ where: { id: data.colisId, userId } });
      if (!colis) throw new BadRequestError('Expédition introuvable');
      if (colis.statut !== 'en_attente') {
        throw new BadRequestError("Cette expédition n'est plus en attente de prise en charge");
      }
      const existante = await DemandeEnlevement.findOne({
        where: { colisId: data.colisId, statut: { [Op.notIn]: ['annule', 'echoue'] } },
      });
      if (existante)
        throw new ConflictError('Un enlèvement est déjà programmé pour cette expédition');
    }

    const parametres = await parametreService.chargerTous();
    const reference = await genererRefEnlevement();

    const demande = await DemandeEnlevement.create({
      ...data,
      reference,
      userId,
      statut: 'demande',
      fraisEnlevement: Number(parametres.frais_enlevement_domicile_xof),
    });

    await notificationService.notifierAdmins({
      titre: `Nouvelle demande d'enlèvement ${reference}`,
      message: `${data.adresse}, ${ville.nom} — le ${data.dateSouhaitee} (${data.creneau})`,
      type: 'enlevement',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
      lienCible: `/admin/enlevements/${demande.id}`,
    });

    await logActivity({
      userId,
      action: 'enlevement.create',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
      details: { reference },
    });

    return { message: "Demande d'enlèvement enregistrée. Un coursier vous sera affecté.", demande };
  };

  static getMesDemandes = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.enCours === 'true' || filters.enCours === true) {
      where.statut = { [Op.in]: ['demande', 'planifie', 'en_cours'] };
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await DemandeEnlevement.findAndCountAll({
      where,
      include: EnlevementService.INCLUDE_DETAIL,
      order: [['dateSouhaitee', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: "Vos demandes d'enlèvement",
      demandes: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getDemandeById = async (userId, id) => {
    const demande = await DemandeEnlevement.findOne({
      where: { id, userId },
      include: EnlevementService.INCLUDE_DETAIL,
    });
    if (!demande) throw new NotFoundError("Demande d'enlèvement introuvable");
    return { message: 'Détail de la demande', demande };
  };

  static modifierDemande = async (userId, id, data) => {
    const demande = await DemandeEnlevement.findOne({ where: { id, userId } });
    if (!demande) throw new NotFoundError("Demande d'enlèvement introuvable");
    if (demande.statut !== 'demande') {
      throw new BadRequestError(
        'Cette demande est déjà prise en charge : contactez le service client'
      );
    }
    if (data.dateSouhaitee) EnlevementService.validerDate(data.dateSouhaitee);

    await demande.update(data);
    return { message: "Demande d'enlèvement mise à jour.", demande };
  };

  static annulerDemande = async (userId, id, motif) => {
    const demande = await DemandeEnlevement.findOne({ where: { id, userId } });
    if (!demande) throw new NotFoundError("Demande d'enlèvement introuvable");
    if (['effectue', 'annule'].includes(demande.statut)) {
      throw new BadRequestError('Cette demande ne peut plus être annulée');
    }
    if (demande.statut === 'en_cours') {
      throw new BadRequestError('Le coursier est déjà en route : contactez le service client');
    }

    await demande.update({ statut: 'annule', motifEchec: motif || 'Annulée par le client' });
    await logActivity({
      userId,
      action: 'enlevement.cancel',
      entite: 'DemandeEnlevement',
      entiteId: demande.id,
    });
    return { message: "Demande d'enlèvement annulée.", demande };
  };

  /** Créneaux proposés au client, avec les dates ouvrées les plus proches. */
  static getCreneauxDisponibles = () => {
    const dates = [];
    const curseur = new Date();
    while (dates.length < 14) {
      curseur.setDate(curseur.getDate() + 1);
      if (![0].includes(curseur.getDay())) dates.push(curseur.toISOString().slice(0, 10));
    }
    return { message: "Créneaux d'enlèvement disponibles", creneaux: CRENEAUX_ENLEVEMENT, dates };
  };
}

module.exports = EnlevementService;
