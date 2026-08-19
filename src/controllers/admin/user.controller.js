const userService = require('../../services/admin/user.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

const getAll = asyncHandler(async (req, res) => {
  const { search, isActive, sortBy, sortOrder, page, limit } = req.query;
  const result = await userService.getAllUsers({ search, isActive, sortBy, sortOrder }, { page, limit });
  return ok(res, { utilisateurs: result.utilisateurs, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await userService.getUserById(req.params.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

const getColis = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await userService.getUserColis(req.params.id, { page, limit });
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

const setActive = (isActive) => asyncHandler(async (req, res) => {
  const result = await userService.setActive(req.params.id, isActive, req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});

const activer = setActive(true);
const desactiver = setActive(false);

module.exports = { getAll, getOne, getColis, activer, desactiver };
