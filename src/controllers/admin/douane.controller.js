const service = require('../../services/admin/douane.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllDeclarations(req.query, req.query);
  return ok(
    res,
    { declarations: result.declarations, pagination: result.pagination },
    result.message
  );
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getDeclarationById(req.params.id);
  return ok(res, { declaration: result.declaration }, result.message);
});

exports.getParColis = asyncHandler(async (req, res) => {
  const result = await service.getDeclarationParColis(req.params.colisId);
  return ok(res, { declaration: result.declaration }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateDeclaration(req.params.id, req.body, req.user.id);
  return ok(res, { declaration: result.declaration }, result.message);
});

exports.definirArticles = asyncHandler(async (req, res) => {
  const result = await service.definirArticles(req.params.id, req.body.articles, req.user.id);
  return ok(
    res,
    { declaration: result.declaration, estimation: result.estimation },
    result.message
  );
});

exports.ajouterArticle = asyncHandler(async (req, res) => {
  const result = await service.ajouterArticle(req.params.id, req.body, req.user.id);
  return ok(res, { article: result.article }, result.message);
});

exports.supprimerArticle = asyncHandler(async (req, res) => {
  const result = await service.supprimerArticle(req.params.id, req.params.articleId, req.user.id);
  return ok(res, null, result.message);
});

exports.ajouterDocument = asyncHandler(async (req, res) => {
  const result = await service.ajouterDocument(req.params.id, req.file, req.body, req.user.id);
  return ok(res, { document: result.document }, result.message);
});

exports.changerStatut = asyncHandler(async (req, res) => {
  const result = await service.changerStatut(req.params.id, req.body, req.user.id);
  return ok(res, { declaration: result.declaration }, result.message);
});

exports.factureCommerciale = asyncHandler(async (req, res) => {
  const result = await service.getFactureCommerciale(req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.tableauDeBord = asyncHandler(async (req, res) => {
  const result = await service.getTableauDeBord();
  return ok(res, { tableauDeBord: result.tableauDeBord }, result.message);
});
