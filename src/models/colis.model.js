const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

const STATUTS_COLIS = [
  'en_attente',
  'en_preparation',
  'en_transit',
  'arrive',
  'recupere',
  'livre',
  'annule'
];

class Colis extends Model {}

Colis.init(
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    expediteurNom: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    expediteurTelephone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    villeDepartId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    destinataireNom: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    destinataireTelephone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    villeArriveeId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    adresseLivraison: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    typeColis: {
      type: DataTypes.ENUM('standard', 'express', 'fragile'),
      allowNull: false,
      defaultValue: 'standard'
    },
    poids: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      validate: { min: 0.01 }
    },
    valeurDeclaree: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    montant: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    statut: {
      type: DataTypes.ENUM(...STATUTS_COLIS),
      allowNull: false,
      defaultValue: 'en_attente'
    },
    photos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    dateLivraisonEstimee: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    dateLivraisonEffective: {
      type: DataTypes.DATE,
      allowNull: true
    },
    annuleMotif: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Colis',
    tableName: 'colis',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['villeDepartId'] },
      { fields: ['villeArriveeId'] },
      { fields: ['userId', 'createdAt'] },
      { fields: ['createdAt'] }
    ]
  }
);

Colis.STATUTS = STATUTS_COLIS;

module.exports = Colis;
