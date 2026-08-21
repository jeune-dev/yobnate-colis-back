const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { DEVISES, METHODES_PAIEMENT, STATUTS_PAIEMENT } = require('../constants/facturation');

/**
 * Règlement, total ou partiel, d'une facture.
 *
 * Une facture peut recevoir plusieurs paiements : encaissement d'un acompte au
 * dépôt, solde au retrait, ou règlement mobile en ligne. La contrepartie externe
 * (Wave, Orange Money, banque) est tracée par sa référence de transaction.
 */
class Paiement extends Model {}

Paiement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    factureId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    montant: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0.01 } },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'XOF' },
    methode: { type: DataTypes.ENUM(...METHODES_PAIEMENT), allowNull: false },
    statut: {
      type: DataTypes.ENUM(...STATUTS_PAIEMENT),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    /** Référence de la transaction chez le prestataire de paiement. */
    referenceTransaction: { type: DataTypes.STRING(100), allowNull: true },
    /** Réponse brute du prestataire, conservée pour rapprochement comptable. */
    reponsePrestataire: { type: DataTypes.JSONB, allowNull: true },
    /** Point de collecte où l'encaissement a eu lieu, pour un paiement en espèces. */
    pointCollecteId: { type: DataTypes.UUID, allowNull: true },
    /** Agent ayant saisi le paiement pour un encaissement au comptoir. */
    recordedBy: { type: DataTypes.UUID, allowNull: true },
    payeAt: { type: DataTypes.DATE, allowNull: true },
    /** Suivi du remboursement éventuel. */
    montantRembourse: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    motifRemboursement: { type: DataTypes.STRING(255), allowNull: true },
    rembourseAt: { type: DataTypes.DATE, allowNull: true },
    commentaire: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Paiement',
    tableName: 'paiements',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['factureId'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['methode'] },
      { fields: ['referenceTransaction'] },
      { fields: ['payeAt'] },
    ],
  }
);

module.exports = Paiement;
