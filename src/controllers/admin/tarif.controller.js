const tarifService = require('../../services/admin/tarif.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const result = await tarifService.getAllTarifs(req.query, req.query);
  res.status(200).json({ success: true, message: result.message, data: { tarifs: result.tarifs, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await tarifService.getTarifById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { tarif: result.tarif } });
});

const create = asyncHandler(async (req, res) => {
  const result = await tarifService.createTarif(req.body);
  res.status(201).json({ success: true, message: result.message, data: { tarif: result.tarif } });
});

const update = asyncHandler(async (req, res) => {
  const result = await tarifService.updateTarif(req.params.id, req.body);
  res.status(200).json({ success: true, message: result.message, data: { tarif: result.tarif } });
});

const calculerPrix = asyncHandler(async (req, res) => {
  const result = await tarifService.calculerPrix(req.body);
  res.status(200).json({ success: true, message: result.message, data: result.simulation });
});

module.exports = { getAll, getOne, create, update, calculerPrix };
