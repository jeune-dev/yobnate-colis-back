const paiementService = require('../../services/admin/paiement.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getAll = asyncHandler(async (req, res) => {
  const { userId, statut, methode, dateDebut, dateFin, page, limit } = req.query;
  const result = await paiementService.getAllPaiements({ userId, statut, methode, dateDebut, dateFin }, { page, limit });
  return ok(res, { paiements: result.paiements, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await paiementService.getPaiementById(req.params.id);
  return ok(res, { paiement: result.paiement }, result.message);
});

const enregistrer = asyncHandler(async (req, res) => {
  const result = await paiementService.enregistrerPaiement(req.params.factureId, req.body, req.user.id);
  return created(res, { paiement: result.paiement }, result.message);
});

const rembourser = asyncHandler(async (req, res) => {
  const result = await paiementService.rembourserPaiement(req.params.id, req.user.id);
  return ok(res, { paiement: result.paiement }, result.message);
});

module.exports = { getAll, getOne, enregistrer, rembourser };
