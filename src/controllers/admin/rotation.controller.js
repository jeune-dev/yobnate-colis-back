const service = require('../../services/admin/rotation.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllRotations(req.query, req.query);
  return ok(res, { rotations: result.rotations, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getRotationById(req.params.id);
  return ok(res, { rotation: result.rotation }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.createRotation(req.body, req.user.id);
  return created(res, { rotation: result.rotation }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateRotation(req.params.id, req.body, req.user.id);
  return ok(res, { rotation: result.rotation }, result.message);
});

exports.chargerColis = asyncHandler(async (req, res) => {
  const result = await service.chargerColis(req.params.id, req.body.colisIds, req.user.id);
  return ok(res, { charges: result.charges, refuses: result.refuses }, result.message);
});

exports.dechargerColis = asyncHandler(async (req, res) => {
  const result = await service.dechargerColis(req.params.id, req.body.colisIds, req.user.id);
  return ok(res, null, result.message);
});

exports.changerStatut = asyncHandler(async (req, res) => {
  const result = await service.changerStatut(req.params.id, req.body.statut, req.user.id, req.body);
  return ok(
    res,
    { rotation: result.rotation, colisMisAJour: result.colisMisAJour },
    result.message
  );
});

exports.manifeste = asyncHandler(async (req, res) => {
  const result = await service.getManifeste(req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.embarquables = asyncHandler(async (req, res) => {
  const result = await service.getColisEmbarquables(
    req.query.paysDepart,
    req.query.paysArrivee,
    req.query
  );
  return ok(
    res,
    { colis: result.colis, poidsTotal: result.poidsTotal, pagination: result.pagination },
    result.message
  );
});
