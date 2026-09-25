const { Emballage } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');
const { logActivity } = require('../activityLog.service');

/**
 * Emballages proposés aux clients : barigots et cartons à acheter (dimensions et
 * photos présentées dans l'application), prestation d'emballage sur site.
 */
class EmballageService {
  static MAX_PHOTOS = 6;

  static getAll = async (filters = {}) => {
    const where = {};
    if (filters.type) where.type = filters.type;
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    }
    const emballages = await Emballage.findAll({
      where,
      order: [
        ['ordreAffichage', 'ASC'],
        ['libelle', 'ASC'],
      ],
    });
    return { message: 'Emballages', emballages };
  };

  /** Catalogue public, filtrable par catégorie de colis. */
  static getCataloguePublic = async (filters = {}) => {
    const emballages = (
      await Emballage.findAll({
        where: { isActive: true, ...(filters.type ? { type: filters.type } : {}) },
        order: [
          ['ordreAffichage', 'ASC'],
          ['libelle', 'ASC'],
        ],
      })
    )
      .filter(
        (e) => !filters.categorie || (e.categoriesEligibles || []).includes(filters.categorie)
      )
      .map((e) => ({
        ...e.toJSON(),
        photos: (e.photos || []).map((p) => ({ url: p.url })),
        disponible: !e.estEnRupture,
      }));
    return { message: 'Emballages disponibles', emballages };
  };

  static charger = async (id) => {
    const emballage = await Emballage.findByPk(id);
    if (!emballage) throw new NotFoundError('Emballage introuvable');
    return emballage;
  };

  static create = async (data, adminId) => {
    if (await Emballage.findOne({ where: { code: data.code } })) {
      throw new ConflictError(`Le code ${data.code} est déjà utilisé`);
    }
    const emballage = await Emballage.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.emballage.create',
      entite: 'Emballage',
      entiteId: emballage.id,
    });
    return { message: 'Emballage ajouté.', emballage };
  };

  static update = async (id, data, adminId) => {
    const emballage = await EmballageService.charger(id);
    if (data.code && data.code !== emballage.code) {
      if (await Emballage.findOne({ where: { code: data.code } })) {
        throw new ConflictError(`Le code ${data.code} est déjà utilisé`);
      }
    }
    await emballage.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.emballage.update',
      entite: 'Emballage',
      entiteId: id,
      details: { champs: Object.keys(data) },
    });
    return { message: 'Emballage mis à jour.', emballage };
  };

  static remove = async (id, adminId) => {
    const emballage = await EmballageService.charger(id);
    await Promise.allSettled((emballage.photos || []).map((p) => deleteFromCloudinary(p.publicId)));
    await emballage.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.emballage.delete',
      entite: 'Emballage',
      entiteId: id,
    });
    return { message: 'Emballage supprimé.' };
  };

  static ajouterPhotos = async (id, fichiers = [], adminId) => {
    if (!fichiers.length) throw new BadRequestError('Aucune photo fournie');
    const emballage = await EmballageService.charger(id);
    if ((emballage.photos || []).length + fichiers.length > EmballageService.MAX_PHOTOS) {
      throw new BadRequestError(
        `Un emballage ne peut pas porter plus de ${EmballageService.MAX_PHOTOS} photos`
      );
    }
    const photos = await Promise.all(
      fichiers.map((f) => uploadToCloudinary(f.buffer, { folder: 'yobnate-express/emballages' }))
    );
    await emballage.update({ photos: [...(emballage.photos || []), ...photos] });
    await logActivity({
      userId: adminId,
      action: 'admin.emballage.photos',
      entite: 'Emballage',
      entiteId: id,
    });
    return { message: `${photos.length} photo(s) ajoutée(s).`, emballage };
  };

  static retirerPhoto = async (id, publicId, adminId) => {
    const emballage = await EmballageService.charger(id);
    const restantes = (emballage.photos || []).filter((p) => p.publicId !== publicId);
    if (restantes.length === (emballage.photos || []).length) {
      throw new NotFoundError('Photo introuvable');
    }
    await deleteFromCloudinary(publicId).catch(() => {});
    await emballage.update({ photos: restantes });
    await logActivity({
      userId: adminId,
      action: 'admin.emballage.photo_retiree',
      entite: 'Emballage',
      entiteId: id,
    });
    return { message: 'Photo retirée.', emballage };
  };
}

module.exports = EmballageService;
