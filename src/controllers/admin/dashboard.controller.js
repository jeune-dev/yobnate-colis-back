const dashboardService = require('../../services/admin/dashboard.service');
const asyncHandler = require('../../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const result = await dashboardService.getStatsGlobales();
  res.status(200).json({ success: true, message: result.message, data: result.stats });
});

const getColisParStatut = asyncHandler(async (req, res) => {
  const result = await dashboardService.getColisParStatut();
  res.status(200).json({ success: true, message: result.message, data: { parStatut: result.parStatut } });
});

const getUtilisateursActifs = asyncHandler(async (req, res) => {
  const result = await dashboardService.getUtilisateursActifs(Number(req.query.limit) || 10);
  res.status(200).json({ success: true, message: result.message, data: { utilisateurs: result.utilisateurs } });
});

const getVillesFrequentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getVillesFrequentes('villeDepartId', Number(req.query.limit) || 10);
  res.status(200).json({ success: true, message: result.message, data: { villes: result.villes } });
});

const getDestinationsFrequentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getVillesFrequentes('villeArriveeId', Number(req.query.limit) || 10);
  res.status(200).json({ success: true, message: result.message, data: { villes: result.villes } });
});

const getActivitesRecentes = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDernieresActivites(Number(req.query.limit) || 20);
  res.status(200).json({ success: true, message: result.message, data: { activites: result.activites } });
});

const getDerniersUtilisateurs = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDerniersUtilisateurs(Number(req.query.limit) || 10);
  res.status(200).json({ success: true, message: result.message, data: { utilisateurs: result.utilisateurs } });
});

const getDerniersColis = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDerniersColis(Number(req.query.limit) || 10);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
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
