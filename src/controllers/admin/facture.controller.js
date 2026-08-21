const service = require('../../services/admin/facture.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { envoyerCsv } = require('../../utils/csv');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllFactures(req.query, req.query);
  return ok(res, { factures: result.factures, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getFactureById(req.params.id);
  return ok(res, { facture: result.facture }, result.message);
});

exports.appliquerRemise = asyncHandler(async (req, res) => {
  const result = await service.appliquerRemise(
    req.params.id,
    req.body.remise,
    req.user.id,
    req.body.motif
  );
  return ok(res, { facture: result.facture }, result.message);
});

exports.annuler = asyncHandler(async (req, res) => {
  const result = await service.annulerFacture(req.params.id, req.body.motif, req.user.id);
  return ok(res, { facture: result.facture }, result.message);
});

exports.prolongerEcheance = asyncHandler(async (req, res) => {
  const result = await service.prolongerEcheance(
    req.params.id,
    req.body.dateLimitePaiement,
    req.user.id
  );
  return ok(res, { facture: result.facture }, result.message);
});

exports.emettreAvoir = asyncHandler(async (req, res) => {
  const result = await service.emettreAvoir(req.params.id, req.body, req.user.id);
  return ok(res, { avoir: result.avoir }, result.message);
});

exports.relancer = asyncHandler(async (req, res) => {
  const result = await service.relancer(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

exports.relancerEchues = asyncHandler(async (req, res) => {
  const result = await service.relancerEchues(req.user.id);
  return ok(res, { nbRelances: result.nbRelances }, result.message);
});

exports.document = asyncHandler(async (req, res) => {
  const result = await service.getDocumentFacture(req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.exporter = asyncHandler(async (req, res) => {
  const result = await service.exporterCsv(req.query);
  return envoyerCsv(res, result.contenu, result.nomFichier);
});

exports.statistiques = asyncHandler(async (req, res) => {
  const result = await service.getStatistiques(req.query);
  return ok(res, { statistiques: result.statistiques }, result.message);
});
