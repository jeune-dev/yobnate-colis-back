const { Op } = require('sequelize');
const { Surcharge, ServiceExpedition } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { logActivity } = require('../activityLog.service');

/**
 * Surcharges et frais annexes.
 * Le moteur de tarification applique automatiquement celles marquées comme telles ;
 * les autres restent à la main des agents lors du traitement d'une expédition.
 */

class SurchargeService {
  static INCLUDE_SERVICE = [
    { model: ServiceExpedition, as: 'service', attributes: ['id', 'code', 'nom'] },
  ];

  static getAllSurcharges = async (filters = {}) => {
    const where = {};
    if (filters.type) where.type = filters.type;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.automatique !== undefined) {
      where.automatique = filters.automatique === 'true' || filters.automatique === true;
    }

    const surcharges = await Surcharge.findAll({
      where,
      include: SurchargeService.INCLUDE_SERVICE,
      order: [
        ['ordreApplication', 'ASC'],
        ['type', 'ASC'],
      ],
    });
    return { message: 'Liste des surcharges', surcharges };
  };

  static getSurchargeById = async (id) => {
    const surcharge = await Surcharge.findByPk(id, { include: SurchargeService.INCLUDE_SERVICE });
    if (!surcharge) throw new NotFoundError('Surcharge introuvable');
    return { message: 'Détail de la surcharge', surcharge };
  };

  static validerCoherence = (data) => {
    if (data.mode === 'pourcentage' && Number(data.valeur) > 100) {
      throw new BadRequestError('Une surcharge en pourcentage ne peut pas dépasser 100 %');
    }
    if (data.mode !== 'pourcentage' && data.assiette && data.assiette !== 'fret') {
      // L'assiette n'a de sens que pour un calcul proportionnel
      data.assiette = 'fret';
    }
  };

  static createSurcharge = async (data, adminId) => {
    const existante = await Surcharge.findOne({ where: { code: data.code } });
    if (existante)
      throw new ConflictError(`Le code « ${data.code} » est déjà utilisé par une autre surcharge`);

    if (data.serviceId) {
      const service = await ServiceExpedition.findByPk(data.serviceId);
      if (!service) throw new BadRequestError('Service introuvable');
    }
    SurchargeService.validerCoherence(data);

    const surcharge = await Surcharge.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.surcharge.create',
      entite: 'Surcharge',
      entiteId: surcharge.id,
      details: { code: surcharge.code, type: surcharge.type },
    });
    return { message: 'Surcharge créée.', surcharge };
  };

  static updateSurcharge = async (id, data, adminId) => {
    const surcharge = await Surcharge.findByPk(id);
    if (!surcharge) throw new NotFoundError('Surcharge introuvable');

    if (data.code && data.code !== surcharge.code) {
      const existante = await Surcharge.findOne({
        where: { code: data.code, id: { [Op.ne]: id } },
      });
      if (existante) throw new ConflictError(`Le code « ${data.code} » est déjà utilisé`);
    }
    SurchargeService.validerCoherence({
      mode: data.mode || surcharge.mode,
      valeur: data.valeur ?? surcharge.valeur,
      ...data,
    });

    const avant = { valeur: surcharge.valeur, mode: surcharge.mode, isActive: surcharge.isActive };
    await surcharge.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.surcharge.update',
      entite: 'Surcharge',
      entiteId: surcharge.id,
      details: {
        avant,
        apres: { valeur: surcharge.valeur, mode: surcharge.mode, isActive: surcharge.isActive },
      },
    });
    return { message: 'Surcharge mise à jour.', surcharge };
  };

  static toggleSurcharge = async (id, isActive, adminId) => {
    const surcharge = await Surcharge.findByPk(id);
    if (!surcharge) throw new NotFoundError('Surcharge introuvable');

    await surcharge.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.surcharge.activate' : 'admin.surcharge.deactivate',
      entite: 'Surcharge',
      entiteId: surcharge.id,
    });
    return { message: isActive ? 'Surcharge activée.' : 'Surcharge désactivée.', surcharge };
  };

  static deleteSurcharge = async (id, adminId) => {
    const surcharge = await Surcharge.findByPk(id);
    if (!surcharge) throw new NotFoundError('Surcharge introuvable');

    await surcharge.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.surcharge.delete',
      entite: 'Surcharge',
      entiteId: id,
    });
    return { message: 'Surcharge supprimée.' };
  };

  /**
   * Simule l'application des surcharges actives sur un montant de fret donné.
   * Permet de vérifier un paramétrage avant de le mettre en production.
   */
  static simuler = async ({ fret, poidsKg = 1, valeurDeclaree = 0 }) => {
    const surcharges = await Surcharge.findAll({
      where: { isActive: true },
      order: [['ordreApplication', 'ASC']],
    });

    let cumul = 0;
    const lignes = surcharges.map((s) => {
      const assiette =
        s.assiette === 'fret_et_surcharges'
          ? Number(fret) + cumul
          : s.assiette === 'valeur_declaree'
            ? Number(valeurDeclaree)
            : Number(fret);
      const montant = s.calculer({ assiette, poidsKg });
      cumul += montant;
      return {
        code: s.code,
        libelle: s.libelle,
        type: s.type,
        mode: s.mode,
        automatique: s.automatique,
        assiette,
        montant,
      };
    });

    return {
      message: 'Simulation des surcharges',
      simulation: {
        fret: Number(fret),
        lignes,
        totalSurcharges: Number(cumul.toFixed(2)),
        total: Number(fret) + cumul,
      },
    };
  };
}

module.exports = SurchargeService;
