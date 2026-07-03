const { Op } = require('sequelize');
const { Ville } = require('../../models');
const ApiError = require('../../utils/ApiError');

const getAllVilles = async (filters) => {
  const where = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive === 'true' || filters.isActive === true;
  if (filters.search) where.nom = { [Op.iLike]: `%${filters.search}%` };
  const villes = await Ville.findAll({ where, order: [['nom', 'ASC']] });
  return { message: 'Liste des villes', villes };
};

const getVilleById = async (id) => {
  const ville = await Ville.findByPk(id);
  if (!ville) throw ApiError.notFound('Ville introuvable');
  return { message: 'Détail de la ville', ville };
};

const createVille = async (data) => {
  const existing = await Ville.findOne({ where: { nom: data.nom } });
  if (existing) throw ApiError.conflict('Cette ville existe déjà');
  const ville = await Ville.create(data);
  return { message: 'Ville créée.', ville };
};

const updateVille = async (id, data) => {
  const ville = await Ville.findByPk(id);
  if (!ville) throw ApiError.notFound('Ville introuvable');
  await ville.update(data);
  return { message: 'Ville mise à jour.', ville };
};

module.exports = { getAllVilles, getVilleById, createVille, updateVille };
