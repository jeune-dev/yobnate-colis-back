const factureService = require('../../services/admin/facture.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { userId, statut, dateDebut, dateFin, page, limit } = req.query;
  const result = await factureService.getAllFactures({ userId, statut, dateDebut, dateFin }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { factures: result.factures, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await factureService.getFactureById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { facture: result.facture } });
});

const annuler = asyncHandler(async (req, res) => {
  const result = await factureService.annulerFacture(req.params.id, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { facture: result.facture } });
});

module.exports = { getAll, getOne, annuler };
