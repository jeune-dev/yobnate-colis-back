const service = require('../service/faq.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

exports.publique = asyncHandler(async (req, res) => {
  const result = await service.publique();
  return ok(res, { rubriques: result.rubriques }, result.message);
});

exports.lister = asyncHandler(async (req, res) => {
  const result = await service.lister(req.query);
  return ok(res, { questions: result.questions }, result.message);
});

exports.creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user.id);
  return created(res, { faq: result.faq }, result.message);
});

exports.modifier = asyncHandler(async (req, res) => {
  const result = await service.modifier(req.params.id, req.body, req.user.id);
  return ok(res, { faq: result.faq }, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await service.supprimer(req.params.id, req.user.id);
  return ok(res, null, result.message);
});
