const { User, Colis, UserOtp } = require('../../../models');
const { genererCodeParrainage } = require('../../../utils/referenceGenerator');
const notificationService = require('../../notification/service/notification.service');
const parametreService = require('../../parametre/service/parametre.service');
const {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} = require('../../../errors/AppError');
const whatsapp = require('../../../infrastructure/whatsapp');
const AuthService = require('../../auth/service/auth.service');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const { uploadFile, deleteFile } = require('../../../infrastructure/r2.service');

/** Espace personnel du client : profil, préférences et compte professionnel. */

class ProfilService {
  /* ── Vérification du numéro de téléphone ───────────────────────────────── */

  /**
   * Envoie un code à 6 chiffres par WhatsApp au numéro du compte. Le numéro
   * prouvé ouvre l'accès aux colis dont le compte est destinataire.
   */
  static demanderCodeTelephone = async (userId) => {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'telephone', 'telephoneVerifie'],
    });
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    if (user.telephoneVerifie) return { message: 'Votre numéro est déjà vérifié.' };
    if (!whatsapp.estConfigure()) {
      throw new ServiceUnavailableError(
        'La vérification du numéro est momentanément indisponible. Réessayez plus tard.'
      );
    }

    const code = AuthService.generateOtpCode();
    await UserOtp.update(
      { isUsed: true },
      { where: { userId, type: 'verification_telephone', isUsed: false } }
    );
    await UserOtp.create({
      userId,
      codeHash: AuthService.sha256(code),
      type: 'verification_telephone',
      expiresAt: new Date(Date.now() + AuthService.OTP_TTL_MS),
    });
    const envoye = await whatsapp.envoyerWhatsapp({
      telephone: user.telephone,
      message: `Yobante Colis — votre code de vérification : ${code}. Il expire dans 10 minutes.`,
    });
    if (!envoye)
      throw new ServiceUnavailableError("Le code n'a pas pu être envoyé. Réessayez plus tard.");
    return { message: 'Un code de vérification vous a été envoyé par WhatsApp.' };
  };

  /** Vérifie le code ; au-delà de 5 essais erronés, un nouveau code doit être demandé. */
  static verifierTelephone = async (userId, code) => {
    const invalide = new BadRequestError('Code invalide ou expiré');
    const otp = await UserOtp.findOne({
      where: { userId, type: 'verification_telephone', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otp || otp.expiresAt < new Date()) throw invalide;

    if (!AuthService.empreintesEgales(otp.codeHash, AuthService.sha256(String(code)))) {
      await otp.increment('tentatives');
      await otp.reload({ attributes: ['id', 'tentatives'] });
      if (otp.tentatives >= AuthService.OTP_MAX_TENTATIVES) await otp.update({ isUsed: true });
      throw invalide;
    }

    const [consommes] = await UserOtp.update(
      { isUsed: true },
      { where: { id: otp.id, isUsed: false } }
    );
    if (!consommes) throw invalide;
    await User.update({ telephoneVerifie: true }, { where: { id: userId } });
    await logActivity({
      userId,
      action: 'profil.telephone_verifie',
      entite: 'User',
      entiteId: userId,
    });
    return { message: 'Votre numéro de téléphone est vérifié.' };
  };

  static getProfil = async (userId) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    return { message: 'Profil récupéré', utilisateur: user.toSafeJSON() };
  };

  static updateProfil = async (userId, data) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    // Le passage à un compte entreprise ne s'accompagne d'aucune remise par défaut :
    // celle-ci reste à la main de l'administrateur, après vérification du dossier.
    const {
      remiseContractuelle: _ignoree,
      paiementDiffereAutorise: _ignoree2,
      justificatifProValide: _ignoree3,
      ...donneesAutorisees
    } = data;
    // Un nouveau numéro de téléphone doit être prouvé à nouveau (accès aux colis reçus)
    if (donneesAutorisees.telephone && donneesAutorisees.telephone !== user.telephone) {
      donneesAutorisees.telephoneVerifie = false;
    }
    // Un changement de numéro NINEA / SIRET impose un nouveau contrôle du justificatif
    if (
      donneesAutorisees.numeroIdentificationFiscale !== undefined &&
      donneesAutorisees.numeroIdentificationFiscale !== user.numeroIdentificationFiscale
    ) {
      donneesAutorisees.justificatifProValide = false;
    }

    await user.update(donneesAutorisees);
    return { message: 'Profil mis à jour.', utilisateur: user.toSafeJSON() };
  };

  static updateAvatar = async (userId, file) => {
    if (!file) throw new BadRequestError('Aucune image fournie');
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    const uploaded = await uploadFile(file.buffer, { folder: 'yobnate-express/avatars' });
    if (user.avatarPublicId) await deleteFile(user.avatarPublicId);

    await user.update({ avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId });
    return { message: 'Photo de profil mise à jour.', utilisateur: user.toSafeJSON() };
  };

  static updatePreferences = async (
    userId,
    { notificationsEmail, notificationsSms, notificationsWhatsapp, notificationsPush }
  ) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    await user.update({
      ...(notificationsEmail !== undefined && { notificationsEmail }),
      ...(notificationsSms !== undefined && { notificationsSms }),
      ...(notificationsWhatsapp !== undefined && { notificationsWhatsapp }),
      ...(notificationsPush !== undefined && { notificationsPush }),
    });
    return { message: 'Préférences de notification mises à jour.', utilisateur: user.toSafeJSON() };
  };

  /**
   * Justificatif professionnel (NINEA ou Kbis) : transmis par le client, contrôlé
   * par l'administrateur qui accorde alors le tarif préférentiel.
   */
  static deposerJustificatifPro = async (userId, file) => {
    if (!file) throw new BadRequestError('Aucun justificatif fourni');
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    if (!user.numeroIdentificationFiscale) {
      throw new BadRequestError("Renseignez d'abord votre numéro NINEA ou SIRET dans votre profil");
    }
    const fichier = await uploadFile(file.buffer, {
      folder: 'yobnate-express/justificatifs',
    });
    if (user.justificatifProPublicId) {
      await deleteFile(user.justificatifProPublicId);
    }
    await user.update({
      justificatifProUrl: fichier.url,
      justificatifProPublicId: fichier.publicId,
      justificatifProValide: false,
    });

    await notificationService.notifierAdmins({
      titre: 'Justificatif professionnel à contrôler',
      message: `${user.nomComplet} (${user.numeroIdentificationFiscale}) demande le tarif professionnel.`,
      type: 'systeme',
      entite: 'User',
      entiteId: user.id,
      lienCible: `/admin/users/${user.id}`,
    });
    return {
      message: 'Justificatif transmis. Le tarif professionnel sera appliqué après vérification.',
      utilisateur: user.toSafeJSON(),
    };
  };

  /** Espace parrainage : code à partager, crédit disponible et filleuls. */
  static getParrainage = async (userId) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    if (!user.codeParrainage) {
      for (let i = 0; i < 5 && !user.codeParrainage; i += 1) {
        const code = genererCodeParrainage();
        if (!(await User.count({ where: { codeParrainage: code } }))) {
          await user.update({ codeParrainage: code });
        }
      }
    }

    const [parametres, filleuls] = await Promise.all([
      parametreService.chargerTous(),
      User.findAll({
        where: { parrainId: userId },
        attributes: ['id', 'prenom', 'createdAt', 'parrainageRecompense'],
        order: [['createdAt', 'DESC']],
      }),
    ]);
    const aExpedie = await Colis.count({ where: { userId } });

    return {
      message: 'Votre parrainage',
      parrainage: {
        actif: parametres.parrainage_actif,
        code: user.codeParrainage,
        creditDisponibleEur: Number(user.creditParrainage),
        gainParFilleulEur: Number(parametres.parrainage_gain_parrain_eur),
        remiseFilleulPourcent: Number(parametres.parrainage_remise_filleul_pourcent),
        bonusBienvenueDisponible: Boolean(
          user.parrainId && !user.parrainageRecompense && !aExpedie
        ),
        filleuls: filleuls.map((f) => ({
          prenom: f.prenom,
          inscritLe: f.createdAt,
          premiereExpedition: f.parrainageRecompense,
        })),
      },
    };
  };

  static updateDeviceToken = async (userId, { token, platform }) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    await user.update({ deviceToken: token, devicePlatform: platform });
    return { message: 'Token de notification enregistré.' };
  };
}

module.exports = ProfilService;
