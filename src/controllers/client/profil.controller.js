const profilService = require('../../services/client/profil.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const get = asyncHandler(async (req, res) => {
  const result = await profilService.getProfil(req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

const update = asyncHandler(async (req, res) => {
  const result = await profilService.updateProfil(req.user.id, req.body);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

const updateAvatar = asyncHandler(async (req, res) => {
  const result = await profilService.updateAvatar(req.user.id, req.file);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

module.exports = { get, update, updateAvatar };
