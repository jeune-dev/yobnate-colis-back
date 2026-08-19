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
      validate: { notEmpty: true }
    },
    pays: {
      type: DataTypes.ENUM('FR', 'SN'),
      allowNull: false
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
      // Unicité du nom scopée par pays (ex: une ville homonyme FR/SN reste possible)
      { unique: true, fields: ['nom', 'pays'] },
      { fields: ['pays'] },
      { fields: ['isActive'] }
    ]
  }
);

module.exports = Ville;
