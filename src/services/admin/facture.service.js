const { Op } = require('sequelize');
const { sequelize, Facture, Colis, User, Paiement, Ville } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const documents = require('../../utils/documents');
const { versCsv } = require('../../utils/csv');
const { arrondir } = require('../../utils/devise');
const { sendFactureEmail } = require('../../utils/mailer');
const { genererRefFacture } = require('../../utils/referenceGenerator');

/**
 * Facturation.
 *
 * Une facture naît avec l'expédition et suit son propre cycle : elle peut être
 * remisée, réglée en une ou plusieurs fois, annulée ou compensée par un avoir.
 * Le montant total est toujours recalculé à partir de sa décomposition, jamais
 * saisi directement, afin que la somme des lignes corresponde toujours au dû.
 */

class FactureService {
  static INCLUDE_DETAIL = [
    {
      model: Colis,
      as: 'colis',
      attributes: [
        'id',
        'reference',
        'statut',
        'poidsFactureKg',
        'nbPieces',
        'paysDepart',
        'paysArrivee',
      ],
      include: [
        { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
      ],
    },
    { model: User, attributes: ['id', 'nom', 'prenom', 'email', 'telephone', 'raisonSociale'] },
    { model: Paiement, as: 'paiements' },
  ];

  static chargerFacture = async (id) => {
    const facture = await Facture.findByPk(id, { include: FactureService.INCLUDE_DETAIL });
    if (!facture) throw new NotFoundError('Facture introuvable');
    return facture;
  };

  /** Recalcule le total à partir de la décomposition et de la remise. */
  static recalculerTotal = (facture, { remise = null } = {}) => {
    const remiseAppliquee = remise === null ? Number(facture.remise) : Number(remise);
    const ht = arrondir(
      Number(facture.montantFret) +
        Number(facture.montantSurcharges) +
        Number(facture.montantAssurance) -
        remiseAppliquee,
      facture.devise
    );
    const tva = arrondir((ht * Number(facture.tauxTva)) / 100, facture.devise);
    const total = arrondir(ht + tva + Number(facture.montantDroitsDouane), facture.devise);
    return { montantHt: ht, montantTva: tva, montantTotal: total, remise: remiseAppliquee };
  };

  /* ── Consultation ───────────────────────────────────────────────────────── */

  static construireFiltres = (filters = {}) => {
    const where = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.statut) where.statut = filters.statut;
    if (filters.type) where.type = filters.type;
    if (filters.devise) where.devise = filters.devise;
    if (filters.payeur) where.payeur = filters.payeur;
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
    if (filters.impayees === 'true' || filters.impayees === true) {
      where.statut = { [Op.in]: ['en_attente', 'partiellement_payee'] };
    }
    if (filters.echues === 'true' || filters.echues === true) {
      where.statut = { [Op.in]: ['en_attente', 'partiellement_payee'] };
      where.dateLimitePaiement = { [Op.lt]: new Date().toISOString().slice(0, 10) };
    }
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }
    return where;
  };

  static getAllFactures = async (filters = {}, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Facture.findAndCountAll({
      where: FactureService.construireFiltres(filters),
      include: FactureService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des factures',
      factures: rows.map((f) => ({ ...f.toJSON(), soldeDu: f.soldeDu, estEchue: f.estEchue })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getFactureById = async (id) => {
    const facture = await FactureService.chargerFacture(id);
    return {
      message: 'Détail de la facture',
      facture: { ...facture.toJSON(), soldeDu: facture.soldeDu, estEchue: facture.estEchue },
    };
  };

  /* ── Actions ────────────────────────────────────────────────────────────── */

  /**
   * Applique une remise commerciale sur une facture non soldée.
   * La remise ne peut excéder le montant hors taxes avant remise, et le total est
   * recalculé pour que TVA et solde restent cohérents.
   */
  static appliquerRemise = async (id, remise, adminId, motif = null) => {
    const facture = await FactureService.chargerFacture(id);

    if (!['en_attente', 'partiellement_payee', 'brouillon'].includes(facture.statut)) {
      throw new BadRequestError('Une remise ne peut être appliquée que sur une facture non soldée');
    }
    const montantRemise = Number(remise);
    if (Number.isNaN(montantRemise) || montantRemise < 0) {
      throw new BadRequestError('La remise ne peut pas être négative');
    }

    const base =
      Number(facture.montantFret) +
      Number(facture.montantSurcharges) +
      Number(facture.montantAssurance);
    if (montantRemise > base) {
      throw new BadRequestError(
        `La remise ne peut pas dépasser le montant hors taxes (${base} ${facture.devise})`
      );
    }

    const totaux = FactureService.recalculerTotal(facture, { remise: montantRemise });
    if (totaux.montantTotal < Number(facture.montantPaye)) {
      throw new BadRequestError('Le nouveau total serait inférieur au montant déjà encaissé');
    }

    await facture.update({ ...totaux, motifRemise: motif });
    await logActivity({
      userId: adminId,
      action: 'admin.facture.remise',
      entite: 'Facture',
      entiteId: facture.id,
      details: { remise: montantRemise, nouveauTotal: totaux.montantTotal, motif },
    });

    await notificationService.notifier({
      userId: facture.userId,
      titre: `Remise appliquée sur la facture ${facture.reference}`,
      message:
        `Une remise de ${montantRemise} ${facture.devise} a été appliquée. ` +
        `Nouveau montant : ${totaux.montantTotal} ${facture.devise}.`,
      type: 'paiement',
      niveau: 'succes',
      entite: 'Facture',
      entiteId: facture.id,
      lienCible: `/factures/${facture.id}`,
    });

    return { message: `Remise de ${montantRemise} ${facture.devise} appliquée.`, facture };
  };

  static annulerFacture = async (id, motif, adminId) => {
    const facture = await FactureService.chargerFacture(id);
    if (facture.statut === 'payee') {
      throw new BadRequestError('Une facture réglée ne peut pas être annulée : émettez un avoir');
    }
    if (Number(facture.montantPaye) > 0) {
      throw new BadRequestError(
        "Des règlements ont déjà été encaissés : remboursez-les avant d'annuler"
      );
    }

    await facture.update({ statut: 'annulee', mentions: motif || facture.mentions });
    await logActivity({
      userId: adminId,
      action: 'admin.facture.annuler',
      entite: 'Facture',
      entiteId: facture.id,
      details: { motif },
    });
    return { message: 'Facture annulée.', facture };
  };

  /** Repousse l'échéance de règlement, par exemple pour un compte professionnel. */
  static prolongerEcheance = async (id, nouvelleDate, adminId) => {
    const facture = await FactureService.chargerFacture(id);
    if (facture.estSoldee) throw new BadRequestError('Cette facture est déjà soldée');
    if (String(nouvelleDate) <= String(facture.dateLimitePaiement || '')) {
      throw new BadRequestError("La nouvelle échéance doit être postérieure à l'échéance actuelle");
    }

    await facture.update({ dateLimitePaiement: nouvelleDate });
    await logActivity({
      userId: adminId,
      action: 'admin.facture.echeance',
      entite: 'Facture',
      entiteId: facture.id,
      details: { nouvelleDate },
    });
    return { message: `Échéance reportée au ${nouvelleDate}.`, facture };
  };

  /**
   * Émet un avoir compensant tout ou partie d'une facture.
   * L'avoir est une facture distincte, de type `avoir`, qui préserve la piste
   * comptable sans altérer le document d'origine.
   */
  static emettreAvoir = async (id, { montant, motif }, adminId) => {
    const facture = await FactureService.chargerFacture(id);
    const montantAvoir = Number(montant);

    if (montantAvoir <= 0) throw new BadRequestError("Le montant de l'avoir doit être positif");
    if (montantAvoir > Number(facture.montantTotal)) {
      throw new BadRequestError("L'avoir ne peut pas dépasser le montant de la facture d'origine");
    }

    const avoir = await sequelize.transaction(async (t) => {
      const reference = await genererRefFacture(t);
      return Facture.create(
        {
          reference: reference.replace('FAC-', 'AVO-'),
          userId: facture.userId,
          colisId: null,
          type: 'avoir',
          devise: facture.devise,
          montantHt: montantAvoir,
          montantTotal: montantAvoir,
          statut: 'en_attente',
          lignes: [
            { libelle: `Avoir sur facture ${facture.reference} — ${motif}`, montant: montantAvoir },
          ],
          mentions: `Avoir émis sur la facture ${facture.reference}`,
          emisePar: adminId,
        },
        { transaction: t }
      );
    });

    await notificationService.notifier({
      userId: facture.userId,
      titre: `Avoir ${avoir.reference} émis`,
      message: `Un avoir de ${montantAvoir} ${facture.devise} a été émis sur la facture ${facture.reference}.`,
      type: 'paiement',
      niveau: 'succes',
      entite: 'Facture',
      entiteId: avoir.id,
      lienCible: `/factures/${avoir.id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.facture.avoir',
      entite: 'Facture',
      entiteId: facture.id,
      details: { avoirId: avoir.id, montant: montantAvoir, motif },
    });

    return { message: `Avoir de ${montantAvoir} ${facture.devise} émis.`, avoir };
  };

  /** Relance le client sur une facture échue. */
  static relancer = async (id, adminId) => {
    const facture = await FactureService.chargerFacture(id);
    if (facture.estSoldee) throw new BadRequestError('Cette facture est déjà soldée');

    await notificationService.notifier({
      userId: facture.userId,
      titre: `Rappel — facture ${facture.reference} en attente de règlement`,
      message:
        `Solde dû : ${facture.soldeDu} ${facture.devise}` +
        (facture.dateLimitePaiement ? `, échéance du ${facture.dateLimitePaiement}.` : '.'),
      type: 'paiement',
      niveau: 'alerte',
      entite: 'Facture',
      entiteId: facture.id,
      lienCible: `/factures/${facture.id}`,
      email: () => sendFactureEmail(facture.User, facture),
    });

    await logActivity({
      userId: adminId,
      action: 'admin.facture.relance',
      entite: 'Facture',
      entiteId: facture.id,
    });
    return { message: 'Relance envoyée au client.', facture };
  };

  /** Relance groupée de toutes les factures échues. */
  static relancerEchues = async (adminId) => {
    const echues = await Facture.findAll({
      where: {
        statut: { [Op.in]: ['en_attente', 'partiellement_payee'] },
        dateLimitePaiement: { [Op.lt]: new Date().toISOString().slice(0, 10) },
      },
      include: [{ model: User, attributes: ['id', 'email', 'prenom', 'notificationsEmail'] }],
    });

    let envoyees = 0;
    for (const facture of echues) {
      await notificationService.notifier({
        userId: facture.userId,
        titre: `Facture ${facture.reference} échue`,
        message: `Solde dû : ${facture.soldeDu} ${facture.devise}. Échéance dépassée depuis le ${facture.dateLimitePaiement}.`,
        type: 'paiement',
        niveau: 'alerte',
        entite: 'Facture',
        entiteId: facture.id,
        lienCible: `/factures/${facture.id}`,
        email: () => sendFactureEmail(facture.User, facture),
      });
      envoyees += 1;
    }

    await logActivity({
      userId: adminId,
      action: 'admin.facture.relance_lot',
      entite: 'Facture',
      details: { nbRelances: envoyees },
    });
    return { message: `${envoyees} relance(s) envoyée(s).`, nbRelances: envoyees };
  };

  /* ── Documents et exports ───────────────────────────────────────────────── */

  static getDocumentFacture = async (id) => {
    const facture = await FactureService.chargerFacture(id);
    const parametres = await parametreService.chargerTous();
    return {
      html: documents.genererFactureTransport(facture, facture.colis, parametres),
      nomFichier: `facture-${facture.reference}.html`,
    };
  };

  static COLONNES_EXPORT = [
    { cle: 'reference', libelle: 'Référence' },
    { cle: 'dateEmission', libelle: "Date d'émission" },
    { cle: 'type', libelle: 'Type' },
    { cle: 'colis.reference', libelle: 'Expédition' },
    { cle: 'User.email', libelle: 'Client' },
    { cle: 'montantHt', libelle: 'Montant HT' },
    { cle: 'montantTva', libelle: 'TVA' },
    { cle: 'remise', libelle: 'Remise' },
    { cle: 'montantTotal', libelle: 'Total TTC' },
    { cle: 'montantPaye', libelle: 'Réglé' },
    { cle: 'devise', libelle: 'Devise' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'dateLimitePaiement', libelle: 'Échéance' },
  ];

  static exporterCsv = async (filters = {}) => {
    const factures = await Facture.findAll({
      where: FactureService.construireFiltres(filters),
      include: FactureService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    return {
      contenu: versCsv(
        factures.map((f) => f.toJSON()),
        FactureService.COLONNES_EXPORT
      ),
      nomFichier: `factures-${new Date().toISOString().slice(0, 10)}.csv`,
      total: factures.length,
    };
  };

  /** Indicateurs de facturation et encours client. */
  static getStatistiques = async (filters = {}) => {
    const where = FactureService.construireFiltres(filters);

    const [parStatut, parDevise, encours] = await Promise.all([
      Facture.findAll({
        where,
        attributes: [
          'statut',
          [sequelize.fn('COUNT', sequelize.col('id')), 'nombre'],
          [sequelize.fn('SUM', sequelize.col('montantTotal')), 'montant'],
        ],
        group: ['statut'],
        raw: true,
      }),
      Facture.findAll({
        where,
        attributes: [
          'devise',
          [sequelize.fn('SUM', sequelize.col('montantTotal')), 'facture'],
          [sequelize.fn('SUM', sequelize.col('montantPaye')), 'encaisse'],
        ],
        group: ['devise'],
        raw: true,
      }),
      Facture.findAll({
        where: { statut: { [Op.in]: ['en_attente', 'partiellement_payee'] } },
        attributes: [
          'devise',
          [sequelize.fn('SUM', sequelize.literal('"montantTotal" - "montantPaye"')), 'solde'],
        ],
        group: ['devise'],
        raw: true,
      }),
    ]);

    return {
      message: 'Statistiques de facturation',
      statistiques: {
        parStatut: parStatut.map((r) => ({
          statut: r.statut,
          nombre: Number(r.nombre),
          montant: Number(r.montant || 0),
        })),
        parDevise: parDevise.map((r) => ({
          devise: r.devise,
          montantFacture: Number(r.facture || 0),
          montantEncaisse: Number(r.encaisse || 0),
          tauxRecouvrement: Number(r.facture)
            ? Number(((Number(r.encaisse) / Number(r.facture)) * 100).toFixed(1))
            : 0,
        })),
        encoursClients: encours.map((r) => ({ devise: r.devise, solde: Number(r.solde || 0) })),
      },
    };
  };
}

module.exports = FactureService;
