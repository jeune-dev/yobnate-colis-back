const crypto = require('crypto');
const { Notification, AbonnementSuivi, User } = require('../models');
const logger = require('../config/logger');
const { sendColisStatutEmail } = require('../utils/mailer');

/**
 * Diffusion des notifications.
 *
 * Une notification interne est toujours créée ; l'envoi du courriel dépend des
 * préférences de l'utilisateur. Aucune de ces opérations ne doit interrompre le
 * flux métier appelant : les échecs sont journalisés et absorbés.
 */

/** Notification interne, avec envoi courriel optionnel. */

class NotificationService {
  static notifier = async ({
    userId,
    titre,
    message,
    type = 'systeme',
    niveau = 'info',
    entite = null,
    entiteId = null,
    lienCible = null,
    email = null,
  }) => {
    if (!userId) return null;
    try {
      const notification = await Notification.create({
        userId,
        titre,
        message,
        type,
        niveau,
        entite,
        entiteId,
        lienCible,
      });

      if (email) {
        const user = await User.findByPk(userId, {
          attributes: ['id', 'email', 'prenom', 'notificationsEmail'],
        });
        if (user?.notificationsEmail) await email(user);
      }
      return notification;
    } catch (err) {
      logger.error('Échec de création de notification', { message: err.message, userId, type });
      return null;
    }
  };

  /** Notifie plusieurs destinataires du même message (ex. tous les administrateurs). */
  static notifierPlusieurs = (userIds, contenu) => {
    const uniques = [...new Set(userIds.filter(Boolean))];
    return Promise.all(
      uniques.map((userId) => NotificationService.notifier({ ...contenu, userId }))
    );
  };

  /** Notifie l'ensemble des administrateurs actifs. */
  static notifierAdmins = async (contenu) => {
    try {
      const admins = await User.findAll({
        where: { role: ['admin', 'super_admin'], isActive: true },
        attributes: ['id'],
      });
      return NotificationService.notifierPlusieurs(
        admins.map((a) => a.id),
        contenu
      );
    } catch (err) {
      logger.error('Échec de notification des administrateurs', { message: err.message });
      return [];
    }
  };

  /* ── Abonnements au suivi ───────────────────────────────────────────────── */

  static genererJeton = () => crypto.randomBytes(24).toString('hex');

  /**
   * Inscrit une adresse aux alertes de suivi d'une expédition.
   * Une même adresse ne peut être inscrite qu'une fois par colis et par canal ;
   * une réinscription réactive simplement l'abonnement existant.
   */
  static abonner = async ({
    colisId,
    canal = 'email',
    destination,
    profil = 'destinataire',
    evenements = [],
  }) => {
    const [abonnement, cree] = await AbonnementSuivi.findOrCreate({
      where: { colisId, canal, destination },
      defaults: {
        colisId,
        canal,
        destination,
        profil,
        evenements,
        jetonDesinscription: NotificationService.genererJeton(),
      },
    });
    if (!cree && !abonnement.isActive) await abonnement.update({ isActive: true });
    return abonnement;
  };

  static desabonner = async (jeton) => {
    const abonnement = await AbonnementSuivi.findOne({ where: { jetonDesinscription: jeton } });
    if (!abonnement) return { message: 'Abonnement introuvable ou déjà résilié.', resilie: false };
    await abonnement.update({ isActive: false });
    return {
      message: 'Vous ne recevrez plus de notification pour cette expédition.',
      resilie: true,
    };
  };

  /**
   * Diffuse un événement de suivi aux abonnés du colis.
   * Un abonnement sans filtre reçoit tous les événements publics.
   */
  static diffuserEvenement = async (colis, evenement) => {
    try {
      const abonnements = await AbonnementSuivi.findAll({
        where: { colisId: colis.id, isActive: true },
      });
      const concernes = abonnements.filter(
        (a) => !a.evenements?.length || a.evenements.includes(evenement.codeEvenement)
      );

      await Promise.all(
        concernes.map(async (abonnement) => {
          if (abonnement.canal === 'email') {
            await sendColisStatutEmail(abonnement.destination, colis, evenement);
          }
          // Le canal SMS est branché sur le futur agrégat opérateur ; l'abonnement est
          // enregistré dès maintenant pour ne rien perdre de l'historique client.
          await abonnement.update({ dernierEnvoiAt: new Date() });
        })
      );

      return concernes.length;
    } catch (err) {
      logger.error('Échec de diffusion aux abonnés du suivi', {
        message: err.message,
        colisId: colis.id,
      });
      return 0;
    }
  };
}

module.exports = NotificationService;
