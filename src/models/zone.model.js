const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');

/**
 * Zone tarifaire : regroupement de villes d'un même pays partageant le même
 * niveau de prix et de délai (ex. « SN-1 Dakar urbain », « FR-3 Corse et îles »).
 */
class Zone extends Model {}

Zone.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
    },
    nom: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: { notEmpty: true },
    },
    pays: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    /** Majoration appliquée aux zones difficiles d'accès, en % du fret. */
    majorationPourcent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    /** Jours ajoutés au délai d'acheminement standard pour cette zone. */
    delaiSupplementaireJours: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 30 },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Zone',
    tableName: 'zones',
    indexes: [{ unique: true, fields: ['code'] }, { fields: ['pays'] }, { fields: ['isActive'] }],
  }
);

module.exports = Zone;
