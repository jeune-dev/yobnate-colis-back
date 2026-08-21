const service = require('../../services/admin/user.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllUsers(req.query, req.query);
  return ok(
    res,
    { utilisateurs: result.utilisateurs, pagination: result.pagination },
    result.message
  );
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getUserById(req.params.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

exports.getColis = asyncHandler(async (req, res) => {
  const result = await service.getUserColis(req.params.id, req.query);
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.setActive(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

exports.conditionsCommerciales = asyncHandler(async (req, res) => {
  const result = await service.definirConditionsCommerciales(req.params.id, req.body, req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});
