const { Notification } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');

const getMesNotifications = async (userId, pagination) => {
  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Notification.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return {
    message: 'Liste des notifications',
    notifications: rows,
    pagination: paginateResult(count, pagination.page, pagination.limit)
  };
};

const getNbNonLues = async (userId) => {
  const total = await Notification.count({ where: { userId, isRead: false } });
  return { message: 'Nombre de notifications non lues', total };
};

const marquerLue = async (userId, notificationId) => {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) throw ApiError.notFound('Notification introuvable');
  await notification.update({ isRead: true });
  return { message: 'Notification marquée comme lue.', notification };
};

const marquerToutesLues = async (userId) => {
  await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
  return { message: 'Toutes les notifications ont été marquées comme lues.' };
};

module.exports = { getMesNotifications, getNbNonLues, marquerLue, marquerToutesLues };
