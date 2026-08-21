const { Op } = require('sequelize');
const { ServiceExpedition, Tarif, Colis } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { logActivity } = require('../activityLog.service');

/**
 * Catalogue des produits d'expédition (Express, Standard, Économique).
 * Chaque service porte ses engagements de délai, son heure limite de dépôt et
 * ses règles de gabarit ; la grille tarifaire s'y rattache.
 */

class ServiceExpeditionService {
  static getAllServices = async (filters = {}) => {
    const where = {};
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.modeTransport) where.modeTransport = filters.modeTransport;

    const services = await ServiceExpedition.findAll({
      where,
      order: [
        ['ordreAffichage', 'ASC'],
        ['nom', 'ASC'],
      ],
    });
    return { message: "Catalogue des services d'expédition", services };
  };

  static getServiceById = async (id) => {
    const service = await ServiceExpedition.findByPk(id, {
      include: [{ model: Tarif, as: 'tarifs' }],
    });
    if (!service) throw new NotFoundError('Service introuvable');
    return { message: 'Détail du service', service };
  };

  static createService = async (data, adminId) => {
    const existant = await ServiceExpedition.findOne({ where: { code: data.code } });
    if (existant) throw new ConflictError(`Le code de service « ${data.code} » est déjà utilisé`);

    const service = await ServiceExpedition.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.service.create',
      entite: 'ServiceExpedition',
      entiteId: service.id,
      details: { code: service.code },
    });
    return { message: 'Service créé.', service };
  };

  static updateService = async (id, data, adminId) => {
    const service = await ServiceExpedition.findByPk(id);
    if (!service) throw new NotFoundError('Service introuvable');

    if (data.code && data.code !== service.code) {
      const existant = await ServiceExpedition.findOne({
        where: { code: data.code, id: { [Op.ne]: id } },
      });
      if (existant) throw new ConflictError(`Le code de service « ${data.code} » est déjà utilisé`);
    }

    await service.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.service.update',
      entite: 'ServiceExpedition',
      entiteId: service.id,
    });
    return { message: 'Service mis à jour.', service };
  };

  /**
   * Active ou désactive un service.
   * Désactiver n'affecte pas les expéditions en cours : seules les nouvelles
   * commandes cessent de le proposer.
   */
  static toggleService = async (id, isActive, adminId) => {
    const service = await ServiceExpedition.findByPk(id);
    if (!service) throw new NotFoundError('Service introuvable');

    if (!isActive) {
      const actifs = await ServiceExpedition.count({
        where: { isActive: true, id: { [Op.ne]: id } },
      });
      if (actifs === 0) {
        throw new BadRequestError(
          'Au moins un service doit rester actif pour que le service commercial fonctionne'
        );
      }
    }

    await service.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.service.activate' : 'admin.service.deactivate',
      entite: 'ServiceExpedition',
      entiteId: service.id,
    });
    return { message: isActive ? 'Service activé.' : 'Service désactivé.', service };
  };

  static deleteService = async (id, adminId) => {
    const service = await ServiceExpedition.findByPk(id);
    if (!service) throw new NotFoundError('Service introuvable');

    const expeditions = await Colis.count({ where: { serviceId: id } });
    if (expeditions > 0) {
      throw new BadRequestError(
        `${expeditions} expédition(s) utilisent ce service. Désactivez-le plutôt que de le supprimer.`
      );
    }

    await Tarif.destroy({ where: { serviceId: id } });
    await service.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.service.delete',
      entite: 'ServiceExpedition',
      entiteId: id,
      details: { code: service.code },
    });
    return { message: 'Service et grille tarifaire associée supprimés.' };
  };

  /** Catalogue public : uniquement les services actifs et leurs engagements. */
  static getServicesPublics = async () => {
    const services = await ServiceExpedition.findAll({
      where: { isActive: true },
      attributes: [
        'id',
        'code',
        'nom',
        'description',
        'modeTransport',
        'delaiMinJours',
        'delaiMaxJours',
        'joursOuvresUniquement',
        'heureLimiteDepot',
        'poidsMaxKg',
        'dimensionsMaxCm',
        'typesContenuAutorises',
        'assuranceIncluse',
        'livraisonSamedi',
        'suiviDetaille',
      ],
      order: [['ordreAffichage', 'ASC']],
    });

    return {
      message: 'Services proposés',
      services: services.map((s) => ({
        ...s.toJSON(),
        delaiAnnonce:
          s.delaiMinJours === s.delaiMaxJours
            ? `${s.delaiMaxJours} jour(s)`
            : `${s.delaiMinJours} à ${s.delaiMaxJours} jours`,
      })),
    };
  };
}

module.exports = ServiceExpeditionService;
