const userService = require('../../services/admin/user.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { search, isActive, sortBy, sortOrder, page, limit } = req.query;
  const result = await userService.getAllUsers({ search, isActive, sortBy, sortOrder }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { utilisateurs: result.utilisateurs, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await userService.getUserById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

const getColis = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await userService.getUserColis(req.params.id, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis, pagination: result.pagination } });
});

const activer = asyncHandler(async (req, res) => {
  const result = await userService.setActive(req.params.id, true, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

const desactiver = asyncHandler(async (req, res) => {
  const result = await userService.setActive(req.params.id, false, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

module.exports = { getAll, getOne, getColis, activer, desactiver };
