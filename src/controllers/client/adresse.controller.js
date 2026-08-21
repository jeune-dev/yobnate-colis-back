const service = require('../../services/client/adresse.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getMes = asyncHandler(async (req, res) => {
  const result = await service.getMesAdresses(req.user.id, req.query, req.query);
  return ok(res, { adresses: result.adresses, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getAdresseById(req.user.id, req.params.id);
  return ok(res, { adresse: result.adresse }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.creerAdresse(req.user.id, req.body);
  return created(res, { adresse: result.adresse }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.modifierAdresse(req.user.id, req.params.id, req.body);
  return ok(res, { adresse: result.adresse }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.supprimerAdresse(req.user.id, req.params.id);
  return ok(res, null, result.message);
});

exports.parDefaut = asyncHandler(async (req, res) => {
  const result = await service.definirParDefaut(req.user.id, req.params.id);
  return ok(res, { adresse: result.adresse }, result.message);
});
