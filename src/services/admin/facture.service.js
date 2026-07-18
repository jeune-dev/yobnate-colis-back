const { Op } = require('sequelize');
const { Facture, Colis, User, Paiement } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

const INCLUDE_DETAIL = [
  { model: Colis, attributes: ['id', 'reference', 'statut'] },
  { model: User, attributes: ['id', 'nom', 'prenom', 'email'] },
  { model: Paiement }
];

const getAllFactures = async (filters, pagination) => {
  const where = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.statut) where.statut = filters.statut;
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
    if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
  }

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Facture.findAndCountAll({
    where,
    include: INCLUDE_DETAIL,
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return { message: 'Liste des factures', factures: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

const getFactureById = async (id) => {
  const facture = await Facture.findByPk(id, { include: INCLUDE_DETAIL });
  if (!facture) throw ApiError.notFound('Facture introuvable');
  return { message: 'Détail de la facture', facture };
};

const annulerFacture = async (id, adminId) => {
  const { facture } = await getFactureById(id);
  if (facture.statut === 'payee') throw ApiError.badRequest('Une facture déjà payée ne peut pas être annulée');

  await facture.update({ statut: 'annulee' });
  await logActivity({ userId: adminId, action: 'admin.facture.cancel', entite: 'Facture', entiteId: facture.id });
  return { message: 'Facture annulée.', facture };
};

/**
 * Applique une remise (en FCFA) sur une facture en attente.
 * Recalcule montantTotal = montantTransport - remise (min 0).
 */
const appliquerRemise = async (id, remise, adminId) => {
  const { facture } = await getFactureById(id);
  if (facture.statut !== 'en_attente') {
    throw ApiError.badRequest('La remise ne peut être appliquée que sur une facture en attente');
  }
  if (remise < 0) throw ApiError.badRequest('La remise ne peut pas être négative');
  if (remise > Number(facture.montantTransport)) {
    throw ApiError.badRequest('La remise ne peut pas dépasser le montant de transport');
  }

  const montantTotal = Number(facture.montantTransport) - remise;
  await facture.update({ remise, montantTotal });
  await logActivity({ userId: adminId, action: 'admin.facture.remise', entite: 'Facture', entiteId: facture.id, details: { remise } });
  return { message: `Remise de ${remise} FCFA appliquée.`, facture };
};

module.exports = { getAllFactures, getFactureById, annulerFacture, appliquerRemise };
