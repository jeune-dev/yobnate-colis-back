const profilService = require('../../services/client/profil.service');
const asyncHandler = require('../../utils/asyncHandler');

const get = asyncHandler(async (req, res) => {
  const result = await profilService.getProfil(req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

const update = asyncHandler(async (req, res) => {
  const result = await profilService.updateProfil(req.user.id, req.body);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

const updateAvatar = asyncHandler(async (req, res) => {
  const result = await profilService.updateAvatar(req.user.id, req.file);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

module.exports = { get, update, updateAvatar };
