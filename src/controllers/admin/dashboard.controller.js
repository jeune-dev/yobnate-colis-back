const dashboardService = require('../../services/admin/dashboard.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getStats = asyncHandler(async (req, res) => {
  const result = await dashboardService.getStatsGlobales();
  return ok(res, result.stats, result.message);
});

const getColisParStatut = asyncHandler(async (req, res) => {
  const result = await dashboardService.getColisParStatut();
  return ok(res, { parStatut: result.parStatut }, result.message);
});

const getUtilisateursActifs = asyncHandler(async (req, res) => {
  const result = await dashboardService.getUtilisateursActifs(Number(req.query.limit) || 10);
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

const getVillesFrequentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getVillesFrequentes('villeDepartId', Number(req.query.limit) || 10);
  return ok(res, { villes: result.villes }, result.message);
});

const getDestinationsFrequentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getVillesFrequentes('villeArriveeId', Number(req.query.limit) || 10);
  return ok(res, { villes: result.villes }, result.message);
});

const getActivitesRecentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDernieresActivites(Number(req.query.limit) || 20);
  return ok(res, { activites: result.activites }, result.message);
});

const getDerniersUtilisateurs = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDerniersUtilisateurs(Number(req.query.limit) || 10);
  return ok(res, { utilisateurs: result.utilisateurs }, result.message);
});

const getDerniersColis = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDerniersColis(Number(req.query.limit) || 10);
  return ok(res, { colis: result.colis }, result.message);
});

module.exports = {
  getStats,
  getColisParStatut,
  getUtilisateursActifs,
  getVillesFrequentes,
  getDestinationsFrequentes,
  getActivitesRecentes,
  getDerniersUtilisateurs,
  getDerniersColis
};
