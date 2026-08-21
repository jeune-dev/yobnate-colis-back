const { Op } = require('sequelize');
const { User, Colis, Facture, Ville } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

/**
 * Gestion des comptes clients (particuliers et entreprises).
 */

class UserService {
  static SORTABLE = ['createdAt', 'nom', 'lastLoginAt'];

  static getAllUsers = async (filters = {}, pagination = {}) => {
    const where = { role: 'client' };
    if (filters.search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${filters.search}%` } },
        { prenom: { [Op.iLike]: `%${filters.search}%` } },
        { email: { [Op.iLike]: `%${filters.search}%` } },
        { telephone: { [Op.iLike]: `%${filters.search}%` } },
        { raisonSociale: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }
    if (filters.pays) where.pays = filters.pays;
    if (filters.typeCompte) where.typeCompte = filters.typeCompte;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;

    const sortBy = UserService.SORTABLE.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      include: [{ model: Ville, as: 'ville', attributes: ['id', 'nom'] }],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
    });

    return {
      message: 'Liste des clients',
      utilisateurs: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getUserById = async (id) => {
    const user = await User.findOne({
      where: { id, role: 'client' },
      attributes: { exclude: ['password'] },
      include: [{ model: Ville, as: 'ville', attributes: ['id', 'nom'] }],
    });
    if (!user) throw new NotFoundError('Client introuvable');

    const [nbColisEnvoyes, nbColisLivres, encours] = await Promise.all([
      Colis.count({ where: { userId: id } }),
      Colis.count({ where: { userId: id, statut: 'livre' } }),
      Facture.sum('montantTotal', {
        where: { userId: id, statut: { [Op.in]: ['en_attente', 'partiellement_payee'] } },
      }),
    ]);

    return {
      message: 'Détail du client',
      utilisateur: {
        ...user.toJSON(),
        stats: { nbColisEnvoyes, nbColisLivres, encours: Number(encours || 0) },
      },
    };
  };

  static getUserColis = async (userId, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Colis.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    return {
      message: 'Expéditions du client',
      colis: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static setActive = async (id, isActive, adminId) => {
    const user = await User.findOne({ where: { id, role: 'client' } });
    if (!user) throw new NotFoundError('Client introuvable');

    await user.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.user.activate' : 'admin.user.deactivate',
      entite: 'User',
      entiteId: user.id,
    });
    return {
      message: isActive ? 'Client activé.' : 'Client désactivé.',
      utilisateur: user.toSafeJSON(),
    };
  };

  /** Accorde ou modifie les conditions commerciales d'un compte professionnel. */
  static definirConditionsCommerciales = async (
    id,
    { remiseContractuelle, paiementDiffereAutorise, plafondEncours },
    adminId
  ) => {
    const user = await User.findOne({ where: { id, role: 'client' } });
    if (!user) throw new NotFoundError('Client introuvable');
    if (user.typeCompte !== 'entreprise') {
      throw new BadRequestError(
        "Les conditions commerciales ne s'appliquent qu'aux comptes entreprise"
      );
    }

    await user.update({
      ...(remiseContractuelle !== undefined && { remiseContractuelle }),
      ...(paiementDiffereAutorise !== undefined && { paiementDiffereAutorise }),
      ...(plafondEncours !== undefined && { plafondEncours }),
    });

    await logActivity({
      userId: adminId,
      action: 'admin.user.conditions_commerciales',
      entite: 'User',
      entiteId: user.id,
      details: { remiseContractuelle, paiementDiffereAutorise, plafondEncours },
    });
    return { message: 'Conditions commerciales mises à jour.', utilisateur: user.toSafeJSON() };
  };
}

module.exports = UserService;
