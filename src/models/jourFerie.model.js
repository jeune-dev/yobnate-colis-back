const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');

/**
 * Jours non ouvrés par pays : exclus du calcul des délais d'acheminement
 * et des créneaux d'enlèvement.
 */
class JourFerie extends Model {}

JourFerie.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    pays: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    libelle: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    /** Un jour récurrent se répète chaque année à date fixe (ex. 1er janvier). */
    recurrent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'JourFerie',
    tableName: 'jours_feries',
    indexes: [{ unique: true, fields: ['date', 'pays'] }, { fields: ['pays'] }],
  }
);

module.exports = JourFerie;
