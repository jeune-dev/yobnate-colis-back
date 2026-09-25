const { User, Colis } = require('../../models');
const { genererCodeParrainage } = require('../../utils/referenceGenerator');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');

/** Espace personnel du client : profil, préférences et compte professionnel. */

class ProfilService {
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

    const uploaded = await uploadToCloudinary(file.buffer, { folder: 'yobnate-express/avatars' });
    if (user.avatarPublicId) await deleteFromCloudinary(user.avatarPublicId);

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

    const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const fichier = await uploadToCloudinary(file.buffer, {
      folder: 'yobnate-express/justificatifs',
      resourceType,
    });
    if (user.justificatifProPublicId) {
      await deleteFromCloudinary(user.justificatifProPublicId).catch(() => {});
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
