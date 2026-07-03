const { Op } = require('sequelize');
const { User, Colis } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

const sortableFields = ['createdAt', 'nom', 'lastLoginAt'];

const getAllUsers = async (filters, pagination) => {
  const where = { role: 'client' };
  if (filters.search) {
    where[Op.or] = [
      { nom: { [Op.iLike]: `%${filters.search}%` } },
      { prenom: { [Op.iLike]: `%${filters.search}%` } },
      { email: { [Op.iLike]: `%${filters.search}%` } },
      { telephone: { [Op.iLike]: `%${filters.search}%` } }
    ];
  }
  if (filters.isActive !== undefined) where.isActive = filters.isActive === 'true' || filters.isActive === true;

  const sortBy = sortableFields.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password'] },
    order: [[sortBy, sortOrder]],
    limit,
    offset
  });

  return {
    message: 'Liste des utilisateurs',
    utilisateurs: rows,
    pagination: paginateResult(count, pagination.page, pagination.limit)
  };
};

const getUserById = async (id) => {
  const user = await User.findOne({ where: { id, role: 'client' }, attributes: { exclude: ['password'] } });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');

  const nbColisEnvoyes = await Colis.count({ where: { userId: id } });
  const nbColisLivres = await Colis.count({ where: { userId: id, statut: 'livre' } });

  return {
    message: 'Détail de l\'utilisateur',
    utilisateur: { ...user.toJSON(), stats: { nbColisEnvoyes, nbColisLivres } }
  };
};

const getUserColis = async (userId, pagination) => {
  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Colis.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return { message: 'Colis de l\'utilisateur', colis: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

const setActive = async (id, isActive, adminId) => {
  const user = await User.findOne({ where: { id, role: 'client' } });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');
  await user.update({ isActive });
  await logActivity({
    userId: adminId,
    action: isActive ? 'admin.user.activate' : 'admin.user.deactivate',
    entite: 'User',
    entiteId: user.id
  });
  return {
    message: isActive ? 'Utilisateur activé.' : 'Utilisateur désactivé.',
    utilisateur: user.toSafeJSON()
  };
};

module.exports = { getAllUsers, getUserById, getUserColis, setActive };
