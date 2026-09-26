const service = require('../service/appVersion.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

/** Public : appelé par l'application mobile au démarrage. */
exports.getActive = asyncHandler(async (req, res) => {
  const result = await service.getActive(req.query.plateforme);
  return ok(res, { version: result.version }, result.message);
});

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.lister();
  return ok(res, { versions: result.versions }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user.id);
  return created(res, { version: result.version }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.modifier(req.params.id, req.body, req.user.id);
  return ok(res, { version: result.version }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.supprimer(req.params.id, req.user.id);
  return ok(res, null, result.message);
});
