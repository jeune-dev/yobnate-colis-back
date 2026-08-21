const service = require('../../services/reclamation.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.create = asyncHandler(async (req, res) => {
  const result = await service.ouvrirReclamation(req.user.id, req.body, req.files || []);
  return created(res, { reclamation: result.reclamation }, result.message);
});

exports.getMes = asyncHandler(async (req, res) => {
  const result = await service.getMesReclamations(req.user.id, req.query, req.query);
  return ok(
    res,
    { reclamations: result.reclamations, pagination: result.pagination },
    result.message
  );
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getMaReclamation(req.user.id, req.params.id);
  return ok(res, { reclamation: result.reclamation }, result.message);
});

exports.repondre = asyncHandler(async (req, res) => {
  const result = await service.repondreClient(
    req.user.id,
    req.params.id,
    req.body.message,
    req.files || []
  );
  return ok(res, { reponse: result.reponse }, result.message);
});

exports.noter = asyncHandler(async (req, res) => {
  const result = await service.noterReclamation(req.user.id, req.params.id, req.body.note);
  return ok(res, { reclamation: result.reclamation }, result.message);
});
