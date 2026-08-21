const { Op } = require('sequelize');
const { Zone, Ville, Tarif } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

/**
 * Zones tarifaires : regroupement de villes d'un même pays partageant un niveau
 * de prix et de délai. Une ville sans zone relève du tarif national par défaut.
 */

class ZoneService {
  static getAllZones = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.pays) where.pays = filters.pays;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${filters.search}%` } },
        { code: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Zone.findAndCountAll({
      where,
      include: [{ model: Ville, as: 'villes', attributes: ['id', 'nom'] }],
      order: [
        ['pays', 'ASC'],
        ['code', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des zones tarifaires',
      zones: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getZoneById = async (id) => {
    const zone = await Zone.findByPk(id, {
      include: [
        { model: Ville, as: 'villes', attributes: ['id', 'nom', 'region', 'isZoneEloignee'] },
      ],
    });
    if (!zone) throw new NotFoundError('Zone introuvable');
    return { message: 'Détail de la zone', zone };
  };

  static createZone = async (data, adminId) => {
    const existante = await Zone.findOne({ where: { code: data.code } });
    if (existante) throw new ConflictError(`Le code de zone « ${data.code} » est déjà utilisé`);

    const zone = await Zone.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.zone.create',
      entite: 'Zone',
      entiteId: zone.id,
    });
    return { message: 'Zone créée.', zone };
  };

  static updateZone = async (id, data, adminId) => {
    const zone = await Zone.findByPk(id);
    if (!zone) throw new NotFoundError('Zone introuvable');

    if (data.code && data.code !== zone.code) {
      const existante = await Zone.findOne({ where: { code: data.code, id: { [Op.ne]: id } } });
      if (existante) throw new ConflictError(`Le code de zone « ${data.code} » est déjà utilisé`);
    }

    await zone.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.zone.update',
      entite: 'Zone',
      entiteId: zone.id,
    });
    return { message: 'Zone mise à jour.', zone };
  };

  /**
   * Supprime une zone. Les villes rattachées basculent sur le tarif national ;
   * la suppression est refusée si des lignes tarifaires y font référence.
   */
  static deleteZone = async (id, adminId) => {
    const zone = await Zone.findByPk(id);
    if (!zone) throw new NotFoundError('Zone introuvable');

    const tarifs = await Tarif.count({
      where: { [Op.or]: [{ zoneDepartId: id }, { zoneArriveeId: id }] },
    });
    if (tarifs > 0) {
      throw new BadRequestError(
        `${tarifs} tarif(s) utilisent cette zone. Supprimez-les ou réaffectez-les d'abord.`
      );
    }

    await Ville.update({ zoneId: null }, { where: { zoneId: id } });
    await zone.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.zone.delete',
      entite: 'Zone',
      entiteId: id,
    });
    return {
      message: 'Zone supprimée, les villes concernées relèvent désormais du tarif national.',
    };
  };

  /** Rattache un lot de villes à une zone, après contrôle de cohérence de pays. */
  static affecterVilles = async (id, villeIds, adminId) => {
    const zone = await Zone.findByPk(id);
    if (!zone) throw new NotFoundError('Zone introuvable');

    const villes = await Ville.findAll({ where: { id: villeIds } });
    if (villes.length !== villeIds.length)
      throw new BadRequestError('Une ou plusieurs villes sont introuvables');

    const horsPays = villes.filter((v) => v.pays !== zone.pays);
    if (horsPays.length) {
      throw new BadRequestError(
        `Ces villes n'appartiennent pas au pays de la zone : ${horsPays.map((v) => v.nom).join(', ')}`
      );
    }

    await Ville.update({ zoneId: id }, { where: { id: villeIds } });
    await logActivity({
      userId: adminId,
      action: 'admin.zone.affecter_villes',
      entite: 'Zone',
      entiteId: id,
      details: { nbVilles: villeIds.length },
    });

    return { message: `${villeIds.length} ville(s) rattachée(s) à la zone « ${zone.nom} ».` };
  };

  static retirerVilles = async (id, villeIds, adminId) => {
    const zone = await Zone.findByPk(id);
    if (!zone) throw new NotFoundError('Zone introuvable');

    const [modifiees] = await Ville.update(
      { zoneId: null },
      { where: { id: villeIds, zoneId: id } }
    );
    await logActivity({
      userId: adminId,
      action: 'admin.zone.retirer_villes',
      entite: 'Zone',
      entiteId: id,
      details: { nbVilles: modifiees },
    });
    return { message: `${modifiees} ville(s) détachée(s) de la zone.` };
  };
}

module.exports = ZoneService;
