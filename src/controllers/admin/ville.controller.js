const villeService = require('../../services/admin/ville.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

const getAll = asyncHandler(async (req, res) => {
  const result = await villeService.getAllVilles(req.query, req.query);
  return ok(res, { villes: result.villes, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await villeService.getVilleById(req.params.id);
  return ok(res, { ville: result.ville }, result.message);
});

const create = asyncHandler(async (req, res) => {
  const result = await villeService.createVille(req.body);
  return created(res, { ville: result.ville }, result.message);
});

const update = asyncHandler(async (req, res) => {
  const result = await villeService.updateVille(req.params.id, req.body);
  return ok(res, { ville: result.ville }, result.message);
});

module.exports = { getAll, getOne, create, update };
