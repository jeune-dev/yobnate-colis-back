const service = require('../service/parrainage.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok } = require('../../../utils/response');

exports.getParrains = asyncHandler(async (req, res) => {
  const result = await service.getParrains(req.query, req.query);
  return ok(
    res,
    { parrains: result.parrains, totaux: result.totaux, pagination: result.pagination },
    result.message
  );
});

exports.getFilleuls = asyncHandler(async (req, res) => {
  const result = await service.getFilleuls(req.params.id);
  return ok(res, { parrain: result.parrain, filleuls: result.filleuls }, result.message);
});

exports.ajusterCredit = asyncHandler(async (req, res) => {
  const result = await service.ajusterCredit(req.params.id, req.body, req.user.id);
  return ok(res, { utilisateur: result.utilisateur }, result.message);
});
