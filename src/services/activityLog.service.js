const { Op } = require('sequelize');
const { ActivityLog, User } = require('../models');
const { paginate, paginateResult } = require('../utils/paginate');

const logActivity = ({ userId = null, action, entite = null, entiteId = null, details = null, ip = null, userAgent = null }) =>
  ActivityLog.create({ userId, action, entite, entiteId, details, ipAddress: ip, userAgent }).catch(() => {});

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

const getAllActivities = async (filters, pagination) => {
  const where = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = { [Op.iLike]: `%${filters.action}%` };
  if (filters.entite) where.entite = filters.entite;
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
    if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
  }

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await ActivityLog.findAndCountAll({
    where,
    include: [{ model: User, attributes: ['id', 'nom', 'prenom', 'role'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return { message: "Journal d'activité", activites: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

module.exports = { logActivity, requestMeta, getAllActivities };
