const service = require('../../services/admin/personnel.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllPersonnel(req.query, req.query);
  return ok(res, { personnel: result.personnel, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getPersonnelById(req.params.id);
  return ok(res, { personne: result.personne }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createPersonnel(req.body, req.user.id);
  return created(res, { personne: result.personne }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updatePersonnel(req.params.id, req.body, req.user.id);
  return ok(res, { personne: result.personne }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.setActive(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { personne: result.personne }, result.message);
});

exports.coursiersDisponibles = asyncHandler(async (req, res) => {
  const result = await service.getCoursiersDisponibles(req.query.pays);
  return ok(res, { coursiers: result.coursiers }, result.message);
});
