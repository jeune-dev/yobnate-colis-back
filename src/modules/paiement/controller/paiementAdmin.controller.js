const service = require('../service/paiementAdmin.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');
const { envoyerCsv } = require('../../../utils/csv');
const perimetre = require('../../../utils/perimetre');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllPaiements(req.query, req.query, perimetre.paiements(req.user));
  return ok(res, { paiements: result.paiements, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getPaiementById(req.params.id);
  return ok(res, { paiement: result.paiement }, result.message);
});

exports.enregistrer = asyncHandler(async (req, res) => {
  const donnees = await service.verifierPerimetreEncaissement(
    req.params.factureId,
    req.body,
    req.user
  );
  const result = await service.enregistrerPaiement(req.params.factureId, donnees, req.user.id);
  return created(res, { paiement: result.paiement, facture: result.facture }, result.message);
});

exports.rembourser = asyncHandler(async (req, res) => {
  const result = await service.rembourser(req.params.id, req.body, req.user.id);
  return ok(res, { paiement: result.paiement }, result.message);
});

exports.marquerEchoue = asyncHandler(async (req, res) => {
  const result = await service.marquerEchoue(req.params.id, req.body.motif, req.user.id);
  return ok(res, { paiement: result.paiement }, result.message);
});

exports.caisse = asyncHandler(async (req, res) => {
  perimetre.assertPoint(req.user, req.params.pointId);
  const result = await service.getCaisseDuPoint(req.params.pointId, req.query.date);
  return ok(res, { caisse: result.caisse }, result.message);
});

exports.exporter = asyncHandler(async (req, res) => {
  const result = await service.exporterCsv(req.query);
  return envoyerCsv(res, result.contenu, result.nomFichier);
});

exports.statistiques = asyncHandler(async (req, res) => {
  const result = await service.getStatistiques(req.query);
  return ok(res, { statistiques: result.statistiques }, result.message);
});
