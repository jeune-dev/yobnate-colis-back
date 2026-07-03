const colisService = require('../../services/admin/colis.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { statut, villeDepartId, villeArriveeId, reference, expediteur, destinataire, dateDebut, dateFin, sortBy, sortOrder, page, limit } = req.query;
  const result = await colisService.getAllColis(
    { statut, villeDepartId, villeArriveeId, reference, expediteur, destinataire, dateDebut, dateFin, sortBy, sortOrder },
    { page, limit }
  );
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await colisService.getColisById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

const update = asyncHandler(async (req, res) => {
  const result = await colisService.updateColis(req.params.id, req.body, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

const updateStatut = asyncHandler(async (req, res) => {
  const result = await colisService.updateStatutColis(req.params.id, req.body, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

const ajouterPhotos = asyncHandler(async (req, res) => {
  const result = await colisService.ajouterPhotos(req.params.id, req.files || []);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

const getStatistiques = asyncHandler(async (req, res) => {
  const result = await colisService.getStatistiques();
  res.status(200).json({ success: true, message: result.message, data: { statistiques: result.statistiques } });
});

module.exports = { getAll, getOne, update, updateStatut, ajouterPhotos, getStatistiques };
