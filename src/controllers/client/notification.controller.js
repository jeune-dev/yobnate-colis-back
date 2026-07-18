const notificationService = require('../../services/client/notification.service');
const asyncHandler = require('../../middlewares/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError } = require('../../errors/AppError');

const getMes = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await notificationService.getMesNotifications(req.user.id, { page, limit });
  return ok(res, { notifications: result.notifications, pagination: result.pagination }, result.message);
});

const getNbNonLues = asyncHandler(async (req, res) => {
  const result = await notificationService.getNbNonLues(req.user.id);
  return ok(res, { total: result.total }, result.message);
});

const marquerLue = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerLue(req.user.id, req.params.id);
  return ok(res, { notification: result.notification }, result.message);
});

const marquerToutesLues = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerToutesLues(req.user.id);
  return ok(res, null, result.message);
});

module.exports = { getMes, getNbNonLues, marquerLue, marquerToutesLues };
