const { User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../middlewares/uploadService');

const getProfil = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('Utilisateur introuvable');
  return { message: 'Profil récupéré', utilisateur: user.toSafeJSON() };
};

const updateProfil = async (userId, data) => {
  const user = await User.findByPk(userId);
  await user.update(data);
  return { message: 'Profil mis à jour.', utilisateur: user.toSafeJSON() };
};

const updateAvatar = async (userId, file) => {
  if (!file) throw ApiError.badRequest('Aucune image fournie');
  const user = await User.findByPk(userId);

  const uploaded = await uploadToCloudinary(file.buffer, { folder: 'yobnate-colis/avatars' });
  if (user.avatarPublicId) await deleteFromCloudinary(user.avatarPublicId);

  await user.update({ avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId });
  return { message: 'Photo de profil mise à jour.', utilisateur: user.toSafeJSON() };
};

module.exports = { getProfil, updateProfil, updateAvatar };
