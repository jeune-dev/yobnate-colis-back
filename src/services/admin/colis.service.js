const { Op } = require('sequelize');
const { Colis, SuiviColis, Ville, User, Facture, Paiement, Tarif, Notification } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { sendColisStatutEmail } = require('../../utils/mailer');
const { logActivity } = require('../activityLog.service');
const { uploadToCloudinary } = require('../../middlewares/uploadService');

const ALLOWED_TRANSITIONS = {
  en_attente: ['en_preparation', 'annule'],
  en_preparation: ['en_transit', 'annule'],
  en_transit: ['arrive'],
  arrive: ['recupere', 'livre'],
  recupere: [],
  livre: [],
  annule: []
};

const INCLUDE_DETAIL = [
  { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] },
  { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
  { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
  { model: SuiviColis, as: 'historique', include: [{ model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom'] }] },
  { model: Facture, include: [Paiement] }
];

const getAllColis = async (filters, pagination) => {
  const where = {};
  if (filters.statut) where.statut = filters.statut;
  if (filters.villeDepartId) where.villeDepartId = filters.villeDepartId;
  if (filters.villeArriveeId) where.villeArriveeId = filters.villeArriveeId;
  if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
  if (filters.expediteur) where.expediteurNom = { [Op.iLike]: `%${filters.expediteur}%` };
  if (filters.destinataire) where.destinataireNom = { [Op.iLike]: `%${filters.destinataire}%` };
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
    if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
  }

  const sortableFields = ['createdAt', 'statut', 'montant', 'poids'];
  const sortBy = sortableFields.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const { limit, offset } = paginate(pagination);
  const { rows, count } = await Colis.findAndCountAll({
    where,
    include: [
      { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email'] },
      { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
      { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true
  });

  return { message: 'Liste des colis', colis: rows, pagination: paginateResult(count, pagination.page, pagination.limit) };
};

const getColisById = async (id) => {
  const colis = await Colis.findByPk(id, { include: INCLUDE_DETAIL });
  if (!colis) throw ApiError.notFound('Colis introuvable');
  return { message: 'Détail du colis', colis };
};

const updateColis = async (id, data, adminId) => {
  const colis = await Colis.findByPk(id);
  if (!colis) throw ApiError.notFound('Colis introuvable');

  const affectePrix = data.poids !== undefined || data.typeColis !== undefined ||
    data.villeDepartId !== undefined || data.villeArriveeId !== undefined;

  if (affectePrix) {
    const tarif = await Tarif.findOne({
      where: {
        villeDepartId: data.villeDepartId || colis.villeDepartId,
        villeArriveeId: data.villeArriveeId || colis.villeArriveeId,
        typeColis: data.typeColis || colis.typeColis,
        isActive: true
      }
    });
    if (tarif) {
      const poids = data.poids !== undefined ? Number(data.poids) : Number(colis.poids);
      data.montant = Number(tarif.prixFixe) + Number(tarif.prixParKg) * poids;
      await Facture.update({ montantTransport: data.montant, montantTotal: data.montant }, { where: { colisId: id } });
    }
  }

  await colis.update(data);
  await logActivity({ userId: adminId, action: 'admin.colis.update', entite: 'Colis', entiteId: colis.id });
  return { message: 'Colis mis à jour.', colis };
};

const updateStatutColis = async (id, { statut, localisation, commentaire, annuleMotif }, adminId) => {
  const colis = await Colis.findByPk(id, { include: [{ model: User, as: 'client' }] });
  if (!colis) throw ApiError.notFound('Colis introuvable');

  const allowed = ALLOWED_TRANSITIONS[colis.statut] || [];
  if (!allowed.includes(statut)) {
    throw ApiError.badRequest(`Transition de statut invalide : ${colis.statut} -> ${statut}`);
  }

  const updates = { statut };
  if (statut === 'annule') updates.annuleMotif = annuleMotif || commentaire || null;
  if (['recupere', 'livre'].includes(statut)) updates.dateLivraisonEffective = new Date();

  await colis.update(updates);
  await SuiviColis.create({ colisId: colis.id, statut, localisation, commentaire, createdBy: adminId });
  await logActivity({ userId: adminId, action: 'admin.colis.statut', entite: 'Colis', entiteId: colis.id, details: { statut } });

  if (colis.client) {
    await sendColisStatutEmail(colis.client, colis);
    await Notification.create({
      userId: colis.client.id,
      titre: `Colis ${colis.reference} — statut mis à jour`,
      message: `Votre colis est maintenant : ${statut.replace(/_/g, ' ')}`,
      type: 'colis',
      lienCible: `/colis/${colis.id}`
    }).catch(() => {});
  }

  return { message: 'Statut du colis mis à jour.', colis };
};

const ajouterPhotos = async (id, files = []) => {
  const colis = await Colis.findByPk(id);
  if (!colis) throw ApiError.notFound('Colis introuvable');

  const uploaded = [];
  for (const file of files) {
    uploaded.push(await uploadToCloudinary(file.buffer, { folder: 'yobnate-colis/colis' }));
  }

  await colis.update({ photos: [...colis.photos, ...uploaded] });
  return { message: 'Photos ajoutées.', colis };
};

const getStatistiques = async () => {
  const parStatut = await Colis.findAll({
    attributes: ['statut', [Colis.sequelize.fn('COUNT', Colis.sequelize.col('id')), 'total']],
    group: ['statut']
  });
  return {
    message: 'Statistiques des colis',
    statistiques: parStatut.map((r) => ({ statut: r.statut, total: Number(r.get('total')) }))
  };
};

module.exports = { getAllColis, getColisById, updateColis, updateStatutColis, ajouterPhotos, getStatistiques };
