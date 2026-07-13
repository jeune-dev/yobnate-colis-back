const { Op } = require('sequelize');
const { Paiement, Facture, User, Notification } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { sendPaiementConfirmeEmail } = require('../../utils/mailer');
const { logActivity } = require('../activityLog.service');

const INCLUDE_DETAIL = [{ model: Facture }, { model: User, attributes: ['id', 'nom', 'prenom', 'email'] }];

const getAllPaiements = async (filters, pagination) => {
  const where = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.statut) where.statut = filters.statut;
  if (filters.methode) where.methode = filters.methode;
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
    if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
  }

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Paiement.findAndCountAll({
    where,
    include: INCLUDE_DETAIL,
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
  return { message: 'Liste des paiements', paiements: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

const getPaiementById = async (id) => {
  const paiement = await Paiement.findByPk(id, { include: INCLUDE_DETAIL });
  if (!paiement) throw ApiError.notFound('Paiement introuvable');
  return { message: 'Détail du paiement', paiement };
};

const enregistrerPaiement = async (factureId, { methode, reference, montant }, adminId) => {
  const facture = await Facture.findByPk(factureId, { include: [{ model: Paiement }, { model: User }] });
  if (!facture) throw ApiError.notFound('Facture introuvable');
  if (facture.statut !== 'en_attente') throw ApiError.badRequest('Cette facture n\'est pas en attente de paiement');
  if (facture.Paiement) throw ApiError.conflict('Un paiement existe déjà pour cette facture');

  const paiement = await Paiement.create({
    factureId,
    userId: facture.userId,
    montant,
    methode,
    reference,
    statut: 'succes',
    recordedBy: adminId,
    payeAt: new Date()
  });

  await facture.update({ statut: 'payee' });
  await logActivity({ userId: adminId, action: 'admin.paiement.record', entite: 'Paiement', entiteId: paiement.id });

  if (facture.User) {
    await sendPaiementConfirmeEmail(facture.User, paiement, facture);
    await Notification.create({
      userId: facture.userId,
      titre: `Paiement confirmé — Facture ${facture.reference}`,
      message: `Votre paiement de ${montant} FCFA a été enregistré avec succès.`,
      type: 'paiement',
      lienCible: `/factures/${facture.id}`
    }).catch(() => {});
  }
  return { message: 'Paiement enregistré.', paiement };
};

const rembourserPaiement = async (id, adminId) => {
  const { paiement } = await getPaiementById(id);
  if (paiement.statut !== 'succes') throw ApiError.badRequest('Seul un paiement réussi peut être remboursé');

  await paiement.update({ statut: 'rembourse' });
  await Facture.update({ statut: 'en_attente' }, { where: { id: paiement.factureId } });
  await logActivity({ userId: adminId, action: 'admin.paiement.refund', entite: 'Paiement', entiteId: paiement.id });
  return { message: 'Paiement remboursé.', paiement };
};

module.exports = { getAllPaiements, getPaiementById, enregistrerPaiement, rembourserPaiement };
