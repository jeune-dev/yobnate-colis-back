const activityLogService = require('../../services/activityLog.service');
const asyncHandler = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const { userId, action, entite, dateDebut, dateFin, page, limit } = req.query;
  const result = await activityLogService.getAllActivities({ userId, action, entite, dateDebut, dateFin }, { page, limit });
  res.status(200).json({ success: true, message: result.message, data: { activites: result.activites, pagination: result.pagination } });
});

module.exports = { getAll };
