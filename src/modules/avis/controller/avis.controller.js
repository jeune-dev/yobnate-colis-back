const service = require('../service/avis.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

/* ── Client ─────────────────────────────────────────────────────────────── */

exports.deposer = asyncHandler(async (req, res) => {
  const result = await service.deposer(req.user.id, req.body);
  return created(res, { avis: result.avis }, result.message);
});

exports.mesAvis = asyncHandler(async (req, res) => {
  const result = await service.mesAvis(req.user.id);
  return ok(res, { avis: result.avis }, result.message);
});

exports.supprimerMonAvis = asyncHandler(async (req, res) => {
  const result = await service.supprimerMonAvis(req.user.id, req.params.id);
  return ok(res, null, result.message);
});

/* ── Back-office ────────────────────────────────────────────────────────── */

exports.lister = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await service.lister(filters, { page, limit });
  return ok(res, { avis: result.avis, pagination: result.pagination }, result.message);
});

exports.moderer = asyncHandler(async (req, res) => {
  const result = await service.moderer(req.params.id, req.body, req.user.id);
  return ok(res, { avis: result.avis }, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await service.supprimer(req.params.id, req.user.id);
  return ok(res, null, result.message);
});

/* ── Public ─────────────────────────────────────────────────────────────── */

exports.publics = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await service.listerPublics(filters, { page, limit });
  return ok(
    res,
    { synthese: result.synthese, avis: result.avis, pagination: result.pagination },
    result.message
  );
});
