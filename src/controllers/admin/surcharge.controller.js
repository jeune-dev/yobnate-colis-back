const service = require('../../services/admin/surcharge.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllSurcharges(req.query);
  return ok(res, { surcharges: result.surcharges }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getSurchargeById(req.params.id);
  return ok(res, { surcharge: result.surcharge }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createSurcharge(req.body, req.user.id);
  return created(res, { surcharge: result.surcharge }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateSurcharge(req.params.id, req.body, req.user.id);
  return ok(res, { surcharge: result.surcharge }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.toggleSurcharge(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { surcharge: result.surcharge }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteSurcharge(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.simuler = asyncHandler(async (req, res) => {
  const result = await service.simuler(req.body);
  return ok(res, { simulation: result.simulation }, result.message);
});
