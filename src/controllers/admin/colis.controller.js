const colisService = require('../../services/admin/colis.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getAll = asyncHandler(async (req, res) => {
  const { statut, villeDepartId, villeArriveeId, reference, expediteur, destinataire, dateDebut, dateFin, sortBy, sortOrder, page, limit } = req.query;
  const result = await colisService.getAllColis(
    { statut, villeDepartId, villeArriveeId, reference, expediteur, destinataire, dateDebut, dateFin, sortBy, sortOrder },
    { page, limit }
  );
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await colisService.getColisById(req.params.id);
  return ok(res, { colis: result.colis }, result.message);
});

const update = asyncHandler(async (req, res) => {
  const result = await colisService.updateColis(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis }, result.message);
});

const updateStatut = asyncHandler(async (req, res) => {
  const result = await colisService.updateStatutColis(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis }, result.message);
});

const ajouterPhotos = asyncHandler(async (req, res) => {
  const result = await colisService.ajouterPhotos(req.params.id, req.files || []);
  return ok(res, { colis: result.colis }, result.message);
});

const getStatistiques = asyncHandler(async (req, res) => {
  const result = await colisService.getStatistiques();
  return ok(res, { statistiques: result.statistiques }, result.message);
});

module.exports = { getAll, getOne, update, updateStatut, ajouterPhotos, getStatistiques };
