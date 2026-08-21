const service = require('../../services/parametre.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllParametres(req.query);
  return ok(res, { parametres: result.parametres }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getParametre(req.params.cle);
  return ok(res, { parametre: result.parametre }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateParametre(req.params.cle, req.body.valeur, req.user.id);
  return ok(res, { parametre: result.parametre }, result.message);
});

exports.updatePlusieurs = asyncHandler(async (req, res) => {
  const result = await service.updatePlusieurs(req.body.valeurs, req.user.id);
  return ok(res, { parametres: result.parametres }, result.message);
});

exports.initialiser = asyncHandler(async (req, res) => {
  const result = await service.initialiser();
  return ok(res, { crees: result.crees }, result.message);
});
