const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { STATUTS_COLIS, CODES_EVENEMENTS } = require('../constants/colis');

/**
 * Événement de suivi — une ligne du fil de traçabilité d'une expédition.
 *
 * Chaque scan, chaque changement d'état et chaque incident produit un événement
 * horodaté et localisé. Les événements marqués non publics restent réservés au
 * back-office (annotations internes, retenues douanières en cours d'instruction).
 */
class SuiviColis extends Model {}

SuiviColis.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    colisId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    /** Pièce concernée lorsque l'événement ne porte que sur un contenant. */
    colisPieceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Code normalisé de l'événement (cf. EVENEMENTS_SUIVI). */
    codeEvenement: {
      type: DataTypes.ENUM(...CODES_EVENEMENTS),
      allowNull: false,
      defaultValue: 'INFO',
    },
    /** Statut de l'expédition après l'événement. */
    statut: {
      type: DataTypes.ENUM(...STATUTS_COLIS),
      allowNull: false,
    },
    libelle: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    /** Lieu affiché au client (ville, agence, hub). */
    lieu: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    pays: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: true,
    },
    pointCollecteId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    commentaire: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    /** Horodatage réel de l'événement, distinct de sa date d'enregistrement. */
    dateEvenement: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    /** Un événement interne n'apparaît pas dans le suivi public. */
    visiblePublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'SuiviColis',
    tableName: 'suivi_colis',
    updatedAt: false,
    indexes: [
      { fields: ['colisId', 'dateEvenement'] },
      { fields: ['colisId', 'createdAt'] },
      { fields: ['codeEvenement'] },
      { fields: ['pointCollecteId'] },
    ],
  }
);

module.exports = SuiviColis;
