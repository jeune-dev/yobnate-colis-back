const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { User } = require('../../models');
const { bcryptConfig } = require('../../config/security');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

const ADMIN_ROLES = { [Op.in]: ['admin', 'super_admin'] };

const getAllAdmins = async (filters, pagination) => {
  const where = { role: ADMIN_ROLES };
  if (filters.search) {
    where[Op.or] = [
      { nom: { [Op.iLike]: `%${filters.search}%` } },
      { prenom: { [Op.iLike]: `%${filters.search}%` } },
      { email: { [Op.iLike]: `%${filters.search}%` } }
    ];
  }
  if (filters.role) where.role = filters.role;

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password'] },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return {
    message: 'Liste des administrateurs',
    administrateurs: rows,
    pagination: paginateResult(count, pagination.page, pagination.limit)
  };
};

const getAdminById = async (id) => {
  const admin = await User.findOne({ where: { id, role: ADMIN_ROLES }, attributes: { exclude: ['password'] } });
  if (!admin) throw ApiError.notFound('Administrateur introuvable');
  return { message: 'Détail de l\'administrateur', administrateur: admin };
};

const createAdmin = async (data, creatorId) => {
  const existing = await User.findOne({ where: { [Op.or]: [{ email: data.email }, { telephone: data.telephone }] } });
  if (existing) throw ApiError.conflict('Un compte existe déjà avec cet email ou ce numéro de téléphone');

  const password = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
  const admin = await User.create({ ...data, password, isActive: true });

  await logActivity({ userId: creatorId, action: 'admin.admin.create', entite: 'User', entiteId: admin.id, details: { role: admin.role } });
  return { message: 'Administrateur créé avec succès.', administrateur: admin.toSafeJSON() };
};

const assertNotLastSuperAdmin = async (admin) => {
  if (admin.role !== 'super_admin') return;
  const count = await User.count({ where: { role: 'super_admin', isActive: true } });
  if (count <= 1) throw ApiError.badRequest('Impossible de modifier le dernier super administrateur actif');
};

const updateAdmin = async (id, data, actorId) => {
  const admin = await User.findOne({ where: { id, role: ADMIN_ROLES } });
  if (!admin) throw ApiError.notFound('Administrateur introuvable');
  if (data.role && data.role !== admin.role) await assertNotLastSuperAdmin(admin);
  if (data.isActive === false) await assertNotLastSuperAdmin(admin);

  await admin.update(data);
  await logActivity({ userId: actorId, action: 'admin.admin.update', entite: 'User', entiteId: admin.id, details: data });
  return { message: 'Administrateur mis à jour.', administrateur: admin.toSafeJSON() };
};

module.exports = { getAllAdmins, getAdminById, createAdmin, updateAdmin };
