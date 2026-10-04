const service = require('../service/demandeContact.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

exports.deposer = asyncHandler(async (req, res) => {
  const result = await service.deposer(req.body, req.ip);
  return created(res, null, result.message);
});

exports.lister = asyncHandler(async (req, res) => {
  const result = await service.lister(req.query);
  return ok(res, { demandes: result.demandes, pagination: result.pagination }, result.message);
});

exports.detail = asyncHandler(async (req, res) => {
  const result = await service.detail(req.params.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.traiter = asyncHandler(async (req, res) => {
  const result = await service.traiter(req.params.id, req.body, req.user.id);
  return ok(res, { demande: result.demande }, result.message);
});
