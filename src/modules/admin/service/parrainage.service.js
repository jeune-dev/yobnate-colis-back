const { Op } = require('sequelize');
const { sequelize, User } = require('../../../models');
const { NotFoundError } = require('../../../errors/AppError');
const { paginate, paginateResult } = require('../../../utils/paginate');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/** Suivi du programme de parrainage : parrains, filleuls et crédits distribués. */
class ParrainageService {
  static getParrains = async (filters = {}, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const nbFilleuls = sequelize.literal(
      '(SELECT COUNT(*) FROM users f WHERE f."parrainId" = "User"."id")'
    );
    const where = {
      role: 'client',
      [Op.or]: [sequelize.where(nbFilleuls, { [Op.gt]: 0 }), { creditParrainage: { [Op.gt]: 0 } }],
    };
    if (filters.recherche) {
      where[Op.and] = [
        {
          [Op.or]: [
            { nom: { [Op.iLike]: `%${filters.recherche}%` } },
            { prenom: { [Op.iLike]: `%${filters.recherche}%` } },
            { codeParrainage: { [Op.iLike]: `%${filters.recherche}%` } },
          ],
        },
      ];
    }
    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [
        'id',
        'nom',
        'prenom',
        'email',
        'telephone',
        'codeParrainage',
        'creditParrainage',
        [nbFilleuls, 'nbFilleuls'],
      ],
      order: [[nbFilleuls, 'DESC']],
      limit,
      offset,
    });
    const [totaux] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE "parrainId" IS NOT NULL)::int AS "filleuls",
              COALESCE(SUM("creditParrainage"), 0)::float AS "creditEnCours"
         FROM users`
    );
    return {
      message: 'Programme de parrainage',
      parrains: rows,
      totaux: totaux[0],
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getFilleuls = async (parrainId) => {
    const parrain = await User.findByPk(parrainId, {
      attributes: ['id', 'nom', 'prenom', 'codeParrainage', 'creditParrainage'],
    });
    if (!parrain) throw new NotFoundError('Client introuvable');
    const filleuls = await User.findAll({
      where: { parrainId },
      attributes: ['id', 'nom', 'prenom', 'email', 'createdAt', 'parrainageRecompense'],
      order: [['createdAt', 'DESC']],
    });
    return { message: 'Filleuls', parrain, filleuls };
  };

  /** Ajustement manuel du crédit (geste commercial, correction). */
  static ajusterCredit = async (userId, { creditParrainage, motif }, adminId) => {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('Client introuvable');
    const ancien = Number(user.creditParrainage);
    await user.update({ creditParrainage });
    await logActivity({
      userId: adminId,
      action: 'admin.parrainage.credit',
      entite: 'User',
      entiteId: userId,
      details: { ancien, nouveau: creditParrainage, motif },
    });
    return { message: 'Crédit de parrainage mis à jour.', utilisateur: user.toSafeJSON() };
  };
}

module.exports = ParrainageService;
