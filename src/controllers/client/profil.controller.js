const profilService = require('../../services/client/profil.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.get = asyncHandler(async (req, res) => {
  const result = await profilService.getProfil(req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await profilService.updateProfil(req.user.id, req.body);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

exports.updateAvatar = asyncHandler(async (req, res) => {
  const result = await profilService.updateAvatar(req.user.id, req.file);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const result = await profilService.updatePreferences(req.user.id, req.body);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});
