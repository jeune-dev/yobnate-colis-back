const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Ville extends Model {}

Ville.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    nom: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      validate: { notEmpty: true }
    },
    region: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    sequelize,
    modelName: 'Ville',
    tableName: 'villes',
    indexes: [
      { unique: true, fields: ['nom'] },
      { fields: ['isActive'] }
    ]
  }
);

module.exports = Ville;
