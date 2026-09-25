const service = require('../../services/admin/emballage.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  return ok(res, { emballages: result.emballages }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body, req.user.id);
  return created(res, { emballage: result.emballage }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body, req.user.id);
  return ok(res, { emballage: result.emballage }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.ajouterPhotos = asyncHandler(async (req, res) => {
  const result = await service.ajouterPhotos(req.params.id, req.files || [], req.user.id);
  return ok(res, { emballage: result.emballage }, result.message);
});

exports.retirerPhoto = asyncHandler(async (req, res) => {
  const result = await service.retirerPhoto(req.params.id, req.body.publicId, req.user.id);
  return ok(res, { emballage: result.emballage }, result.message);
});
