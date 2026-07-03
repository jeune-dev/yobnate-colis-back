const { Tarif, Ville } = require('../../models');
const ApiError = require('../../utils/ApiError');

const INCLUDE_VILLES = [
  { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
  { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }
];

const getAllTarifs = async (filters) => {
  const where = {};
  if (filters.villeDepartId) where.villeDepartId = filters.villeDepartId;
  if (filters.villeArriveeId) where.villeArriveeId = filters.villeArriveeId;
  if (filters.typeColis) where.typeColis = filters.typeColis;
  if (filters.isActive !== undefined) where.isActive = filters.isActive === 'true' || filters.isActive === true;
  const tarifs = await Tarif.findAll({ where, include: INCLUDE_VILLES, order: [['createdAt', 'DESC']] });
  return { message: 'Liste des tarifs', tarifs };
};

const getTarifById = async (id) => {
  const tarif = await Tarif.findByPk(id, { include: INCLUDE_VILLES });
  if (!tarif) throw ApiError.notFound('Tarif introuvable');
  return { message: 'Détail du tarif', tarif };
};

const createTarif = async (data) => {
  const existing = await Tarif.findOne({
    where: { villeDepartId: data.villeDepartId, villeArriveeId: data.villeArriveeId, typeColis: data.typeColis || 'standard' }
  });
  if (existing) throw ApiError.conflict('Un tarif existe déjà pour ce trajet et ce type de colis');
  const tarif = await Tarif.create(data);
  return { message: 'Tarif créé.', tarif };
};

const updateTarif = async (id, data) => {
  const tarif = await Tarif.findByPk(id, { include: INCLUDE_VILLES });
  if (!tarif) throw ApiError.notFound('Tarif introuvable');
  await tarif.update(data);
  return { message: 'Tarif mis à jour.', tarif };
};

const calculerPrix = async ({ villeDepartId, villeArriveeId, typeColis, poids }) => {
  const tarif = await Tarif.findOne({ where: { villeDepartId, villeArriveeId, typeColis: typeColis || 'standard', isActive: true } });
  if (!tarif) throw ApiError.notFound('Aucun tarif actif pour ce trajet');

  const montant = Number(tarif.prixFixe) + Number(tarif.prixParKg) * Number(poids);
  return {
    message: 'Simulation de prix',
    simulation: { montant: Number(montant.toFixed(2)), delaiEstimeJours: tarif.delaiEstimeJours, tarifApplique: tarif }
  };
};

module.exports = { getAllTarifs, getTarifById, createTarif, updateTarif, calculerPrix };
