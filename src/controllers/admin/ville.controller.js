const villeService = require('../../services/admin/ville.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const result = await villeService.getAllVilles(req.query);
  res.status(200).json({ success: true, message: result.message, data: { villes: result.villes } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await villeService.getVilleById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { ville: result.ville } });
});

const create = asyncHandler(async (req, res) => {
  const result = await villeService.createVille(req.body);
  res.status(201).json({ success: true, message: result.message, data: { ville: result.ville } });
});

const update = asyncHandler(async (req, res) => {
  const result = await villeService.updateVille(req.params.id, req.body);
  res.status(200).json({ success: true, message: result.message, data: { ville: result.ville } });
});

module.exports = { getAll, getOne, create, update };
