const service = require('../../services/client/enlevement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.create = asyncHandler(async (req, res) => {
  const result = await service.creerDemande(req.user.id, req.body);
  return created(res, { demande: result.demande }, result.message);
});

exports.getMes = asyncHandler(async (req, res) => {
  const result = await service.getMesDemandes(req.user.id, req.query, req.query);
  return ok(res, { demandes: result.demandes, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getDemandeById(req.user.id, req.params.id);
  return ok(res, { demande: result.demande }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.modifierDemande(req.user.id, req.params.id, req.body);
  return ok(res, { demande: result.demande }, result.message);
});

exports.annuler = asyncHandler(async (req, res) => {
  const result = await service.annulerDemande(req.user.id, req.params.id, req.body.motif);
  return ok(res, { demande: result.demande }, result.message);
});

exports.creneaux = asyncHandler((req, res) => {
  const result = service.getCreneauxDisponibles();
  return ok(res, { creneaux: result.creneaux, dates: result.dates }, result.message);
});
