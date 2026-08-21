const { User } = require('../../models');
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
      ...donneesAutorisees
    } = data;

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

  static updatePreferences = async (userId, { notificationsEmail, notificationsSms }) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    await user.update({
      ...(notificationsEmail !== undefined && { notificationsEmail }),
      ...(notificationsSms !== undefined && { notificationsSms }),
    });
    return { message: 'Préférences de notification mises à jour.', utilisateur: user.toSafeJSON() };
  };
}

module.exports = ProfilService;
