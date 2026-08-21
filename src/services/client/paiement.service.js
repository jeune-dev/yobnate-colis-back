const { Op } = require('sequelize');
const { Facture, Paiement, Colis, Ville } = require('../../models');
const { NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const parametreService = require('../parametre.service');
const documents = require('../../utils/documents');
const { METHODES_PAR_PAYS } = require('../../constants/facturation');

/**
 * Espace facturation du client : consultation de ses factures, de ses règlements
 * et téléchargement des documents. L'encaissement lui-même reste opéré par le
 * back-office ou le point de collecte.
 */

class PaiementService {
  static INCLUDE_DETAIL = [
    {
      model: Colis,
      as: 'colis',
      attributes: ['id', 'reference', 'statut', 'poidsFactureKg', 'nbPieces'],
      include: [
        { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
      ],
    },
    { model: Paiement, as: 'paiements' },
  ];

  static getMesFactures = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.impayees === 'true' || filters.impayees === true) {
      where.statut = { [Op.in]: ['en_attente', 'partiellement_payee'] };
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Facture.findAndCountAll({
      where,
      include: PaiementService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Vos factures',
      factures: rows.map((f) => ({ ...f.toJSON(), soldeDu: f.soldeDu, estEchue: f.estEchue })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static chargerFactureDuClient = async (userId, factureId) => {
    const facture = await Facture.findOne({
      where: { id: factureId, userId },
      include: PaiementService.INCLUDE_DETAIL,
    });
    if (!facture) throw new NotFoundError('Facture introuvable');
    return facture;
  };

  static getFactureById = async (userId, factureId) => {
    const facture = await PaiementService.chargerFactureDuClient(userId, factureId);
    return {
      message: 'Détail de la facture',
      facture: { ...facture.toJSON(), soldeDu: facture.soldeDu, estEchue: facture.estEchue },
    };
  };

  static getMesPaiements = async (userId, pagination = {}) => {
    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Paiement.findAndCountAll({
      where: { userId },
      include: [{ model: Facture, as: 'facture', attributes: ['id', 'reference', 'montantTotal'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Vos règlements',
      paiements: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  /** Récapitulatif de l'encours du client, toutes devises confondues. */
  static getMonEncours = async (userId) => {
    const impayees = await Facture.findAll({
      where: { userId, statut: { [Op.in]: ['en_attente', 'partiellement_payee'] } },
      attributes: [
        'id',
        'reference',
        'devise',
        'montantTotal',
        'montantPaye',
        'dateLimitePaiement',
      ],
    });

    const parDevise = impayees.reduce((acc, f) => {
      acc[f.devise] = Number((acc[f.devise] || 0) + f.soldeDu);
      return acc;
    }, {});

    const aujourdhui = new Date().toISOString().slice(0, 10);
    return {
      message: 'Votre encours de facturation',
      encours: {
        nbFacturesImpayees: impayees.length,
        parDevise,
        facturesEchues: impayees
          .filter((f) => f.dateLimitePaiement && String(f.dateLimitePaiement) < aujourdhui)
          .map((f) => ({
            id: f.id,
            reference: f.reference,
            solde: f.soldeDu,
            devise: f.devise,
            echeance: f.dateLimitePaiement,
          })),
      },
    };
  };

  static getDocumentFacture = async (userId, factureId) => {
    const facture = await PaiementService.chargerFactureDuClient(userId, factureId);
    const parametres = await parametreService.chargerTous();
    return {
      html: documents.genererFactureTransport(facture, facture.colis, parametres),
      nomFichier: `facture-${facture.reference}.html`,
    };
  };

  /** Moyens de paiement acceptés, selon le pays de règlement. */
  static getMethodesPaiement = (pays) => ({
    message: 'Moyens de paiement acceptés',
    methodes: pays ? METHODES_PAR_PAYS[pays] || [] : METHODES_PAR_PAYS,
  });
}

module.exports = PaiementService;
