const service = require('../../services/admin/pointCollecte.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllPoints(req.query, req.query);
  return ok(res, { points: result.points, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getPointById(req.params.id);
  return ok(res, { point: result.point }, result.message);
});

exports.getReseau = asyncHandler(async (req, res) => {
  const result = await service.getReseauParPays();
  return ok(res, { reseau: result.reseau }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createPoint(req.body, req.user.id);
  return created(res, { point: result.point }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updatePoint(req.params.id, req.body, req.user.id);
  return ok(res, { point: result.point }, result.message);
});

exports.toggle = asyncHandler(async (req, res) => {
  const result = await service.togglePoint(req.params.id, req.body.isActive, req.user.id);
  return ok(res, { point: result.point }, result.message);
});

exports.maintenance = asyncHandler(async (req, res) => {
  const result = await service.setMaintenance(req.params.id, req.body, req.user.id);
  return ok(res, { point: result.point }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.deletePoint(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.transfertStock = asyncHandler(async (req, res) => {
  const result = await service.transfererStock(req.params.id, req.body.destinationId, req.user.id);
  return ok(res, { nbColis: result.nbColis }, result.message);
});

exports.photo = asyncHandler(async (req, res) => {
  const result = await service.updatePhoto(req.params.id, req.file, req.user.id);
  return ok(res, { point: result.point }, result.message);
});

exports.stock = asyncHandler(async (req, res) => {
  const result = await service.getStock(req.params.id, req.query, req.query);
  return ok(
    res,
    { point: result.point, colis: result.colis, pagination: result.pagination },
    result.message
  );
});

exports.statistiques = asyncHandler(async (req, res) => {
  const result = await service.getStatistiques(req.params.id, req.query);
  return ok(res, { statistiques: result.statistiques }, result.message);
});
