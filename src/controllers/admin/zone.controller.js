const service = require('../../services/admin/zone.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllZones(req.query, req.query);
  return ok(res, { zones: result.zones, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getZoneById(req.params.id);
  return ok(res, { zone: result.zone }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createZone(req.body, req.user.id);
  return created(res, { zone: result.zone }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateZone(req.params.id, req.body, req.user.id);
  return ok(res, { zone: result.zone }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteZone(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.affecterVilles = asyncHandler(async (req, res) => {
  const result = await service.affecterVilles(req.params.id, req.body.villeIds, req.user.id);
  return ok(res, null, result.message);
});

exports.retirerVilles = asyncHandler(async (req, res) => {
  const result = await service.retirerVilles(req.params.id, req.body.villeIds, req.user.id);
  return ok(res, null, result.message);
});
