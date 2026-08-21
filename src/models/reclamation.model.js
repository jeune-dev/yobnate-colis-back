const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { DEVISES } = require('../constants/facturation');

/**
 * Réclamation client rattachée à une expédition : perte, avarie, retard,
 * erreur de livraison ou contestation de facturation.
 *
 * Le traitement suit un cycle ouverte -> en_cours -> resolue/rejetee, avec un fil
 * de messages entre le client et le service client (cf. MessageReclamation).
 */
class Reclamation extends Model {
  get estClose() {
    return ['resolue', 'rejetee', 'cloturee'].includes(this.statut);
  }
}

Reclamation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    colisId: { type: DataTypes.UUID, allowNull: true },
    type: {
      type: DataTypes.ENUM(
        'perte',
        'avarie',
        'retard',
        'erreur_livraison',
        'facturation',
        'douane',
        'autre'
      ),
      allowNull: false,
    },
    objet: { type: DataTypes.STRING(150), allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING(2000), allowNull: false, validate: { notEmpty: true } },
    /** Indemnisation demandée par le client. */
    montantReclame: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'XOF' },
    /** Indemnisation effectivement accordée après instruction. */
    montantAccorde: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },
    priorite: {
      type: DataTypes.ENUM('basse', 'normale', 'haute', 'critique'),
      allowNull: false,
      defaultValue: 'normale',
    },
    statut: {
      type: DataTypes.ENUM(
        'ouverte',
        'en_cours',
        'attente_client',
        'resolue',
        'rejetee',
        'cloturee'
      ),
      allowNull: false,
      defaultValue: 'ouverte',
    },
    /** Agent du service client en charge du dossier. */
    assigneA: { type: DataTypes.UUID, allowNull: true },
    resolution: { type: DataTypes.STRING(2000), allowNull: true },
    motifRejet: { type: DataTypes.STRING(500), allowNull: true },
    /** Justificatifs fournis par le client (photos du colis, facture d'achat). */
    piecesJointes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    /** Engagement de traitement, calculé à l'ouverture selon la priorité. */
    dateEcheance: { type: DataTypes.DATE, allowNull: true },
    dateResolution: { type: DataTypes.DATE, allowNull: true },
    /** Note de satisfaction laissée par le client à la clôture. */
    noteSatisfaction: { type: DataTypes.SMALLINT, allowNull: true, validate: { min: 1, max: 5 } },
  },
  {
    sequelize,
    modelName: 'Reclamation',
    tableName: 'reclamations',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['userId'] },
      { fields: ['colisId'] },
      { fields: ['statut'] },
      { fields: ['assigneA'] },
      { fields: ['statut', 'dateEcheance'] },
    ],
  }
);

module.exports = Reclamation;
