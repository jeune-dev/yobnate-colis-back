const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const Colis = require('./colis.model');

class SuiviColis extends Model {}

SuiviColis.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    colisId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    statut: {
      type: DataTypes.ENUM(...Colis.STATUTS),
      allowNull: false
    },
    localisation: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    commentaire: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'SuiviColis',
    tableName: 'suivi_colis',
    updatedAt: false,
    indexes: [{ fields: ['colisId', 'createdAt'] }]
  }
);

module.exports = SuiviColis;
