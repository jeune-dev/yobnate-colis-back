const { Op } = require('sequelize');
const { Ville, Zone, PointCollecte, Colis } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const { PAYS } = require('../../constants/pays');

/**
 * Référentiel des villes desservies dans les deux pays du corridor.
 * Une ville porte sa zone tarifaire, ses codes postaux et la disponibilité des
 * prestations à domicile (enlèvement et livraison).
 */

class VilleService {
  static INCLUDE_ZONE = [
    {
      model: Zone,
      as: 'zone',
      attributes: ['id', 'code', 'nom', 'majorationPourcent', 'delaiSupplementaireJours'],
    },
  ];

  static getAllVilles = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.pays) where.pays = filters.pays;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.sansZone === 'true' || filters.sansZone === true) where.zoneId = null;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.isZoneEloignee !== undefined) {
      where.isZoneEloignee = filters.isZoneEloignee === 'true' || filters.isZoneEloignee === true;
    }
    if (filters.search) where.nom = { [Op.iLike]: `%${filters.search}%` };

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Ville.findAndCountAll({
      where,
      include: VilleService.INCLUDE_ZONE,
      order: [
        ['pays', 'ASC'],
        ['nom', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des villes desservies',
      villes: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getVilleById = async (id) => {
    const ville = await Ville.findByPk(id, {
      include: [
        ...VilleService.INCLUDE_ZONE,
        {
          model: PointCollecte,
          as: 'pointsCollecte',
          attributes: ['id', 'code', 'nom', 'type', 'isActive', 'visiblePublic'],
        },
      ],
    });
    if (!ville) throw new NotFoundError('Ville introuvable');
    return {
      message: 'Détail de la ville',
      ville: { ...ville.toJSON(), paysLibelle: PAYS[ville.pays]?.libelle },
    };
  };

  /** Contrôle du format des codes postaux au regard du pays. */
  static validerCodesPostaux = (codesPostaux, pays) => {
    if (!codesPostaux?.length) return;
    const format = PAYS[pays]?.formatCodePostal;
    if (!format) return;
    const invalides = codesPostaux.filter((cp) => !format.test(String(cp)));
    if (invalides.length) {
      throw new BadRequestError(
        `Code postal invalide pour ${PAYS[pays].libelle} : ${invalides.join(', ')}`
      );
    }
  };

  static validerZone = async (zoneId, pays) => {
    if (!zoneId) return null;
    const zone = await Zone.findByPk(zoneId);
    if (!zone) throw new BadRequestError('Zone introuvable');
    if (zone.pays !== pays)
      throw new BadRequestError('La zone doit appartenir au même pays que la ville');
    return zone;
  };

  static createVille = async (data, adminId) => {
    const existante = await Ville.findOne({ where: { nom: data.nom, pays: data.pays } });
    if (existante) throw new ConflictError(`La ville « ${data.nom} » existe déjà pour ce pays`);

    await VilleService.validerZone(data.zoneId, data.pays);
    VilleService.validerCodesPostaux(data.codesPostaux, data.pays);

    const ville = await Ville.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.ville.create',
      entite: 'Ville',
      entiteId: ville.id,
    });
    return { message: 'Ville créée.', ville };
  };

  static updateVille = async (id, data, adminId) => {
    const ville = await Ville.findByPk(id);
    if (!ville) throw new NotFoundError('Ville introuvable');

    const pays = data.pays || ville.pays;
    if (data.nom || data.pays) {
      const doublon = await Ville.findOne({
        where: { nom: data.nom || ville.nom, pays, id: { [Op.ne]: id } },
      });
      if (doublon) throw new ConflictError('Une ville portant ce nom existe déjà pour ce pays');
    }

    if (data.zoneId !== undefined) await VilleService.validerZone(data.zoneId, pays);
    if (data.codesPostaux) VilleService.validerCodesPostaux(data.codesPostaux, pays);

    // Changer une ville de pays invaliderait les points et expéditions déjà rattachés
    if (data.pays && data.pays !== ville.pays) {
      const rattaches = await PointCollecte.count({ where: { villeId: id } });
      if (rattaches > 0) {
        throw new BadRequestError(
          `${rattaches} point(s) de collecte sont rattachés à cette ville : son pays ne peut plus changer`
        );
      }
    }

    await ville.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.ville.update',
      entite: 'Ville',
      entiteId: ville.id,
    });
    return { message: 'Ville mise à jour.', ville };
  };

  static toggleVille = async (id, isActive, adminId) => {
    const ville = await Ville.findByPk(id);
    if (!ville) throw new NotFoundError('Ville introuvable');

    await ville.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.ville.activate' : 'admin.ville.deactivate',
      entite: 'Ville',
      entiteId: ville.id,
    });
    return {
      message: isActive ? 'Ville réactivée.' : 'Ville désactivée : elle ne sera plus proposée.',
      ville,
    };
  };

  static deleteVille = async (id, adminId) => {
    const ville = await Ville.findByPk(id);
    if (!ville) throw new NotFoundError('Ville introuvable');

    const [points, expeditions] = await Promise.all([
      PointCollecte.count({ where: { villeId: id } }),
      Colis.count({ where: { [Op.or]: [{ villeDepartId: id }, { villeArriveeId: id }] } }),
    ]);
    if (points > 0 || expeditions > 0) {
      throw new BadRequestError(
        `Cette ville est référencée par ${points} point(s) et ${expeditions} expédition(s). Désactivez-la plutôt.`
      );
    }

    await ville.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.ville.delete',
      entite: 'Ville',
      entiteId: id,
    });
    return { message: 'Ville supprimée.' };
  };

  /** Liste allégée destinée aux sélecteurs des interfaces client. */
  static getVillesPubliques = async (filters = {}) => {
    const where = { isActive: true };
    if (filters.pays) where.pays = filters.pays;
    if (filters.search) where.nom = { [Op.iLike]: `%${filters.search}%` };

    const villes = await Ville.findAll({
      where,
      attributes: [
        'id',
        'nom',
        'pays',
        'region',
        'codesPostaux',
        'isZoneEloignee',
        'livraisonDomicileDisponible',
        'enlevementDomicileDisponible',
      ],
      order: [['nom', 'ASC']],
      limit: 1000,
    });

    return { message: 'Villes desservies', villes };
  };
}

module.exports = VilleService;
