const service = require('../../services/admin/dashboard.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.stats = asyncHandler(async (req, res) => {
  const result = await service.getStatsGlobales();
  return ok(res, { stats: result.stats }, result.message);
});

exports.parStatut = asyncHandler(async (req, res) => {
  const result = await service.getColisParStatut();
  return ok(res, { parStatut: result.parStatut }, result.message);
});

exports.parPays = asyncHandler(async (req, res) => {
  const result = await service.getVueParPays();
  return ok(res, { pays: result.pays }, result.message);
});

exports.utilisateursActifs = asyncHandler(async (req, res) => {
  const result = await service.getUtilisateursActifs(Number(req.query.limit) || 10);
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

exports.villesDepart = asyncHandler(async (req, res) => {
  const result = await service.getVillesFrequentes('villeDepartId', Number(req.query.limit) || 10);
  return ok(res, { villes: result.villes }, result.message);
});

exports.villesArrivee = asyncHandler(async (req, res) => {
  const result = await service.getVillesFrequentes('villeArriveeId', Number(req.query.limit) || 10);
  return ok(res, { villes: result.villes }, result.message);
});

exports.activites = asyncHandler(async (req, res) => {
  const result = await service.getDernieresActivites(Number(req.query.limit) || 20);
  return ok(res, { activites: result.activites }, result.message);
});

exports.derniersUtilisateurs = asyncHandler(async (req, res) => {
  const result = await service.getDerniersUtilisateurs(Number(req.query.limit) || 10);
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

exports.derniersColis = asyncHandler(async (req, res) => {
  const result = await service.getDerniersColis(Number(req.query.limit) || 10);
  return ok(res, { colis: result.colis }, result.message);
});

exports.pointsAttention = asyncHandler(async (req, res) => {
  const result = await service.getPointsAttention(Number(req.query.limit) || 20);
  return ok(res, { pointsAttention: result.pointsAttention }, result.message);
});
