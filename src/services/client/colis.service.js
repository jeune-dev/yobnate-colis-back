const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, Colis, SuiviColis, Tarif, Facture, Ville } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { genererRefColis, genererRefFacture } = require('../../utils/referenceGenerator');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');
const { logActivity } = require('../activityLog.service');

const VILLE_INCLUDE = [
  { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
  { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }
];

const createWithRetry = async (model, buildAttrs, referenceFactory, attempts = 3, transaction = null) => {
  for (let i = 0; i < attempts; i += 1) {
    const reference = await referenceFactory();
    try {
      return await model.create(buildAttrs(reference), transaction ? { transaction } : {});
    } catch (err) {
      if (err instanceof UniqueConstraintError && i < attempts - 1) continue;
      throw err;
    }
  }
  throw ApiError.badRequest('Impossible de générer une référence unique, réessayez');
};

const declarerColis = async (userId, data, files = []) => {
  const tarif = await Tarif.findOne({
    where: {
      villeDepartId: data.villeDepartId,
      villeArriveeId: data.villeArriveeId,
      typeColis: data.typeColis || 'standard',
      isActive: true
    }
  });
  if (!tarif) throw ApiError.badRequest('Aucun tarif actif disponible pour ce trajet et ce type de colis');

  const montant = Number(tarif.prixFixe) + Number(tarif.prixParKg) * Number(data.poids);

  // Upload en parallèle avant la transaction (évite de garder la connexion DB ouverte pendant l'I/O réseau)
  const photos = await Promise.all(
    files.map((f) => uploadToCloudinary(f.buffer, { folder: 'yobnate-colis/colis' }))
  );

  let result;
  try {
    result = await sequelize.transaction(async (t) => {
      const colis = await createWithRetry(
        Colis,
        (reference) => ({
          ...data,
          reference,
          userId,
          montant,
          photos,
          dateLivraisonEstimee: new Date(Date.now() + tarif.delaiEstimeJours * 24 * 60 * 60 * 1000)
        }),
        () => genererRefColis(Colis),
        3,
        t
      );

      await SuiviColis.create(
        { colisId: colis.id, statut: 'en_attente', commentaire: 'Colis enregistré', createdBy: userId },
        { transaction: t }
      );

      const facture = await createWithRetry(
        Facture,
        (reference) => ({
          reference,
          colisId: colis.id,
          userId,
          montantTransport: montant,
          montantTotal: montant,
          dateLimitePaiement: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }),
        () => genererRefFacture(Facture),
        3,
        t
      );

      return { colis, facture };
    });
  } catch (err) {
    // Nettoyer les fichiers Cloudinary si la transaction DB a échoué
    if (photos.length) {
      await Promise.allSettled(photos.map((p) => deleteFromCloudinary(p.publicId)));
    }
    throw err;
  }

  await logActivity({ userId, action: 'colis.create', entite: 'Colis', entiteId: result.colis.id });
  return { message: 'Colis enregistré avec succès.', colis: result.colis, facture: result.facture };
};

const getMesColis = async (userId, filters, pagination) => {
  const where = { userId };
  if (filters.statut) where.statut = filters.statut;
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
    if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
  }

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Colis.findAndCountAll({
    where,
    include: VILLE_INCLUDE,
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  return { message: 'Liste de vos colis', colis: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

const getColisById = async (userId, colisId) => {
  const colis = await Colis.findOne({
    where: { id: colisId, userId },
    include: [
      ...VILLE_INCLUDE,
      { model: SuiviColis, as: 'historique', order: [['createdAt', 'ASC']] },
      { model: Facture }
    ]
  });
  if (!colis) throw ApiError.notFound('Colis introuvable');
  return { message: 'Détail du colis', colis };
};

const getSuiviColis = async (userId, colisId) => {
  const colis = await Colis.findOne({ where: { id: colisId, userId }, attributes: ['id'] });
  if (!colis) throw ApiError.notFound('Colis introuvable');
  const historique = await SuiviColis.findAll({
    where: { colisId },
    order: [['createdAt', 'ASC']]
  });
  return { message: 'Historique de suivi du colis', historique };
};

const annulerColis = async (userId, colisId, motif) => {
  const colis = await Colis.findOne({ where: { id: colisId, userId } });
  if (!colis) throw ApiError.notFound('Colis introuvable');
  if (!['en_attente', 'en_preparation'].includes(colis.statut)) {
    throw ApiError.badRequest('Ce colis ne peut plus être annulé à ce stade');
  }

  await sequelize.transaction(async (t) => {
    await colis.update({ statut: 'annule', annuleMotif: motif || null }, { transaction: t });
    await SuiviColis.create(
      { colisId: colis.id, statut: 'annule', commentaire: motif || 'Annulé par le client', createdBy: userId },
      { transaction: t }
    );
    await Facture.update({ statut: 'annulee' }, { where: { colisId: colis.id }, transaction: t });
  });

  await logActivity({ userId, action: 'colis.cancel', entite: 'Colis', entiteId: colis.id });
  return { message: 'Colis annulé.', colis };
};

module.exports = { declarerColis, getMesColis, getColisById, getSuiviColis, annulerColis };
