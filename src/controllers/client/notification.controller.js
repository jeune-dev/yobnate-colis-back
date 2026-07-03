const notificationService = require('../../services/client/notification.service');
const asyncHandler = require('../../utils/asyncHandler');

const getMes = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await notificationService.getMesNotifications(req.user.id, { page, limit });
  res.status(200).json({
    success: true,
    message: result.message,
    data: { notifications: result.notifications, pagination: result.pagination }
  });
});

const getNbNonLues = asyncHandler(async (req, res) => {
  const result = await notificationService.getNbNonLues(req.user.id);
  res.status(200).json({ success: true, message: result.message, data: { total: result.total } });
});

const marquerLue = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerLue(req.user.id, req.params.id);
  res.status(200).json({ success: true, message: result.message, data: { notification: result.notification } });
});

const marquerToutesLues = asyncHandler(async (req, res) => {
  const result = await notificationService.marquerToutesLues(req.user.id);
  res.status(200).json({ success: true, message: result.message, data: null });
});

module.exports = { getMes, getNbNonLues, marquerLue, marquerToutesLues };
