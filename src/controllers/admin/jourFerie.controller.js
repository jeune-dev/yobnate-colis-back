const service = require('../../services/admin/jourFerie.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllJoursFeries(req.query);
  return ok(res, { joursFeries: result.joursFeries }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createJourFerie(req.body, req.user.id);
  return created(res, { jourFerie: result.jourFerie }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateJourFerie(req.params.id, req.body, req.user.id);
  return ok(res, { jourFerie: result.jourFerie }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteJourFerie(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.importer = asyncHandler(async (req, res) => {
  const result = await service.importerCalendrier(req.body.jours, req.user.id);
  return created(res, { joursFeries: result.joursFeries, ignores: result.ignores }, result.message);
});
