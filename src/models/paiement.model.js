const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Paiement extends Model {}

Paiement.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    factureId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    montant: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    methode: {
      type: DataTypes.ENUM('wave', 'orange_money', 'carte', 'virement', 'cash'),
      allowNull: false
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'succes', 'echoue', 'rembourse'),
      allowNull: false,
      defaultValue: 'en_attente'
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    recordedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    payeAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Paiement',
    tableName: 'paiements',
    indexes: [
      { unique: true, fields: ['factureId'] },
      { fields: ['userId'] },
      { fields: ['statut'] }
    ]
  }
);

module.exports = Paiement;
