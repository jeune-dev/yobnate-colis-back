const { ArticleTarif } = require('../../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../../errors/AppError');
const { uploadFile, deleteFile } = require('../../../infrastructure/r2.service');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/**
 * Grille forfaitaire (« Nature du colis ») : prix fixes par article, livraison
 * incluse, en colonne Dakar et autres régions, pour le fret maritime ou aérien.
 */
class ArticleTarifService {
  static ORDRE = [
    ['categorie', 'ASC'],
    ['ordreAffichage', 'ASC'],
    ['libelle', 'ASC'],
  ];

  static construireFiltres = (filters = {}) => {
    const where = {};
    if (filters.categorie) where.categorie = filters.categorie;
    if (filters.modeTransport) where.modeTransport = filters.modeTransport;
    if (filters.paysDepart) where.paysDepart = filters.paysDepart;
    if (filters.paysArrivee) where.paysArrivee = filters.paysArrivee;
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    }
    return where;
  };

  static getAll = async (filters = {}) => {
    const articles = await ArticleTarif.findAll({
      where: ArticleTarifService.construireFiltres(filters),
      order: ArticleTarifService.ORDRE,
    });
    return { message: 'Grille tarifaire forfaitaire', articles };
  };

  /** Grille publique : articles actifs uniquement (site vitrine, simulation). */
  static getGrillePublique = async (filters = {}) => {
    const articles = await ArticleTarif.findAll({
      where: { ...ArticleTarifService.construireFiltres(filters), isActive: true },
      attributes: { exclude: ['photoPublicId', 'createdAt', 'updatedAt'] },
      order: ArticleTarifService.ORDRE,
    });
    return { message: 'Nos tarifs', articles };
  };

  static charger = async (id) => {
    const article = await ArticleTarif.findByPk(id);
    if (!article) throw new NotFoundError('Article de la grille introuvable');
    return article;
  };

  static create = async (data, adminId) => {
    if (await ArticleTarif.findOne({ where: { code: data.code } })) {
      throw new ConflictError(`Le code ${data.code} est déjà utilisé`);
    }
    const article = await ArticleTarif.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.article_tarif.create',
      entite: 'ArticleTarif',
      entiteId: article.id,
      details: { code: article.code, prixDakar: data.prixDakar },
    });
    return { message: 'Article ajouté à la grille.', article };
  };

  static update = async (id, data, adminId) => {
    const article = await ArticleTarifService.charger(id);
    if (data.code && data.code !== article.code) {
      if (await ArticleTarif.findOne({ where: { code: data.code } })) {
        throw new ConflictError(`Le code ${data.code} est déjà utilisé`);
      }
    }
    const avant = { prixDakar: article.prixDakar, prixAutresRegions: article.prixAutresRegions };
    await article.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.article_tarif.update',
      entite: 'ArticleTarif',
      entiteId: article.id,
      details: { avant, champs: Object.keys(data) },
    });
    return { message: 'Article mis à jour.', article };
  };

  /**
   * Retire un article de la grille. Les expéditions déjà enregistrées gardent le
   * prix figé à la commande : la suppression est donc sans effet sur l'historique.
   */
  static remove = async (id, adminId) => {
    const article = await ArticleTarifService.charger(id);
    if (article.photoPublicId) await deleteFile(article.photoPublicId);
    await article.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.article_tarif.delete',
      entite: 'ArticleTarif',
      entiteId: id,
    });
    return { message: 'Article retiré de la grille.' };
  };

  static definirPhoto = async (id, fichier, adminId) => {
    if (!fichier) throw new BadRequestError('Aucune photo fournie');
    const article = await ArticleTarifService.charger(id);
    const photo = await uploadFile(fichier.buffer, { folder: 'yobnate-express/grille' });
    const ancienne = article.photoPublicId;
    await article.update({ photoUrl: photo.url, photoPublicId: photo.publicId });
    if (ancienne) await deleteFile(ancienne);
    await logActivity({
      userId: adminId,
      action: 'admin.article_tarif.photo',
      entite: 'ArticleTarif',
      entiteId: id,
    });
    return { message: 'Photo mise à jour.', article };
  };
}

module.exports = ArticleTarifService;
