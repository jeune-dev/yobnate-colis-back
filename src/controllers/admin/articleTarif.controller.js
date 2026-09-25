const service = require('../../services/admin/articleTarif.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.query);
  return ok(res, { articles: result.articles }, result.message);
});

exports.create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body, req.user.id);
  return created(res, { article: result.article }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body, req.user.id);
  return ok(res, { article: result.article }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.photo = asyncHandler(async (req, res) => {
  const result = await service.definirPhoto(req.params.id, req.file, req.user.id);
  return ok(res, { article: result.article }, result.message);
});
