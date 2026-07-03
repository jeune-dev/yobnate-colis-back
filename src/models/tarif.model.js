const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Tarif extends Model {}

Tarif.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    villeDepartId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    villeArriveeId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    typeColis: {
      type: DataTypes.ENUM('standard', 'express', 'fragile'),
      allowNull: false,
      defaultValue: 'standard'
    },
    prixParKg: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    prixFixe: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      defaultValue: 0
    },
    delaiEstimeJours: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      validate: { min: 0 }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    sequelize,
    modelName: 'Tarif',
    tableName: 'tarifs',
    indexes: [
      { unique: true, fields: ['villeDepartId', 'villeArriveeId', 'typeColis'] },
      { fields: ['isActive'] }
    ]
  }
);

module.exports = Tarif;
