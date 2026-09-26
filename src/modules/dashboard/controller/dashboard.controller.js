const service = require('../service/dashboard.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok } = require('../../../utils/response');

/** Taille de liste demandée par le client, bornée à 100 (pas de liste sans limite). */
const borne = (valeur, defaut) => Math.min(Math.max(Number(valeur) || defaut, 1), 100);

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
  const result = await service.getUtilisateursActifs(borne(req.query.limit, 10));
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

exports.villesDepart = asyncHandler(async (req, res) => {
  const result = await service.getVillesFrequentes('villeDepartId', borne(req.query.limit, 10));
  return ok(res, { villes: result.villes }, result.message);
});

exports.villesArrivee = asyncHandler(async (req, res) => {
  const result = await service.getVillesFrequentes('villeArriveeId', borne(req.query.limit, 10));
  return ok(res, { villes: result.villes }, result.message);
});

exports.activites = asyncHandler(async (req, res) => {
  const result = await service.getDernieresActivites(borne(req.query.limit, 20));
  return ok(res, { activites: result.activites }, result.message);
});

exports.derniersUtilisateurs = asyncHandler(async (req, res) => {
  const result = await service.getDerniersUtilisateurs(borne(req.query.limit, 10));
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

exports.derniersColis = asyncHandler(async (req, res) => {
  const result = await service.getDerniersColis(borne(req.query.limit, 10));
  return ok(res, { colis: result.colis }, result.message);
});

exports.pointsAttention = asyncHandler(async (req, res) => {
  const result = await service.getPointsAttention(borne(req.query.limit, 20));
  return ok(res, { pointsAttention: result.pointsAttention }, result.message);
});

exports.kpis = asyncHandler(async (req, res) => {
  const result = await service.getKpis(req.query);
  return ok(res, { kpis: result.kpis }, result.message);
});
