const colisService = require('../../services/client/colis.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const create = asyncHandler(async (req, res) => {
  const result = await colisService.declarerColis(req.user.id, req.body, req.files || []);
  return created(res, { colis: result.colis, facture: result.facture }, result.message);
});

const getMes = asyncHandler(async (req, res) => {
  const { statut, dateDebut, dateFin, page, limit } = req.query;
  const result = await colisService.getMesColis(req.user.id, { statut, dateDebut, dateFin }, { page, limit });
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await colisService.getColisById(req.user.id, req.params.id);
  return ok(res, { colis: result.colis }, result.message);
});

const getSuivi = asyncHandler(async (req, res) => {
  const result = await colisService.getSuiviColis(req.user.id, req.params.id);
  return ok(res, { historique: result.historique }, result.message);
});

const annuler = asyncHandler(async (req, res) => {
  const result = await colisService.annulerColis(req.user.id, req.params.id, req.body.motif);
  return ok(res, { colis: result.colis }, result.message);
});

module.exports = { create, getMes, getOne, getSuivi, annuler };
