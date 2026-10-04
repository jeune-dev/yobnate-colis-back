const { Op } = require('sequelize');
const { DemandeContact, User } = require('../../../models');
const { ConflictError, NotFoundError } = require('../../../errors/AppError');
const { paginate, paginateResult } = require('../../../utils/paginate');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const notificationService = require('../../notification/service/notification.service');
const { sendReponseDemandeContactEmail } = require('../../../infrastructure/mailer');

/**
 * Demandes de contact des sites vitrines (Yobanté Rek et Yobanté Boutique).
 *
 * Le visiteur dépose sa demande sans compte ; un administrateur la consulte puis
 * y répond (objet + réponse) : la réponse est conservée et envoyée par email au
 * demandeur.
 */
class DemandeContactService {
  static charger = async (id) => {
    const demande = await DemandeContact.findByPk(id, {
      include: [{ model: User, as: 'traiteur', attributes: ['id', 'nom', 'prenom'] }],
    });
    if (!demande) throw new NotFoundError('Demande introuvable');
    return demande;
  };

  /** Dépôt public. */
  static deposer = async (data, ip) => {
    const demande = await DemandeContact.create({
      source: data.source,
      prenom: data.prenom,
      nom: data.nom,
      email: data.email,
      telephone: data.telephone || null,
      sujet: data.sujet || null,
      message: data.message,
      ip,
    });
    await notificationService.notifierAdmins({
      titre: 'Nouvelle demande de contact',
      message: `${demande.prenom} ${demande.nom} a écrit depuis le site ${demande.source === 'boutique' ? 'Boutique' : 'Rek'}.`,
      type: 'systeme',
      niveau: 'info',
      entite: 'DemandeContact',
      entiteId: demande.id,
      lienCible: '/admin/demandes-contact',
    });
    return {
      message: 'Votre demande est bien enregistrée. Nous vous répondrons très prochainement.',
    };
  };

  static lister = async (filtres = {}) => {
    const where = {};
    if (filtres.statut) where.statut = filtres.statut;
    if (filtres.source) where.source = filtres.source;
    if (filtres.q) {
      const motif = `%${filtres.q.replace(/[%_\\]/g, '\\$&')}%`;
      where[Op.or] = ['prenom', 'nom', 'email', 'telephone', 'sujet', 'message'].map((champ) => ({
        [champ]: { [Op.iLike]: motif },
      }));
    }
    const { limit, offset } = paginate(filtres);
    const { count, rows } = await DemandeContact.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });
    return {
      message: 'Demandes de contact',
      demandes: rows,
      pagination: paginateResult(count, filtres.page, filtres.limit),
    };
  };

  static detail = async (id) => ({
    message: 'Demande de contact',
    demande: await DemandeContactService.charger(id),
  });

  /**
   * Réponse de l'administrateur. La demande est marquée « traitée » ; le courriel
   * part en arrière-plan (un échec d'envoi est journalisé, il n'annule pas la réponse).
   */
  static traiter = async (id, { objet, reponse }, adminId) => {
    const demande = await DemandeContactService.charger(id);
    if (demande.statut !== 'en_attente') throw new ConflictError('Cette demande est déjà traitée');

    await demande.update({
      statut: 'traitee',
      objetReponse: objet,
      reponse,
      traitePar: adminId,
      traiteLe: new Date(),
    });
    await sendReponseDemandeContactEmail(demande, { objet, reponse });
    await logActivity({
      userId: adminId,
      action: 'admin.demande_contact.traiter',
      entite: 'DemandeContact',
      entiteId: id,
    });
    return {
      message: `Réponse enregistrée et envoyée à ${demande.email}.`,
      demande: await DemandeContactService.charger(id),
    };
  };
}

module.exports = DemandeContactService;
