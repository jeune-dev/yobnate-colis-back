const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Facture extends Model {}

Facture.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reference: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true
    },
    colisId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    montantTransport: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    remise: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    montantTotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'payee', 'annulee'),
      allowNull: false,
      defaultValue: 'en_attente'
    },
    dateEmission: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    dateLimitePaiement: {
      type: DataTypes.DATEONLY,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Facture',
    tableName: 'factures',
    indexes: [
      { unique: true, fields: ['reference'] },
      { unique: true, fields: ['colisId'] },
      { fields: ['userId'] },
      { fields: ['statut'] }
    ]
  }
);

module.exports = Facture;
