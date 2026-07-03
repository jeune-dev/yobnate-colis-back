const paiementService = require('../../services/client/paiement.service');
const asyncHandler = require('../../utils/asyncHandler');

const getMesFactures = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paiementService.getMesFactures(req.user.id, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { factures: result.factures, pagination: result.pagination } });
});

const getFacture = asyncHandler(async (req, res) => {
  const result = await paiementService.getFactureById(req.user.id, req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { facture: result.facture } });
});

module.exports = { getMesFactures, getFacture };
