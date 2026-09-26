const crypto = require('crypto');
const { Notification, AbonnementSuivi, User } = require('../models');
const logger = require('../config/logger');
const { sendColisStatutEmail, URL_PUBLIQUE } = require('../utils/mailer');
const { envoyerPush } = require('../utils/push');
const { envoyerWhatsapp } = require('../utils/whatsapp');
const arrierePlan = require('../utils/arrierePlan');

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

      const user = await User.findByPk(userId, {
        attributes: [
          'id',
          'email',
          'prenom',
          'notificationsEmail',
          'notificationsPush',
          'deviceToken',
        ],
      });
      // Le courriel part par la file d'arrière-plan (voir utils/mailer)
      if (email && user?.notificationsEmail) await email(user);
      // Notification push : appel HTTP externe, hors du chemin de la requête
      if (user?.deviceToken && user.notificationsPush) {
        arrierePlan.lancer('push', () =>
          envoyerPush({
            token: user.deviceToken,
            titre,
            message,
            donnees: { type, entite, entiteId, lienCible },
          })
        );
      }
      return notification;
    } catch (err) {
      logger.error('Échec de création de notification', { message: err.message, userId, type });
      return null;
    }
  };

  /**
   * Message WhatsApp sur les étapes clés du suivi (réception, arrivée à Dakar,
   * livraison…), selon le paramétrage et les préférences du client.
   */
  static notifierWhatsappSuivi = async (colis, evenement, parametres) => {
    try {
      if (!parametres?.whatsapp_notifications_actives) return false;
      if (!(parametres.evenements_whatsapp || []).includes(evenement.codeEvenement)) return false;
      const client = await User.findByPk(colis.userId, {
        attributes: ['id', 'telephone', 'notificationsWhatsapp'],
      });
      if (!client?.notificationsWhatsapp) return false;
      const lien = URL_PUBLIQUE ? ` Suivi : ${URL_PUBLIQUE}/suivi/${colis.reference}` : '';
      arrierePlan.lancer('whatsapp', () =>
        envoyerWhatsapp({
          telephone: colis.expediteurTelephone || client.telephone,
          message:
            `Yobnate — Colis ${colis.reference} : ${evenement.libelle}` +
            `${evenement.lieu ? ` (${evenement.lieu})` : ''}.${lien}`,
        })
      );
      return true;
    } catch (err) {
      logger.error('Notification WhatsApp non délivrée', { message: err.message });
      return false;
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
          if (abonnement.canal === 'whatsapp') {
            arrierePlan.lancer('whatsapp', () =>
              envoyerWhatsapp({
                telephone: abonnement.destination,
                message: `Yobnate — Colis ${colis.reference} : ${evenement.libelle}.`,
              })
            );
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
