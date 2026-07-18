const factureService = require('../../services/admin/facture.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getAll = asyncHandler(async (req, res) => {
  const { userId, statut, dateDebut, dateFin, page, limit } = req.query;
  const result = await factureService.getAllFactures({ userId, statut, dateDebut, dateFin }, { page, limit });
  return ok(res, { factures: result.factures, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await factureService.getFactureById(req.params.id);
  return ok(res, { facture: result.facture }, result.message);
});

const annuler = asyncHandler(async (req, res) => {
  const result = await factureService.annulerFacture(req.params.id, req.user.id);
  return ok(res, { facture: result.facture }, result.message);
});

const appliquerRemise = asyncHandler(async (req, res) => {
  const remise = Number(req.body.remise);
  if (isNaN(remise)) throw new BadRequestError('Le champ remise doit être un nombre.');
  const result = await factureService.appliquerRemise(req.params.id, remise, req.user.id);
  return ok(res, { facture: result.facture }, result.message);
});

module.exports = { getAll, getOne, annuler, appliquerRemise };
