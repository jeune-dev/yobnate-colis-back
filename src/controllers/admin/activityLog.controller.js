const activityLogService = require('../../services/activityLog.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const { userId, action, entite, dateDebut, dateFin, page, limit } = req.query;
  const result = await activityLogService.getAllActivities(
    { userId, action, entite, dateDebut, dateFin },
    { page, limit }
  );
  return ok(res, { activites: result.activites, pagination: result.pagination }, result.message);
});
