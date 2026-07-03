const { Facture, Paiement, Colis } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');

const getMesFactures = async (userId, pagination) => {
  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Facture.findAndCountAll({
    where: { userId },
    include: [{ model: Colis, attributes: ['id', 'reference'] }, { model: Paiement }],
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return {
    message: 'Liste de vos factures',
    factures: rows,
    pagination: paginateResult(count, pagination.page, pagination.limit)
  };
};

const getFactureById = async (userId, factureId) => {
  const facture = await Facture.findOne({
    where: { id: factureId, userId },
    include: [{ model: Colis }, { model: Paiement }]
  });
  if (!facture) throw ApiError.notFound('Facture introuvable');
  return { message: 'Détail de la facture', facture };
};

module.exports = { getMesFactures, getFactureById };
