const service = require('../../services/admin/tarif.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllTarifs(req.query, req.query);
  return ok(res, { tarifs: result.tarifs, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getTarifById(req.params.id);
  return ok(res, { tarif: result.tarif }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createTarif(req.body, req.user.id);
  return created(res, { tarif: result.tarif }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateTarif(req.params.id, req.body, req.user.id);
  return ok(res, { tarif: result.tarif }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deleteTarif(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.creerGrille = asyncHandler(async (req, res) => {
  const result = await service.creerGrille(req.body, req.user.id);
  return created(res, { tarifs: result.tarifs }, result.message);
});

exports.audit = asyncHandler(async (req, res) => {
  const result = await service.auditerGrille();
  return ok(res, { conforme: result.conforme, anomalies: result.anomalies }, result.message);
});
