const crypto = require('crypto');
const motDePasse = require('../../../utils/motDePasse');
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Adresse,
  Colis,
  Facture,
  Paiement,
  Reclamation,
  Notification,
  RefreshToken,
  UserOtp,
  DemandeSuppression,
} = require('../../../models');
const { STATUTS_TERMINAUX } = require('../../../config/colis');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../errors/AppError');
const JWTUtils = require('../../../utils/jwtUtils');
const { deleteFile } = require('../../../infrastructure/r2.service');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const notificationService = require('../../notification/service/notification.service');

/**
 * Cycle de vie du compte client (RGPD) — repris de Sign (export, suppression
 * par pseudonymisation) et de Widjila (demande publique de suppression).
 *
 * La suppression ne détruit pas les expéditions ni les factures : elles
 * relèvent d'obligations comptables et douanières. Les données personnelles du
 * COMPTE sont en revanche remplacées par des valeurs neutres, ses sessions
 * révoquées et ses données annexes (adresses, notifications) effacées.
 */
class CompteService {
  /* ── Export (droit à la portabilité, art. 20) ──────────────────────────── */

  static exporter = async (userId) => {
    const user = await User.findByPk(userId);
    if (!user || user.supprimeLe) throw new NotFoundError('Compte introuvable');

    const [adresses, colis, factures, paiements, reclamations] = await Promise.all([
      Adresse.findAll({ where: { userId } }),
      Colis.findAll({
        where: { userId },
        attributes: [
          'reference',
          'statut',
          'categorie',
          'paysDepart',
          'paysArrivee',
          'expediteurNom',
          'destinataireNom',
          'destinataireTelephone',
          'adresseLivraison',
          'montantTotal',
          'devise',
          'createdAt',
        ],
        order: [['createdAt', 'DESC']],
      }),
      Facture.findAll({
        where: { userId },
        attributes: ['reference', 'statut', 'montantTotal', 'montantPaye', 'devise', 'createdAt'],
      }),
      Paiement.findAll({
        where: { userId },
        attributes: ['reference', 'montant', 'devise', 'methode', 'statut', 'payeAt'],
      }),
      Reclamation.findAll({ where: { userId } }),
    ]);

    await logActivity({ userId, action: 'compte.export', entite: 'User', entiteId: userId });
    return {
      message: 'Export de vos données personnelles',
      export: {
        genereLe: new Date().toISOString(),
        profil: user.toSafeJSON(),
        adresses,
        expeditions: colis,
        factures,
        paiements,
        reclamations,
      },
    };
  };

  /* ── Suppression (droit à l'effacement, art. 17) ───────────────────────── */

  /**
   * Pseudonymise le compte. Refusée tant qu'une expédition est en cours : le
   * client perdrait le suivi d'un colis encore dans le réseau.
   */
  static pseudonymiser = async (userId, { auteurId = userId, motif = null } = {}) => {
    // Empreinte inutilisable calculée AVANT la transaction : bcrypt (~250 ms de CPU,
    // à concurrence bornée) ne retient ni la connexion ni le verrou du compte.
    const empreinteNeutre = await motDePasse.hacher(crypto.randomBytes(32).toString('hex'));
    const avatar = await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user || user.supprimeLe) throw new NotFoundError('Compte introuvable');
      if (user.role !== 'client') {
        throw new BadRequestError('Seul un compte client peut être supprimé de cette façon');
      }

      const enCours = await Colis.count({
        where: { userId, statut: { [Op.notIn]: STATUTS_TERMINAUX } },
        transaction: t,
      });
      if (enCours) {
        throw new ConflictError(
          `${enCours} expédition(s) en cours : la suppression sera possible une fois vos colis livrés ou annulés`
        );
      }

      const neutre = user.id.replace(/-/g, '');
      const ancienAvatar = user.avatarPublicId;
      await user.update(
        {
          nom: 'Compte',
          prenom: 'Supprimé',
          email: `supprime-${neutre}@yobante.invalid`,
          telephone: `X${neutre.slice(0, 19)}`,
          telephoneSecondaire: null,
          password: empreinteNeutre,
          adresse: null,
          codePostal: null,
          raisonSociale: null,
          numeroIdentificationFiscale: null,
          numeroTvaIntracom: null,
          justificatifProUrl: null,
          justificatifProPublicId: null,
          avatarUrl: null,
          avatarPublicId: null,
          codeParrainage: null,
          deviceToken: null,
          devicePlatform: null,
          notificationsEmail: false,
          notificationsSms: false,
          notificationsWhatsapp: false,
          notificationsPush: false,
          emailVerifie: false,
          telephoneVerifie: false,
          isActive: false,
          supprimeLe: new Date(),
          tokenVersion: user.tokenVersion + 1,
        },
        { transaction: t }
      );
      await Promise.all([
        Adresse.destroy({ where: { userId }, transaction: t }),
        Notification.destroy({ where: { userId }, transaction: t }),
        RefreshToken.destroy({ where: { userId }, transaction: t }),
        UserOtp.destroy({ where: { userId }, transaction: t }),
      ]);
      return ancienAvatar;
    });

    JWTUtils.invaliderCache(userId);
    // Échec journalisé par deleteFile, sans bloquer la suppression du compte
    if (avatar) await deleteFile(avatar);
    await logActivity({
      userId: auteurId,
      action: 'compte.suppression',
      entite: 'User',
      entiteId: userId,
      details: { motif },
    });
    return { message: 'Votre compte a été supprimé. Vos expéditions passées restent archivées.' };
  };

  /** Suppression demandée par le titulaire connecté : le mot de passe est redemandé. */
  static supprimerMonCompte = async (userId, { password, motif }) => {
    const user = await User.findByPk(userId, { attributes: ['id', 'password'] });
    if (!user) throw new NotFoundError('Compte introuvable');
    if (!(await motDePasse.comparer(String(password || ''), user.password))) {
      throw new BadRequestError('Mot de passe incorrect');
    }
    return CompteService.pseudonymiser(userId, { motif });
  };

  /* ── Demande publique (Google Play) ─────────────────────────────────────── */

  static deposerDemande = async ({ email, motif }, ip) => {
    const demande = await DemandeSuppression.create({ email, motif: motif || null, ip });
    await notificationService.notifierAdmins({
      titre: 'Demande de suppression de compte',
      message: `Demande reçue pour ${email}. Réponse attendue sous 30 jours (RGPD).`,
      type: 'systeme',
      niveau: 'alerte',
      entite: 'DemandeSuppression',
      entiteId: demande.id,
      lienCible: '/admin/suppressions-compte',
    });
    // Réponse identique que le compte existe ou non : aucune énumération possible
    return {
      message:
        'Votre demande est enregistrée. Elle sera traitée sous 30 jours ; un contrôle d’identité pourra vous être demandé.',
    };
  };

  static listerDemandes = async ({ statut } = {}) => ({
    message: 'Demandes de suppression de compte',
    demandes: await DemandeSuppression.findAll({
      where: statut ? { statut } : {},
      order: [['createdAt', 'ASC']],
    }),
  });

  /**
   * Traitement par un administrateur. Accepter une demande pseudonymise le
   * compte correspondant à l'adresse (s'il existe) ; l'identité du demandeur
   * doit avoir été vérifiée au préalable.
   */
  static traiterDemande = async (id, { statut, noteAdmin }, adminId) => {
    const demande = await DemandeSuppression.findByPk(id);
    if (!demande) throw new NotFoundError('Demande introuvable');
    if (demande.statut !== 'en_attente') throw new ConflictError('Cette demande est déjà traitée');

    let compteSupprime = false;
    if (statut === 'traitee') {
      const user = await User.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('email')),
          demande.email.toLowerCase()
        ),
      });
      if (user && !user.supprimeLe) {
        await CompteService.pseudonymiser(user.id, {
          auteurId: adminId,
          motif: 'Demande publique',
        });
        compteSupprime = true;
      }
    }

    await demande.update({
      statut,
      noteAdmin: noteAdmin || null,
      traitePar: adminId,
      traiteLe: new Date(),
    });
    await logActivity({
      userId: adminId,
      action: `admin.suppression_compte.${statut}`,
      entite: 'DemandeSuppression',
      entiteId: id,
      details: { compteSupprime },
    });
    return {
      message: compteSupprime
        ? 'Demande traitée : le compte a été supprimé.'
        : statut === 'traitee'
          ? 'Demande traitée : aucun compte actif ne correspond à cette adresse.'
          : 'Demande rejetée.',
      demande,
      compteSupprime,
    };
  };
}

module.exports = CompteService;
