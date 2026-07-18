const paiementService = require('../../services/client/paiement.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getMesFactures = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paiementService.getMesFactures(req.user.id, { page, limit });
  return ok(res, { factures: result.factures, pagination: result.pagination }, result.message);
});

const getFacture = asyncHandler(async (req, res) => {
  const result = await paiementService.getFactureById(req.user.id, req.params.id);
  return ok(res, { facture: result.facture }, result.message);
});

module.exports = { getMesFactures, getFacture };
