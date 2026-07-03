const colisService = require('../../services/client/colis.service');
const asyncHandler = require('../../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const result = await colisService.declarerColis(req.user.id, req.body, req.files || []);
  res.status(201).json({ success: true, message: result.message, data: { colis: result.colis, facture: result.facture } });
});

const getMes = asyncHandler(async (req, res) => {
  const { statut, dateDebut, dateFin, page, limit } = req.query;
  const result = await colisService.getMesColis(req.user.id, { statut, dateDebut, dateFin }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await colisService.getColisById(req.user.id, req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

const getSuivi = asyncHandler(async (req, res) => {
  const result = await colisService.getSuiviColis(req.user.id, req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { historique: result.historique } });
});

const annuler = asyncHandler(async (req, res) => {
  const result = await colisService.annulerColis(req.user.id, req.params.id, req.body.motif);
  res.status(200).json({ success: true, message: result.message, data: { colis: result.colis } });
});

module.exports = { create, getMes, getOne, getSuivi, annuler };
