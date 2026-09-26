const service = require('../service/annonce.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  return ok(res, { annonces: result.annonces }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body, req.user.id);
  return created(res, { annonce: result.annonce }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body, req.user.id);
  return ok(res, { annonce: result.annonce }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.image = asyncHandler(async (req, res) => {
  const result = await service.definirImage(req.params.id, req.file, req.user.id);
  return ok(res, { annonce: result.annonce }, result.message);
});
