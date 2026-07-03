const paiementService = require('../../services/admin/paiement.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { userId, statut, methode, dateDebut, dateFin, page, limit } = req.query;
  const result = await paiementService.getAllPaiements({ userId, statut, methode, dateDebut, dateFin }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { paiements: result.paiements, pagination: result.pagination } });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await paiementService.getPaiementById(req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { paiement: result.paiement } });
});

const enregistrer = asyncHandler(async (req, res) => {
  const result = await paiementService.enregistrerPaiement(req.params.factureId, req.body, req.user.id);
  res.status(201).json({ success: true, message: result.message, data: { paiement: result.paiement } });
});

const rembourser = asyncHandler(async (req, res) => {
  const result = await paiementService.rembourserPaiement(req.params.id, req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { paiement: result.paiement } });
});

module.exports = { getAll, getOne, enregistrer, rembourser };
