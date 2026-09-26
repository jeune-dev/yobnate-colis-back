const service = require('../service/tourneeCollecte.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query, req.query);
  return ok(res, { tournees: result.tournees, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getById(req.params.id);
  return ok(res, { tournee: result.tournee }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body, req.user.id);
  return created(res, { tournee: result.tournee }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body, req.user.id);
  return ok(res, { tournee: result.tournee }, result.message);
});

exports.changerStatut = asyncHandler(async (req, res) => {
  const result = await service.changerStatut(req.params.id, req.body, req.user.id);
  return ok(
    res,
    { tournee: result.tournee, clientsPrevenus: result.clientsPrevenus },
    result.message
  );
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user.id);
  return ok(res, null, result.message);
});
