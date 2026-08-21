const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { User, PointCollecte, Colis, DemandeEnlevement } = require('../../models');
const { bcryptConfig } = require('../../config/security');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');

/**
 * Gestion du personnel opérationnel : coursiers et agents de point de collecte.
 *
 * Un coursier opère dans un pays et reçoit ses missions d'enlèvement ou de
 * livraison ; un agent de point est rattaché à un point de collecte précis et
 * gère les flux qui y transitent. Ces comptes sont créés uniquement par un
 * administrateur — il n'existe pas d'auto-inscription pour ces rôles.
 */

class PersonnelService {
  static ROLES_PERSONNEL = { [Op.in]: ['coursier', 'agent_point'] };

  static getAllPersonnel = async (filters = {}, pagination = {}) => {
    const where = {
      role:
        filters.role && ['coursier', 'agent_point'].includes(filters.role)
          ? filters.role
          : PersonnelService.ROLES_PERSONNEL,
    };
    if (filters.pays) where.pays = filters.pays;
    if (filters.pointCollecteId) where.pointCollecteId = filters.pointCollecteId;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${filters.search}%` } },
        { prenom: { [Op.iLike]: `%${filters.search}%` } },
        { email: { [Op.iLike]: `%${filters.search}%` } },
        { telephone: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      include: [
        { model: PointCollecte, as: 'pointAffectation', attributes: ['id', 'code', 'nom'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      message: 'Personnel opérationnel',
      personnel: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getPersonnelById = async (id) => {
    const personne = await User.findOne({
      where: { id, role: PersonnelService.ROLES_PERSONNEL },
      attributes: { exclude: ['password'] },
      include: [
        {
          model: PointCollecte,
          as: 'pointAffectation',
          attributes: ['id', 'code', 'nom', 'adresse'],
        },
      ],
    });
    if (!personne) throw new NotFoundError('Membre du personnel introuvable');

    const stats =
      personne.role === 'coursier'
        ? {
            missionsEnlevement: await Colis.count({ where: { coursierEnlevementId: id } }),
            missionsLivraison: await Colis.count({ where: { coursierLivraisonId: id } }),
            enlevementsEffectues: await DemandeEnlevement.count({
              where: { coursierId: id, statut: 'effectue' },
            }),
          }
        : null;

    return { message: 'Détail du membre du personnel', personne: { ...personne.toJSON(), stats } };
  };

  /** Le point d'affectation d'un agent doit exister et se situer dans son pays. */
  static validerAffectation = async (role, pays, pointCollecteId) => {
    if (role !== 'agent_point' || !pointCollecteId) return;
    const point = await PointCollecte.findByPk(pointCollecteId);
    if (!point) throw new BadRequestError('Point de collecte introuvable');
    if (point.pays !== pays)
      throw new BadRequestError("Le point d'affectation doit se situer dans le même pays");
  };

  static createPersonnel = async (data, adminId) => {
    if (!['coursier', 'agent_point'].includes(data.role)) {
      throw new BadRequestError('Rôle invalide pour un compte de personnel');
    }

    const existant = await User.findOne({
      where: { [Op.or]: [{ email: data.email }, { telephone: data.telephone }] },
    });
    if (existant)
      throw new ConflictError('Un compte existe déjà avec cet email ou ce numéro de téléphone');

    await PersonnelService.validerAffectation(data.role, data.pays, data.pointCollecteId);

    const password = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
    const personne = await User.create({ ...data, password, isActive: true });

    if (data.role === 'agent_point' && data.pointCollecteId) {
      await PointCollecte.update(
        { responsableId: personne.id },
        { where: { id: data.pointCollecteId, responsableId: null } }
      );
    }

    await logActivity({
      userId: adminId,
      action: 'admin.personnel.create',
      entite: 'User',
      entiteId: personne.id,
      details: { role: personne.role, pays: personne.pays },
    });
    return { message: 'Compte créé.', personne: personne.toSafeJSON() };
  };

  static updatePersonnel = async (id, data, adminId) => {
    const personne = await User.findOne({ where: { id, role: PersonnelService.ROLES_PERSONNEL } });
    if (!personne) throw new NotFoundError('Membre du personnel introuvable');

    if (data.pointCollecteId !== undefined) {
      await PersonnelService.validerAffectation(
        personne.role,
        data.pays || personne.pays,
        data.pointCollecteId
      );
    }

    const ancienPoint = personne.pointCollecteId;
    await personne.update(data);

    if (
      personne.role === 'agent_point' &&
      data.pointCollecteId !== undefined &&
      data.pointCollecteId !== ancienPoint
    ) {
      if (ancienPoint)
        await PointCollecte.update(
          { responsableId: null },
          { where: { id: ancienPoint, responsableId: id } }
        );
      if (data.pointCollecteId)
        await PointCollecte.update({ responsableId: id }, { where: { id: data.pointCollecteId } });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.personnel.update',
      entite: 'User',
      entiteId: id,
    });
    return { message: 'Compte mis à jour.', personne: personne.toSafeJSON() };
  };

  static setActive = async (id, isActive, adminId) => {
    const personne = await User.findOne({ where: { id, role: PersonnelService.ROLES_PERSONNEL } });
    if (!personne) throw new NotFoundError('Membre du personnel introuvable');

    if (!isActive) {
      const missionsEnCours = await Colis.count({
        where: {
          [Op.or]: [{ coursierEnlevementId: id }, { coursierLivraisonId: id }],
          statut: { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule'] },
        },
      });
      if (missionsEnCours > 0) {
        throw new BadRequestError(
          `${missionsEnCours} mission(s) en cours : réaffectez-les avant de désactiver ce compte`
        );
      }
    }

    await personne.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.personnel.activate' : 'admin.personnel.deactivate',
      entite: 'User',
      entiteId: id,
    });
    return {
      message: isActive ? 'Compte activé.' : 'Compte désactivé.',
      personne: personne.toSafeJSON(),
    };
  };

  /** Coursiers disponibles pour une mission, filtrés par pays. */
  static getCoursiersDisponibles = async (pays) => {
    const coursiers = await User.findAll({
      where: { role: 'coursier', pays, isActive: true },
      attributes: ['id', 'nom', 'prenom', 'telephone'],
    });
    return { message: 'Coursiers disponibles', coursiers };
  };
}

module.exports = PersonnelService;
