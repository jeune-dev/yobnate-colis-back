const service = require('../../services/admin/serviceExpedition.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllServices(req.query);
  return ok(res, { services: result.services }, result.message);
});

exports.getPublics = asyncHandler(async (req, res) => {
  const result = await service.getServicesPublics();
  return ok(res, { services: result.services }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getServiceById(req.params.id);
  return ok(res, { service: result.service }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createService(req.body, req.user.id);
  return created(res, { service: result.service }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateService(req.params.id, req.body, req.user.id);
  return ok(res, { service: result.service }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.toggleService(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { service: result.service }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteService(req.params.id, req.user.id);
  return ok(res, null, result.message);
});
