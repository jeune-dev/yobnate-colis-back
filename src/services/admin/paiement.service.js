const { Op } = require('sequelize');
const { sequelize, Paiement, Facture, User, PointCollecte, Colis } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const notificationService = require('../notification.service');
const { sendPaiementConfirmeEmail } = require('../../utils/mailer');
const { versCsv } = require('../../utils/csv');
const { arrondir } = require('../../utils/devise');
const { genererRefPaiement } = require('../../utils/referenceGenerator');
const { METHODES_PAR_PAYS } = require('../../constants/facturation');

/**
 * Encaissements et remboursements.
 *
 * Une facture peut être réglée en plusieurs fois : chaque encaissement met à jour
 * le cumul réglé et fait évoluer le statut de la facture (en attente, puis
 * partiellement payée, puis payée). Le rapprochement se fait dans une transaction,
 * pour qu'un paiement et le solde de sa facture ne divergent jamais.
 */

class PaiementService {
  static INCLUDE_DETAIL = [
    {
      model: Facture,
      as: 'facture',
      include: [{ model: Colis, as: 'colis', attributes: ['id', 'reference'] }],
    },
    { model: User, attributes: ['id', 'nom', 'prenom', 'email'] },
    { model: User, as: 'enregistrePar', attributes: ['id', 'nom', 'prenom'] },
    { model: PointCollecte, as: 'pointEncaissement', attributes: ['id', 'code', 'nom', 'pays'] },
  ];

  static construireFiltres = (filters = {}) => {
    const where = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.factureId) where.factureId = filters.factureId;
    if (filters.statut) where.statut = filters.statut;
    if (filters.methode) where.methode = filters.methode;
    if (filters.devise) where.devise = filters.devise;
    if (filters.pointCollecteId) where.pointCollecteId = filters.pointCollecteId;
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
    if (filters.referenceTransaction) {
      where.referenceTransaction = { [Op.iLike]: `%${filters.referenceTransaction}%` };
    }
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }
    return where;
  };

  static getAllPaiements = async (filters = {}, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Paiement.findAndCountAll({
      where: PaiementService.construireFiltres(filters),
      include: PaiementService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des paiements',
      paiements: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getPaiementById = async (id) => {
    const paiement = await Paiement.findByPk(id, { include: PaiementService.INCLUDE_DETAIL });
    if (!paiement) throw new NotFoundError('Paiement introuvable');
    return { message: 'Détail du paiement', paiement };
  };

  /**
   * Enregistre un encaissement sur une facture.
   *
   * Le montant est borné par le solde restant : un versement excédentaire est
   * refusé plutôt que silencieusement tronqué, car il traduit presque toujours une
   * erreur de saisie au comptoir.
   */
  static enregistrerPaiement = async (factureId, data, adminId) => {
    const facture = await Facture.findByPk(factureId, {
      include: [
        { model: Paiement, as: 'paiements' },
        { model: User, attributes: ['id', 'nom', 'prenom', 'email', 'notificationsEmail'] },
        { model: Colis, as: 'colis', attributes: ['id', 'reference'] },
      ],
    });
    if (!facture) throw new NotFoundError('Facture introuvable');

    if (!['en_attente', 'partiellement_payee'].includes(facture.statut)) {
      throw new BadRequestError(
        `Cette facture n'attend pas de règlement (statut : ${facture.statut})`
      );
    }

    const montant = arrondir(data.montant, facture.devise);
    if (montant <= 0) throw new BadRequestError('Le montant du règlement doit être positif');

    const solde = facture.soldeDu;
    if (montant > solde) {
      throw new BadRequestError(
        `Le montant (${montant}) dépasse le solde dû (${solde} ${facture.devise})`
      );
    }

    // Le point d'encaissement doit être cohérent avec le moyen de paiement du pays
    if (data.pointCollecteId) {
      const point = await PointCollecte.findByPk(data.pointCollecteId);
      if (!point) throw new BadRequestError("Point d'encaissement introuvable");
      if (!point.offreService('paiement')) {
        throw new BadRequestError(`Le point « ${point.nom} » n'est pas habilité à encaisser`);
      }
      const methodesAutorisees = METHODES_PAR_PAYS[point.pays] || [];
      if (!methodesAutorisees.includes(data.methode)) {
        throw new BadRequestError(
          `Le moyen de paiement « ${data.methode} » n'est pas disponible en ${point.pays}`
        );
      }
    }

    const resultat = await sequelize.transaction(async (t) => {
      const reference = await genererRefPaiement(t);
      const paiement = await Paiement.create(
        {
          reference,
          factureId,
          userId: facture.userId,
          montant,
          devise: facture.devise,
          methode: data.methode,
          statut: 'succes',
          referenceTransaction: data.referenceTransaction || null,
          pointCollecteId: data.pointCollecteId || null,
          recordedBy: adminId,
          payeAt: new Date(),
          commentaire: data.commentaire || null,
        },
        { transaction: t }
      );

      const cumul = arrondir(Number(facture.montantPaye) + montant, facture.devise);
      const soldee = cumul >= Number(facture.montantTotal);

      await facture.update(
        {
          montantPaye: cumul,
          statut: soldee ? 'payee' : 'partiellement_payee',
          datePaiementComplet: soldee ? new Date() : null,
        },
        { transaction: t }
      );

      return { paiement, soldee, cumul };
    });

    await notificationService.notifier({
      userId: facture.userId,
      titre: resultat.soldee
        ? `Facture ${facture.reference} soldée`
        : `Règlement partiel reçu — facture ${facture.reference}`,
      message: resultat.soldee
        ? `Votre règlement de ${montant} ${facture.devise} solde la facture.`
        : `Règlement de ${montant} ${facture.devise} enregistré. ` +
          `Solde restant : ${arrondir(Number(facture.montantTotal) - resultat.cumul, facture.devise)} ${facture.devise}.`,
      type: 'paiement',
      niveau: 'succes',
      entite: 'Facture',
      entiteId: facture.id,
      lienCible: `/factures/${facture.id}`,
      email: () => sendPaiementConfirmeEmail(facture.User, resultat.paiement, facture),
    });

    await logActivity({
      userId: adminId,
      action: 'admin.paiement.encaisser',
      entite: 'Paiement',
      entiteId: resultat.paiement.id,
      details: { factureId, montant, methode: data.methode, soldee: resultat.soldee },
    });

    return {
      message: resultat.soldee
        ? 'Paiement enregistré, facture soldée.'
        : `Paiement partiel enregistré. Solde restant : ${arrondir(Number(facture.montantTotal) - resultat.cumul, facture.devise)} ${facture.devise}.`,
      paiement: resultat.paiement,
      facture,
    };
  };

  /**
   * Rembourse tout ou partie d'un paiement encaissé.
   * La facture repasse au statut correspondant au solde restant dû.
   */
  static rembourser = async (id, { montant, motif }, adminId) => {
    const paiement = await Paiement.findByPk(id, {
      include: [
        { model: Facture, as: 'facture' },
        { model: User, attributes: ['id', 'email', 'prenom'] },
      ],
    });
    if (!paiement) throw new NotFoundError('Paiement introuvable');
    if (paiement.statut !== 'succes') {
      throw new BadRequestError('Seul un paiement réussi peut être remboursé');
    }

    const facture = paiement.facture;
    const remboursable = arrondir(
      Number(paiement.montant) - Number(paiement.montantRembourse),
      facture.devise
    );
    const montantRembourse = arrondir(montant ?? remboursable, facture.devise);

    if (montantRembourse <= 0)
      throw new BadRequestError('Le montant du remboursement doit être positif');
    if (montantRembourse > remboursable) {
      throw new BadRequestError(
        `Le montant dépasse la part remboursable (${remboursable} ${facture.devise})`
      );
    }
    if (!motif) throw new BadRequestError('Le motif du remboursement est requis');

    await sequelize.transaction(async (t) => {
      const cumulRembourse = arrondir(
        Number(paiement.montantRembourse) + montantRembourse,
        facture.devise
      );
      await paiement.update(
        {
          montantRembourse: cumulRembourse,
          statut: cumulRembourse >= Number(paiement.montant) ? 'rembourse' : 'partiel',
          motifRemboursement: motif,
          rembourseAt: new Date(),
        },
        { transaction: t }
      );

      const nouveauPaye = arrondir(Number(facture.montantPaye) - montantRembourse, facture.devise);
      await facture.update(
        {
          montantPaye: Math.max(0, nouveauPaye),
          statut:
            nouveauPaye <= 0
              ? 'en_attente'
              : nouveauPaye >= Number(facture.montantTotal)
                ? 'payee'
                : 'partiellement_payee',
          datePaiementComplet:
            nouveauPaye >= Number(facture.montantTotal) ? facture.datePaiementComplet : null,
        },
        { transaction: t }
      );
    });

    await notificationService.notifier({
      userId: paiement.userId,
      titre: `Remboursement — facture ${facture.reference}`,
      message: `Un remboursement de ${montantRembourse} ${facture.devise} a été effectué. Motif : ${motif}`,
      type: 'paiement',
      niveau: 'info',
      entite: 'Facture',
      entiteId: facture.id,
      lienCible: `/factures/${facture.id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.paiement.rembourser',
      entite: 'Paiement',
      entiteId: id,
      details: { montant: montantRembourse, motif },
    });

    return {
      message: `Remboursement de ${montantRembourse} ${facture.devise} enregistré.`,
      paiement,
    };
  };

  /** Marque un paiement en échec, typiquement après un retour négatif du prestataire. */
  static marquerEchoue = async (id, motif, adminId) => {
    const paiement = await Paiement.findByPk(id, { include: [{ model: Facture, as: 'facture' }] });
    if (!paiement) throw new NotFoundError('Paiement introuvable');
    if (paiement.statut === 'succes') {
      throw new BadRequestError(
        'Un paiement déjà encaissé ne peut pas être marqué en échec : passez par un remboursement'
      );
    }

    await paiement.update({ statut: 'echoue', commentaire: motif || paiement.commentaire });
    await logActivity({
      userId: adminId,
      action: 'admin.paiement.echec',
      entite: 'Paiement',
      entiteId: id,
      details: { motif },
    });
    return { message: 'Paiement marqué en échec.', paiement };
  };

  /* ── Caisse et exports ──────────────────────────────────────────────────── */

  /**
   * État de caisse d'un point de collecte sur une journée : ce que l'agent doit
   * pouvoir rapprocher de son fonds de caisse en fin de service.
   */
  static getCaisseDuPoint = async (pointCollecteId, date) => {
    const jour = date || new Date().toISOString().slice(0, 10);
    const debut = new Date(`${jour}T00:00:00.000Z`);
    const fin = new Date(`${jour}T23:59:59.999Z`);

    const point = await PointCollecte.findByPk(pointCollecteId);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    const paiements = await Paiement.findAll({
      where: {
        pointCollecteId,
        statut: 'succes',
        payeAt: { [Op.between]: [debut, fin] },
      },
      include: [{ model: Facture, as: 'facture', attributes: ['id', 'reference'] }],
      order: [['payeAt', 'ASC']],
    });

    const parMethode = paiements.reduce((acc, p) => {
      acc[p.methode] = arrondir((acc[p.methode] || 0) + Number(p.montant), p.devise);
      return acc;
    }, {});

    return {
      message: `Caisse du ${jour} — ${point.nom}`,
      caisse: {
        point: { id: point.id, code: point.code, nom: point.nom, pays: point.pays },
        date: jour,
        nbOperations: paiements.length,
        total: paiements.reduce((acc, p) => acc + Number(p.montant), 0),
        parMethode,
        operations: paiements.map((p) => ({
          reference: p.reference,
          facture: p.facture?.reference,
          montant: Number(p.montant),
          devise: p.devise,
          methode: p.methode,
          heure: p.payeAt,
        })),
      },
    };
  };

  static COLONNES_EXPORT = [
    { cle: 'reference', libelle: 'Référence' },
    { cle: 'payeAt', libelle: 'Date de paiement' },
    { cle: 'facture.reference', libelle: 'Facture' },
    { cle: 'facture.colis.reference', libelle: 'Expédition' },
    { cle: 'User.email', libelle: 'Client' },
    { cle: 'montant', libelle: 'Montant' },
    { cle: 'devise', libelle: 'Devise' },
    { cle: 'methode', libelle: 'Moyen de paiement' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'referenceTransaction', libelle: 'Réf. transaction' },
    { cle: 'pointEncaissement.nom', libelle: "Point d'encaissement" },
  ];

  static exporterCsv = async (filters = {}) => {
    const paiements = await Paiement.findAll({
      where: PaiementService.construireFiltres(filters),
      include: PaiementService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    return {
      contenu: versCsv(
        paiements.map((p) => p.toJSON()),
        PaiementService.COLONNES_EXPORT
      ),
      nomFichier: `paiements-${new Date().toISOString().slice(0, 10)}.csv`,
      total: paiements.length,
    };
  };

  static getStatistiques = async (filters = {}) => {
    const where = { ...PaiementService.construireFiltres(filters), statut: 'succes' };

    const [parMethode, parDevise] = await Promise.all([
      Paiement.findAll({
        where,
        attributes: [
          'methode',
          'devise',
          [sequelize.fn('COUNT', sequelize.col('id')), 'nombre'],
          [sequelize.fn('SUM', sequelize.col('montant')), 'total'],
        ],
        group: ['methode', 'devise'],
        raw: true,
      }),
      Paiement.findAll({
        where,
        attributes: [
          'devise',
          [sequelize.fn('SUM', sequelize.col('montant')), 'encaisse'],
          [sequelize.fn('SUM', sequelize.col('montantRembourse')), 'rembourse'],
        ],
        group: ['devise'],
        raw: true,
      }),
    ]);

    return {
      message: 'Statistiques des encaissements',
      statistiques: {
        parMethode: parMethode.map((r) => ({
          methode: r.methode,
          devise: r.devise,
          nombre: Number(r.nombre),
          total: Number(r.total || 0),
        })),
        parDevise: parDevise.map((r) => ({
          devise: r.devise,
          encaisse: Number(r.encaisse || 0),
          rembourse: Number(r.rembourse || 0),
          net: Number(r.encaisse || 0) - Number(r.rembourse || 0),
        })),
      },
    };
  };
}

module.exports = PaiementService;
