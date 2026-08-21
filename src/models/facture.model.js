const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { DEVISES, STATUTS_FACTURE } = require('../constants/facturation');
const { PAYEURS } = require('../constants/colis');

/**
 * Facture d'expédition.
 *
 * Reprend le détail tarifaire figé sur le colis et suit le règlement, qui peut
 * être partiel (plusieurs paiements successifs). Le payeur est l'expéditeur ou,
 * en port dû, le destinataire.
 */
class Facture extends Model {
  get soldeDu() {
    return Number((Number(this.montantTotal) - Number(this.montantPaye)).toFixed(2));
  }

  get estSoldee() {
    return this.soldeDu <= 0;
  }

  get estEchue() {
    if (this.estSoldee || !this.dateLimitePaiement) return false;
    return new Date(this.dateLimitePaiement) < new Date();
  }
}

Facture.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    colisId: { type: DataTypes.UUID, allowNull: true, unique: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    type: {
      type: DataTypes.ENUM('expedition', 'enlevement', 'stockage', 'douane', 'avoir', 'divers'),
      allowNull: false,
      defaultValue: 'expedition',
    },
    payeur: { type: DataTypes.ENUM(...PAYEURS), allowNull: false, defaultValue: 'expediteur' },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'XOF' },

    // ── Décomposition du montant ───────────────────────────────────────────
    montantFret: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montantSurcharges: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montantAssurance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montantDroitsDouane: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    /** Total hors taxes avant remise. */
    montantHt: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    tauxTva: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    montantTva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    remise: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    motifRemise: { type: DataTypes.STRING(255), allowNull: true },
    montantTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montantPaye: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    /** Lignes détaillées reprises du moteur de tarification. */
    lignes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    statut: {
      type: DataTypes.ENUM(...STATUTS_FACTURE),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    dateEmission: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    dateLimitePaiement: { type: DataTypes.DATEONLY, allowNull: true },
    datePaiementComplet: { type: DataTypes.DATE, allowNull: true },
    /** Mentions légales et coordonnées bancaires figées à l'émission. */
    mentions: { type: DataTypes.STRING(1000), allowNull: true },
    emisePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Facture',
    tableName: 'factures',
    indexes: [
      { unique: true, fields: ['reference'] },
      { unique: true, fields: ['colisId'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['userId', 'statut'] },
      { fields: ['dateLimitePaiement'] },
    ],
  }
);

module.exports = Facture;
