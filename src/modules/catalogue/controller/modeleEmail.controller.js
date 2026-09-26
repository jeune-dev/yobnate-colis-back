const service = require('../service/modeleEmail.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok } = require('../../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll();
  return ok(res, { modeles: result.modeles }, result.message);
});

exports.enregistrer = asyncHandler(async (req, res) => {
  const result = await service.enregistrer(req.params.code, req.body, req.user.id);
  return ok(res, { modele: result.modele }, result.message);
});

exports.reinitialiser = asyncHandler(async (req, res) => {
  const result = await service.reinitialiser(req.params.code, req.user.id);
  return ok(res, null, result.message);
});

/** Aperçu HTML, avec le contenu en cours d'édition s'il est fourni. */
exports.apercu = asyncHandler((req, res) => {
  const result = service.apercu(req.params.code, req.body || {});
  return res.status(200).type('html').send(result.html);
});
