const { Op } = require('sequelize');
const { sequelize, Reclamation, MessageReclamation, Colis, User, Facture } = require('../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../errors/AppError');
const { paginate, paginateResult } = require('../utils/paginate');
const { logActivity } = require('./activityLog.service');
const notificationService = require('./notification.service');
const parametreService = require('./parametre.service');
const { sendReclamationEmail } = require('../utils/mailer');
const { genererRefReclamation } = require('../utils/referenceGenerator');
const { uploadToCloudinary } = require('../utils/uploadService');
const { joursEcoules } = require('../utils/delais');
const { PAYS } = require('../constants/pays');

/**
 * Service après-vente : réclamations et indemnisations.
 *
 * Le client ouvre un dossier rattaché à une expédition ; le service client
 * l'instruit à travers un fil de messages, puis le clôt par une résolution
 * — avec ou sans indemnisation. Les notes internes ne sont jamais visibles du client.
 */

class ReclamationService {
  static INCLUDE_DETAIL = [
    { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] },
    { model: User, as: 'agentAssigne', attributes: ['id', 'nom', 'prenom'] },
    {
      model: Colis,
      as: 'colis',
      attributes: [
        'id',
        'reference',
        'statut',
        'montantTotal',
        'devise',
        'valeurDeclaree',
        'assuranceSouscrite',
        'dateLivraisonEffective',
        'paysDepart',
        'paysArrivee',
      ],
    },
  ];

  /** Délai de traitement engagé selon la priorité, en heures. */
  static DELAIS_TRAITEMENT_HEURES = { critique: 24, haute: 48, normale: 120, basse: 240 };

  static TRANSITIONS = {
    ouverte: ['en_cours', 'attente_client', 'rejetee', 'cloturee'],
    en_cours: ['attente_client', 'resolue', 'rejetee'],
    attente_client: ['en_cours', 'resolue', 'rejetee', 'cloturee'],
    resolue: ['cloturee'],
    rejetee: ['cloturee', 'en_cours'],
    cloturee: [],
  };

  static chargerReclamation = async (id, portee = {}) => {
    const where = { id, ...portee };
    const reclamation = await Reclamation.findOne({
      where,
      include: [
        ...ReclamationService.INCLUDE_DETAIL,
        {
          model: MessageReclamation,
          as: 'messages',
          include: [{ model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom', 'role'] }],
        },
      ],
      order: [[{ model: MessageReclamation, as: 'messages' }, 'createdAt', 'ASC']],
    });
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');
    return reclamation;
  };

  /* ── Côté client ────────────────────────────────────────────────────────── */

  /**
   * Ouvre une réclamation.
   *
   * La recevabilité est vérifiée à l'ouverture : l'expédition doit appartenir au
   * demandeur et le délai de contestation, compté depuis la livraison, ne doit pas
   * être écoulé — au-delà, le transporteur est déchargé de sa responsabilité.
   */
  static ouvrirReclamation = async (userId, data, files = []) => {
    const parametres = await parametreService.chargerTous();
    let colis = null;

    if (data.colisId) {
      colis = await Colis.findOne({ where: { id: data.colisId, userId } });
      if (!colis) throw new BadRequestError('Expédition introuvable');

      if (colis.dateLivraisonEffective) {
        const delai = Number(parametres.delai_reclamation_jours);
        const ecoules = joursEcoules(colis.dateLivraisonEffective);
        if (ecoules > delai) {
          throw new BadRequestError(
            `Le délai de réclamation de ${delai} jours après livraison est dépassé (${ecoules} jours écoulés)`
          );
        }
      }

      const ouverte = await Reclamation.findOne({
        where: { colisId: colis.id, statut: { [Op.notIn]: ['resolue', 'rejetee', 'cloturee'] } },
      });
      if (ouverte) {
        throw new ConflictError(
          `Une réclamation est déjà ouverte pour cette expédition (${ouverte.reference})`
        );
      }

      if (
        data.type === 'perte' &&
        !['incident', 'en_transit', 'en_douane'].includes(colis.statut)
      ) {
        // On n'interdit pas, mais l'agent verra que le colis n'est pas signalé perdu
        data.priorite = data.priorite || 'haute';
      }
    }

    const piecesJointes = files.length
      ? await Promise.all(
          files.map(async (f) => {
            const televerse = await uploadToCloudinary(f.buffer, {
              folder: 'yobnate-express/reclamations',
              resourceType: 'auto',
            });
            return { libelle: f.originalname, url: televerse.url, publicId: televerse.publicId };
          })
        )
      : [];

    const priorite = data.priorite || (data.type === 'perte' ? 'haute' : 'normale');
    const reference = await genererRefReclamation();
    const echeance = new Date(
      Date.now() + ReclamationService.DELAIS_TRAITEMENT_HEURES[priorite] * 3600 * 1000
    );

    const reclamation = await Reclamation.create({
      reference,
      userId,
      colisId: data.colisId || null,
      type: data.type,
      objet: data.objet,
      description: data.description,
      montantReclame: data.montantReclame || 0,
      devise: data.devise || colis?.devise || PAYS.SN.devise,
      priorite,
      statut: 'ouverte',
      piecesJointes,
      dateEcheance: echeance,
    });

    await notificationService.notifierAdmins({
      titre: `Réclamation ${reference} — ${data.type}`,
      message: data.objet,
      type: 'reclamation',
      niveau: priorite === 'critique' ? 'critique' : 'alerte',
      entite: 'Reclamation',
      entiteId: reclamation.id,
      lienCible: `/admin/reclamations/${reclamation.id}`,
    });

    await logActivity({
      userId,
      action: 'reclamation.create',
      entite: 'Reclamation',
      entiteId: reclamation.id,
      details: { reference, type: data.type },
    });

    return {
      message:
        `Réclamation ${reference} ouverte. Notre service client vous répondra sous ` +
        `${ReclamationService.DELAIS_TRAITEMENT_HEURES[priorite]} heures.`,
      reclamation,
    };
  };

  static getMesReclamations = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.type) where.type = filters.type;
    if (filters.ouvertes === 'true' || filters.ouvertes === true) {
      where.statut = { [Op.notIn]: ['resolue', 'rejetee', 'cloturee'] };
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Reclamation.findAndCountAll({
      where,
      include: ReclamationService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Vos réclamations',
      reclamations: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  /** Détail côté client : les notes internes sont retirées du fil. */
  static getMaReclamation = async (userId, id) => {
    const reclamation = await ReclamationService.chargerReclamation(id, { userId });
    const vue = reclamation.toJSON();
    vue.messages = (vue.messages || []).filter((m) => !m.interne);
    return { message: 'Détail de la réclamation', reclamation: vue };
  };

  static repondreClient = async (userId, id, message, files = []) => {
    const reclamation = await Reclamation.findOne({ where: { id, userId } });
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');
    if (reclamation.estClose) throw new BadRequestError('Cette réclamation est clôturée');

    const piecesJointes = files.length
      ? await Promise.all(
          files.map(async (f) => {
            const televerse = await uploadToCloudinary(f.buffer, {
              folder: 'yobnate-express/reclamations',
              resourceType: 'auto',
            });
            return { libelle: f.originalname, url: televerse.url, publicId: televerse.publicId };
          })
        )
      : [];

    const reponse = await MessageReclamation.create({
      reclamationId: id,
      auteurId: userId,
      origine: 'client',
      message,
      piecesJointes,
    });

    if (reclamation.statut === 'attente_client') await reclamation.update({ statut: 'en_cours' });

    if (reclamation.assigneA) {
      await notificationService.notifier({
        userId: reclamation.assigneA,
        titre: `Réponse du client — ${reclamation.reference}`,
        message: message.slice(0, 200),
        type: 'reclamation',
        entite: 'Reclamation',
        entiteId: id,
        lienCible: `/admin/reclamations/${id}`,
      });
    }

    return { message: 'Votre message a été transmis au service client.', reponse };
  };

  /** Note de satisfaction laissée par le client une fois le dossier résolu. */
  static noterReclamation = async (userId, id, note) => {
    const reclamation = await Reclamation.findOne({ where: { id, userId } });
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');
    if (!['resolue', 'rejetee', 'cloturee'].includes(reclamation.statut)) {
      throw new BadRequestError(
        "La satisfaction ne peut être évaluée qu'une fois le dossier traité"
      );
    }

    await reclamation.update({ noteSatisfaction: note });
    return { message: 'Merci pour votre retour.', reclamation };
  };

  /* ── Côté service client ────────────────────────────────────────────────── */

  static getAllReclamations = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.type) where.type = filters.type;
    if (filters.priorite) where.priorite = filters.priorite;
    if (filters.assigneA) where.assigneA = filters.assigneA;
    if (filters.userId) where.userId = filters.userId;
    if (filters.nonAssignees === 'true' || filters.nonAssignees === true) where.assigneA = null;
    if (filters.ouvertes === 'true' || filters.ouvertes === true) {
      where.statut = { [Op.notIn]: ['resolue', 'rejetee', 'cloturee'] };
    }
    if (filters.enRetard === 'true' || filters.enRetard === true) {
      where.dateEcheance = { [Op.lt]: new Date() };
      where.statut = { [Op.notIn]: ['resolue', 'rejetee', 'cloturee'] };
    }
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Reclamation.findAndCountAll({
      where,
      include: ReclamationService.INCLUDE_DETAIL,
      order: [
        ['priorite', 'DESC'],
        ['dateEcheance', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Réclamations',
      reclamations: rows.map((r) => ({
        ...r.toJSON(),
        enRetard: Boolean(r.dateEcheance && new Date(r.dateEcheance) < new Date() && !r.estClose),
      })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getReclamationById = async (id) => ({
    message: 'Détail de la réclamation',
    reclamation: await ReclamationService.chargerReclamation(id),
  });

  static assigner = async (id, agentId, adminId) => {
    const reclamation = await Reclamation.findByPk(id);
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');

    const agent = await User.findByPk(agentId);
    if (!agent || !['admin', 'super_admin', 'agent_point'].includes(agent.role)) {
      throw new BadRequestError("L'agent désigné ne peut pas traiter de réclamations");
    }

    await reclamation.update({
      assigneA: agentId,
      statut: reclamation.statut === 'ouverte' ? 'en_cours' : reclamation.statut,
    });
    await notificationService.notifier({
      userId: agentId,
      titre: `Réclamation ${reclamation.reference} vous est assignée`,
      message: reclamation.objet,
      type: 'reclamation',
      entite: 'Reclamation',
      entiteId: id,
      lienCible: `/admin/reclamations/${id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.reclamation.assigner',
      entite: 'Reclamation',
      entiteId: id,
      details: { agentId },
    });
    return { message: 'Réclamation assignée.', reclamation };
  };

  static repondreSupport = async (id, { message, interne = false }, agentId, files = []) => {
    const reclamation = await Reclamation.findByPk(id, {
      include: [{ model: User, as: 'client', attributes: ['id', 'email', 'prenom'] }],
    });
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');

    const piecesJointes = files.length
      ? await Promise.all(
          files.map(async (f) => {
            const televerse = await uploadToCloudinary(f.buffer, {
              folder: 'yobnate-express/reclamations',
              resourceType: 'auto',
            });
            return { libelle: f.originalname, url: televerse.url, publicId: televerse.publicId };
          })
        )
      : [];

    const reponse = await MessageReclamation.create({
      reclamationId: id,
      auteurId: agentId,
      origine: 'support',
      message,
      piecesJointes,
      interne,
    });

    if (!interne) {
      await reclamation.update({ statut: 'attente_client' });
      await notificationService.notifier({
        userId: reclamation.userId,
        titre: `Réponse à votre réclamation ${reclamation.reference}`,
        message: message.slice(0, 200),
        type: 'reclamation',
        entite: 'Reclamation',
        entiteId: id,
        lienCible: `/reclamations/${id}`,
        email: () =>
          sendReclamationEmail(reclamation.client, reclamation, 'Nouvelle réponse', message),
      });
    }

    return {
      message: interne ? 'Note interne enregistrée.' : 'Réponse envoyée au client.',
      reponse,
    };
  };

  /**
   * Clôt le dossier.
   *
   * Une résolution avec indemnisation crée une facture d'avoir au bénéfice du
   * client : la trace comptable est ainsi conservée, plutôt qu'un simple montant
   * inscrit sur la réclamation.
   */
  static resoudre = async (id, { statut, resolution, montantAccorde, motifRejet }, agentId) => {
    const reclamation = await Reclamation.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'email', 'prenom'] },
        {
          model: Colis,
          as: 'colis',
          attributes: ['id', 'reference', 'devise', 'valeurDeclaree', 'montantTotal'],
        },
      ],
    });
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');
    if (!ReclamationService.TRANSITIONS[reclamation.statut]?.includes(statut)) {
      throw new BadRequestError(`Transition invalide : ${reclamation.statut} vers ${statut}`);
    }
    if (statut === 'rejetee' && !motifRejet)
      throw new BadRequestError('Le motif du rejet est requis');
    if (statut === 'resolue' && !resolution)
      throw new BadRequestError('La résolution apportée doit être décrite');

    const indemnite = Number(montantAccorde || 0);
    if (indemnite > 0 && reclamation.colis) {
      const plafond =
        Number(reclamation.colis.valeurDeclaree) > 0
          ? Number(reclamation.colis.valeurDeclaree)
          : Number(reclamation.colis.montantTotal);
      if (indemnite > plafond) {
        throw new BadRequestError(
          `L'indemnisation (${indemnite}) dépasse le plafond de responsabilité (${plafond} ${reclamation.devise})`
        );
      }
    }

    let avoir = null;
    await sequelize.transaction(async (t) => {
      await reclamation.update(
        {
          statut,
          resolution: resolution || null,
          motifRejet: statut === 'rejetee' ? motifRejet : null,
          montantAccorde: indemnite || null,
          dateResolution: new Date(),
        },
        { transaction: t }
      );

      if (indemnite > 0) {
        const reference = await genererRefReclamation(t);
        avoir = await Facture.create(
          {
            reference: reference.replace('REC-', 'AVO-'),
            userId: reclamation.userId,
            type: 'avoir',
            devise: reclamation.devise,
            montantHt: indemnite,
            montantTotal: indemnite,
            statut: 'en_attente',
            lignes: [
              { libelle: `Indemnisation réclamation ${reclamation.reference}`, montant: indemnite },
            ],
            mentions: `Avoir émis au titre de la réclamation ${reclamation.reference}`,
            emisePar: agentId,
          },
          { transaction: t }
        );
      }
    });

    await notificationService.notifier({
      userId: reclamation.userId,
      titre: `Réclamation ${reclamation.reference} — ${statut === 'resolue' ? 'résolue' : 'rejetée'}`,
      message:
        statut === 'resolue'
          ? `${resolution}${indemnite > 0 ? ` Indemnisation accordée : ${indemnite} ${reclamation.devise}.` : ''}`
          : motifRejet,
      type: 'reclamation',
      niveau: statut === 'resolue' ? 'succes' : 'alerte',
      entite: 'Reclamation',
      entiteId: id,
      lienCible: `/reclamations/${id}`,
      email: () =>
        sendReclamationEmail(
          reclamation.client,
          reclamation,
          statut === 'resolue' ? 'Dossier résolu' : 'Dossier rejeté',
          statut === 'resolue' ? resolution : motifRejet
        ),
    });

    await logActivity({
      userId: agentId,
      action: `admin.reclamation.${statut}`,
      entite: 'Reclamation',
      entiteId: id,
      details: { montantAccorde: indemnite },
    });

    return {
      message: statut === 'resolue' ? 'Réclamation résolue.' : 'Réclamation rejetée.',
      reclamation,
      avoir,
    };
  };

  static changerPriorite = async (id, priorite, agentId) => {
    const reclamation = await Reclamation.findByPk(id);
    if (!reclamation) throw new NotFoundError('Réclamation introuvable');

    await reclamation.update({
      priorite,
      dateEcheance: new Date(
        Date.now() + ReclamationService.DELAIS_TRAITEMENT_HEURES[priorite] * 3600 * 1000
      ),
    });
    await logActivity({
      userId: agentId,
      action: 'admin.reclamation.priorite',
      entite: 'Reclamation',
      entiteId: id,
      details: { priorite },
    });
    return { message: `Priorité passée à « ${priorite} ».`, reclamation };
  };

  /** Indicateurs du service après-vente. */
  static getStatistiques = async () => {
    const [parStatut, parType, indemnisations, satisfaction] = await Promise.all([
      Reclamation.findAll({
        attributes: ['statut', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        group: ['statut'],
        raw: true,
      }),
      Reclamation.findAll({
        attributes: ['type', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        group: ['type'],
        raw: true,
      }),
      Reclamation.findOne({
        where: { montantAccorde: { [Op.gt]: 0 } },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'nombre'],
          [sequelize.fn('SUM', sequelize.col('montantAccorde')), 'total'],
        ],
        raw: true,
      }),
      Reclamation.findOne({
        where: { noteSatisfaction: { [Op.ne]: null } },
        attributes: [[sequelize.fn('AVG', sequelize.col('noteSatisfaction')), 'moyenne']],
        raw: true,
      }),
    ]);

    return {
      message: 'Statistiques du service après-vente',
      statistiques: {
        parStatut: parStatut.map((r) => ({ statut: r.statut, total: Number(r.total) })),
        parType: parType.map((r) => ({ type: r.type, total: Number(r.total) })),
        indemnisations: {
          nombre: Number(indemnisations?.nombre || 0),
          montantTotal: Number(indemnisations?.total || 0),
        },
        satisfactionMoyenne: satisfaction?.moyenne
          ? Number(Number(satisfaction.moyenne).toFixed(2))
          : null,
      },
    };
  };
}

module.exports = ReclamationService;
