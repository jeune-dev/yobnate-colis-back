const { Op } = require('sequelize');
const { Notification } = require('../../../models');
const { NotFoundError } = require('../../../errors/AppError');
const { paginate, paginateResult } = require('../../../utils/paginate');

class NotificationService {
  static getMesNotifications = async (userId, pagination) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Notification.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    return {
      message: 'Liste des notifications',
      notifications: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getNbNonLues = async (userId) => {
    const total = await Notification.count({ where: { userId, isRead: false } });
    return { message: 'Nombre de notifications non lues', total };
  };

  /**
   * Ouvrir une notification la marque comme lue, ainsi que les autres
   * notifications non lues du même objet (même colis, même facture…) : elles
   * mènent au même écran. Renvoie les identifiants marqués et le nouveau total.
   */
  static marquerLue = async (userId, notificationId) => {
    const notification = await Notification.findOne({ where: { id: notificationId, userId } });
    if (!notification) throw new NotFoundError('Notification introuvable');
    const memeObjet =
      notification.entite && notification.entiteId
        ? { entite: notification.entite, entiteId: notification.entiteId }
        : { id: notification.id };
    const aMarquer = await Notification.findAll({
      where: { userId, isRead: false, [Op.or]: [{ id: notification.id }, memeObjet] },
      attributes: ['id'],
    });
    const lues = aMarquer.map((n) => n.id);
    if (lues.length) {
      await Notification.update(
        { isRead: true, luAt: new Date() },
        { where: { id: lues, userId } }
      );
    }
    await notification.reload();
    const { total: nonLues } = await NotificationService.getNbNonLues(userId);
    return { message: 'Notification marquée comme lue.', notification, lues, nonLues };
  };

  static marquerToutesLues = async (userId) => {
    await Notification.update(
      { isRead: true, luAt: new Date() },
      { where: { userId, isRead: false } }
    );
    return { message: 'Toutes les notifications ont été marquées comme lues.' };
  };

  static supprimer = async (userId, notificationId) => {
    const notification = await Notification.findOne({ where: { id: notificationId, userId } });
    if (!notification) throw new NotFoundError('Notification introuvable');
    await notification.destroy();
    return { message: 'Notification supprimée.' };
  };
}

module.exports = NotificationService;
