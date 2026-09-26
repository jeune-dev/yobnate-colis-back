const service = require('../service/compte.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');
const { cookieConfig } = require('../../../config/security');

exports.exporter = asyncHandler(async (req, res) => {
  const result = await service.exporter(req.user.id);
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { export: result.export }, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await service.supprimerMonCompte(req.user.id, req.body);
  res.clearCookie('refreshToken', cookieConfig);
  return ok(res, null, result.message);
});

exports.deposerDemande = asyncHandler(async (req, res) => {
  const result = await service.deposerDemande(req.body, req.ip);
  return created(res, null, result.message);
});

exports.listerDemandes = asyncHandler(async (req, res) => {
  const result = await service.listerDemandes(req.query);
  return ok(res, { demandes: result.demandes }, result.message);
});

exports.traiterDemande = asyncHandler(async (req, res) => {
  const result = await service.traiterDemande(req.params.id, req.body, req.user.id);
  return ok(
    res,
    { demande: result.demande, compteSupprime: result.compteSupprime },
    result.message
  );
});
