const service = require('../../services/admin/enlevement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllDemandes(req.query, req.query);
  return ok(res, { demandes: result.demandes, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getDemandeById(req.params.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.planifier = asyncHandler(async (req, res) => {
  const result = await service.planifier(req.params.id, req.body, req.user.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.demarrer = asyncHandler(async (req, res) => {
  const result = await service.demarrer(req.params.id, req.user.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.cloturer = asyncHandler(async (req, res) => {
  const result = await service.cloturer(req.params.id, req.body, req.user.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.annuler = asyncHandler(async (req, res) => {
  const result = await service.annuler(req.params.id, req.body.motif, req.user.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.tournee = asyncHandler(async (req, res) => {
  const coursierId = req.params.coursierId || req.user.id;
  const result = await service.getTournee(coursierId, req.query.date);
  return ok(
    res,
    { date: result.date, demandes: result.demandes, totalColis: result.totalColis },
    result.message
  );
});
