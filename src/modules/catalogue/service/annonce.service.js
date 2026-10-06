const { Op } = require('sequelize');
const { Annonce } = require('../../../models');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const { uploadFile, deleteFile } = require('../../../infrastructure/r2.service');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/**
 * Messages de la page d'accueil de l'application, publiés par l'administrateur :
 * prochaine collecte, fermeture exceptionnelle, promotion…
 */
class AnnonceService {
  static verifierDates = (dateDebut, dateFin) => {
    if (dateDebut && dateFin && new Date(dateFin) < new Date(dateDebut)) {
      throw new BadRequestError('La date de fin doit suivre la date de début');
    }
  };

  static charger = async (id) => {
    const annonce = await Annonce.findByPk(id);
    if (!annonce) throw new NotFoundError('Annonce introuvable');
    return annonce;
  };

  static getAll = async (filters = {}) => {
    const where = {};
    if (filters.emplacement) where.emplacement = filters.emplacement;
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    }
    const annonces = await Annonce.findAll({
      where,
      order: [
        ['priorite', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
    return {
      message: 'Annonces',
      annonces: annonces.map((a) => ({ ...a.toJSON(), estEnLigne: a.estEnLigne })),
    };
  };

  /** Annonces actuellement en ligne, pour l'accueil de l'application et du site. */
  static getEnLigne = async ({ emplacement } = {}) => {
    const maintenant = new Date();
    const annonces = await Annonce.findAll({
      where: {
        isActive: true,
        ...(emplacement ? { emplacement } : {}),
        [Op.and]: [
          { [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: maintenant } }] },
          { [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: maintenant } }] },
        ],
      },
      attributes: [
        'id',
        'titre',
        'message',
        'emplacement',
        'niveau',
        'lienUrl',
        'lienLibelle',
        'imageUrl',
        'dateFin',
        'priorite',
      ],
      order: [
        ['priorite', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
    return { message: 'Annonces en cours', annonces };
  };

  static create = async (data, adminId) => {
    AnnonceService.verifierDates(data.dateDebut, data.dateFin);
    const annonce = await Annonce.create({ ...data, creePar: adminId });
    await logActivity({
      userId: adminId,
      action: 'admin.annonce.create',
      entite: 'Annonce',
      entiteId: annonce.id,
    });
    return { message: 'Annonce publiée.', annonce };
  };

  static update = async (id, data, adminId) => {
    const annonce = await AnnonceService.charger(id);
    AnnonceService.verifierDates(
      data.dateDebut !== undefined ? data.dateDebut : annonce.dateDebut,
      data.dateFin !== undefined ? data.dateFin : annonce.dateFin
    );
    await annonce.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.annonce.update',
      entite: 'Annonce',
      entiteId: id,
    });
    return { message: 'Annonce mise à jour.', annonce };
  };

  static remove = async (id, adminId) => {
    const annonce = await AnnonceService.charger(id);
    if (annonce.imagePublicId) await deleteFile(annonce.imagePublicId);
    await annonce.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.annonce.delete',
      entite: 'Annonce',
      entiteId: id,
    });
    return { message: 'Annonce supprimée.' };
  };

  static definirImage = async (id, fichier, adminId) => {
    if (!fichier) throw new BadRequestError('Aucune image fournie');
    const annonce = await AnnonceService.charger(id);
    const image = await uploadFile(fichier.buffer, { folder: 'yobante-colis/annonces' });
    const ancienne = annonce.imagePublicId;
    await annonce.update({ imageUrl: image.url, imagePublicId: image.publicId });
    if (ancienne) await deleteFile(ancienne);
    await logActivity({
      userId: adminId,
      action: 'admin.annonce.image',
      entite: 'Annonce',
      entiteId: id,
    });
    return { message: 'Image mise à jour.', annonce };
  };
}

module.exports = AnnonceService;
