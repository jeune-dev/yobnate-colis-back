const service = require('../../services/admin/ville.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllVilles(req.query, req.query);
  return ok(res, { villes: result.villes, pagination: result.pagination }, result.message);
});

exports.getPubliques = asyncHandler(async (req, res) => {
  const result = await service.getVillesPubliques(req.query);
  return ok(res, { villes: result.villes }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getVilleById(req.params.id);
  return ok(res, { ville: result.ville }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createVille(req.body, req.user.id);
  return created(res, { ville: result.ville }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateVille(req.params.id, req.body, req.user.id);
  return ok(res, { ville: result.ville }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.toggleVille(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { ville: result.ville }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteVille(req.params.id, req.user.id);
  return ok(res, null, result.message);
});
