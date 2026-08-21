const service = require('../../services/reclamation.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllReclamations(req.query, req.query);
  return ok(
    res,
    { reclamations: result.reclamations, pagination: result.pagination },
    result.message
  );
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getReclamationById(req.params.id);
  return ok(res, { reclamation: result.reclamation }, result.message);
});

exports.assigner = asyncHandler(async (req, res) => {
  const result = await service.assigner(req.params.id, req.body.agentId, req.user.id);
  return ok(res, { reclamation: result.reclamation }, result.message);
});

exports.repondre = asyncHandler(async (req, res) => {
  const result = await service.repondreSupport(
    req.params.id,
    req.body,
    req.user.id,
    req.files || []
  );
  return ok(res, { reponse: result.reponse }, result.message);
});

exports.resoudre = asyncHandler(async (req, res) => {
  const result = await service.resoudre(req.params.id, req.body, req.user.id);
  return ok(res, { reclamation: result.reclamation, avoir: result.avoir }, result.message);
});

exports.priorite = asyncHandler(async (req, res) => {
  const result = await service.changerPriorite(req.params.id, req.body.priorite, req.user.id);
  return ok(res, { reclamation: result.reclamation }, result.message);
});

exports.statistiques = asyncHandler(async (req, res) => {
  const result = await service.getStatistiques();
  return ok(res, { statistiques: result.statistiques }, result.message);
});
