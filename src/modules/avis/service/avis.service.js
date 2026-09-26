const { Op } = require('sequelize');
const { sequelize, Avis, Colis, User } = require('../../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../../errors/AppError');
const { paginate, paginateResult } = require('../../../utils/paginate');
const cache = require('../../../utils/cache');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const notificationService = require('../../notification/service/notification.service');

/**
 * Avis clients (cahier des charges : « Avis clients » du site vitrine et « Nombre
 * et qualité des évaluations » du tableau de bord).
 *
 * Tout avis est modéré : il n'apparaît publiquement qu'une fois publié par un
 * administrateur, qui peut y joindre une réponse. Un avis peut porter sur une
 * expédition terminée du client (une seule fois) ou sur le service en général
 * (un seul avis général en cours par client, pour limiter les abus).
 */
class AvisService {
  static STATUTS_COLIS_EVALUABLES = ['livre', 'recupere'];
  static TTL_PUBLIC = 60 * 1000;

  /** « Awa Diop » → « Awa D. » : l'avis public n'expose pas le nom complet. */
  static nomPublic = (client) =>
    client ? `${client.prenom} ${String(client.nom || '').charAt(0)}.`.trim() : 'Client';

  static deposer = async (userId, { note, titre, commentaire, colisId }) => {
    if (colisId) {
      const colis = await Colis.findOne({
        where: { id: colisId, userId },
        attributes: ['id', 'statut'],
      });
      if (!colis) throw new NotFoundError('Expédition introuvable');
      if (!AvisService.STATUTS_COLIS_EVALUABLES.includes(colis.statut)) {
        throw new BadRequestError('Une expédition ne peut être évaluée qu’une fois livrée');
      }
    } else {
      const enCours = await Avis.count({
        where: { userId, colisId: null, statut: { [Op.in]: ['en_attente', 'publie'] } },
      });
      if (enCours) {
        throw new ConflictError(
          'Vous avez déjà donné un avis général : supprimez-le pour en déposer un nouveau'
        );
      }
    }

    let avis;
    try {
      avis = await Avis.create({
        userId,
        colisId: colisId || null,
        note,
        titre: titre || null,
        commentaire: commentaire || null,
      });
    } catch (err) {
      // Unicité de l'avis par expédition, garantie par la base même en cas de double envoi
      if (err.name === 'SequelizeUniqueConstraintError') {
        throw new ConflictError('Cette expédition a déjà été évaluée');
      }
      throw err;
    }

    await logActivity({ userId, action: 'avis.deposer', entite: 'Avis', entiteId: avis.id });
    return {
      message: 'Merci pour votre avis : il sera publié après vérification.',
      avis,
    };
  };

  static mesAvis = async (userId) => {
    const avis = await Avis.findAll({
      where: { userId },
      include: [{ model: Colis, as: 'colis', attributes: ['id', 'reference'] }],
      order: [['createdAt', 'DESC']],
    });
    return { message: 'Vos avis', avis };
  };

  static supprimerMonAvis = async (userId, id) => {
    const avis = await Avis.findOne({ where: { id, userId } });
    if (!avis) throw new NotFoundError('Avis introuvable');
    await avis.destroy();
    return { message: 'Avis supprimé.' };
  };

  /* ── Back-office ────────────────────────────────────────────────────────── */

  static lister = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.note) where.note = Number(filters.note);
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Avis.findAndCountAll({
      where,
      include: [
        { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: Colis, as: 'colis', attributes: ['id', 'reference'] },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });
    return {
      message: 'Avis clients',
      avis: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static moderer = async (id, { statut, motifRejet, reponse }, adminId) => {
    const avis = await Avis.findByPk(id);
    if (!avis) throw new NotFoundError('Avis introuvable');

    await avis.update({
      statut,
      motifRejet: statut === 'rejete' ? motifRejet : null,
      reponse: reponse || null,
      moderePar: adminId,
      modereLe: new Date(),
    });
    await logActivity({
      userId: adminId,
      action: `admin.avis.${statut}`,
      entite: 'Avis',
      entiteId: avis.id,
    });
    await notificationService.notifier({
      userId: avis.userId,
      titre: statut === 'publie' ? 'Votre avis est publié' : 'Votre avis n’a pas été publié',
      message:
        statut === 'publie'
          ? 'Merci ! Votre avis est désormais visible sur notre site.'
          : `Motif : ${motifRejet}`,
      type: 'systeme',
      entite: 'Avis',
      entiteId: avis.id,
    });
    return {
      message: statut === 'publie' ? 'Avis publié.' : 'Avis rejeté.',
      avis,
    };
  };

  static supprimer = async (id, adminId) => {
    const avis = await Avis.findByPk(id);
    if (!avis) throw new NotFoundError('Avis introuvable');
    await avis.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.avis.supprimer',
      entite: 'Avis',
      entiteId: id,
    });
    return { message: 'Avis supprimé.' };
  };

  /* ── Public ─────────────────────────────────────────────────────────────── */

  /** Synthèse des avis publiés : note moyenne, nombre et répartition par note. */
  static synthesePublique = () =>
    cache.memoiser('avis:public:synthese', AvisService.TTL_PUBLIC, async () => {
      const [lignes] = await sequelize.query(
        `SELECT note, COUNT(*)::int AS total FROM avis WHERE statut = 'publie' GROUP BY note`
      );
      const total = lignes.reduce((n, l) => n + l.total, 0);
      const somme = lignes.reduce((n, l) => n + l.note * l.total, 0);
      return {
        total,
        noteMoyenne: total ? Number((somme / total).toFixed(2)) : null,
        repartition: [5, 4, 3, 2, 1].map((n) => ({
          note: n,
          total: lignes.find((l) => l.note === n)?.total || 0,
        })),
      };
    });

  static listerPublics = async (filters = {}, pagination = {}) => {
    const where = { statut: 'publie' };
    if (filters.note) where.note = Number(filters.note);
    const { limit, offset } = paginate({ ...pagination, limit: pagination.limit || 10 });
    const [{ rows, count }, synthese] = await Promise.all([
      Avis.findAndCountAll({
        where,
        attributes: ['id', 'note', 'titre', 'commentaire', 'reponse', 'createdAt'],
        include: [{ model: User, as: 'client', attributes: ['prenom', 'nom'] }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit,
        offset,
      }),
      AvisService.synthesePublique(),
    ]);
    return {
      message: 'Avis de nos clients',
      synthese,
      avis: rows.map((a) => ({
        id: a.id,
        note: a.note,
        titre: a.titre,
        commentaire: a.commentaire,
        reponse: a.reponse,
        auteur: AvisService.nomPublic(a.client),
        date: a.createdAt,
      })),
      pagination: paginateResult(count, pagination.page, pagination.limit || 10),
    };
  };

  /* ── Tableau de bord ────────────────────────────────────────────────────── */

  /** Nombre et qualité des évaluations, sur une période et au global. */
  static statistiques = async ({ debut, fin }) => {
    const [[global], [periode], repartition] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE statut = 'publie')::int AS publies,
                COUNT(*) FILTER (WHERE statut = 'en_attente')::int AS "enAttente",
                COUNT(*) FILTER (WHERE statut = 'rejete')::int AS rejetes,
                ROUND(AVG(note), 2)::float AS "noteMoyenne",
                ROUND(AVG(note) FILTER (WHERE statut = 'publie'), 2)::float AS "noteMoyennePubliee",
                COUNT(*) FILTER (WHERE note >= 4)::int AS satisfaits,
                COUNT(*) FILTER (WHERE commentaire IS NOT NULL AND commentaire <> '')::int
                  AS "avecCommentaire"
           FROM avis`
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS total, ROUND(AVG(note), 2)::float AS "noteMoyenne"
           FROM avis WHERE "createdAt" BETWEEN :debut AND :fin`,
        { replacements: { debut, fin } }
      ),
      sequelize.query(`SELECT note, COUNT(*)::int AS total FROM avis GROUP BY note`, {
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);
    const g = global[0];
    const p = periode[0];
    return {
      total: g.total,
      publies: g.publies,
      enAttente: g.enAttente,
      rejetes: g.rejetes,
      noteMoyenne: g.noteMoyenne,
      noteMoyennePubliee: g.noteMoyennePubliee,
      // Qualité : part des avis à 4 ou 5 étoiles, et part des avis argumentés
      tauxSatisfaction: g.total ? Number(((g.satisfaits / g.total) * 100).toFixed(1)) : 0,
      tauxAvecCommentaire: g.total ? Number(((g.avecCommentaire / g.total) * 100).toFixed(1)) : 0,
      repartition: [5, 4, 3, 2, 1].map((n) => ({
        note: n,
        total: repartition.find((l) => l.note === n)?.total || 0,
      })),
      periode: { debut, fin, nouveaux: p.total, noteMoyenne: p.noteMoyenne },
    };
  };
}

module.exports = AvisService;
