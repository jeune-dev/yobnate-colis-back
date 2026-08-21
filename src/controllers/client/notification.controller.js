const notificationService = require('../../services/client/notification.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getMes = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await notificationService.getMesNotifications(req.user.id, { page, limit });
  return ok(
    res,
    { notifications: result.notifications, pagination: result.pagination },
    result.message
  );
});

exports.getNbNonLues = asyncHandler(async (req, res) => {
  const result = await notificationService.getNbNonLues(req.user.id);
  return ok(res, { total: result.total }, result.message);
});

exports.marquerLue = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerLue(req.user.id, req.params.id);
  return ok(res, { notification: result.notification }, result.message);
});

exports.marquerToutesLues = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerToutesLues(req.user.id);
  return ok(res, null, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await notificationService.supprimer(req.user.id, req.params.id);
  return ok(res, null, result.message);
});
