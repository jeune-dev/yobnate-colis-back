const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');

/**
 * Ville desservie, rattachée à un pays et à une zone tarifaire.
 * Les villes hors zone urbaine sont marquées « zone éloignée » : le moteur de
 * tarification y applique la surcharge correspondante et allonge le délai.
 */
class Ville extends Model {}

Ville.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    region: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    /** Zone tarifaire de rattachement ; null = tarif national par défaut. */
    zoneId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Codes postaux couverts, utilisés pour valider une adresse de livraison. */
    codesPostaux: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      validate: { min: -90, max: 90 },
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      validate: { min: -180, max: 180 },
    },
    /** Desserte difficile : surcharge zone éloignée et délai majoré. */
    isZoneEloignee: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** La livraison à domicile est-elle assurée dans cette ville ? */
    livraisonDomicileDisponible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    /** L'enlèvement à domicile est-il assuré dans cette ville ? */
    enlevementDomicileDisponible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Ville',
    tableName: 'villes',
    indexes: [
      // Unicité du nom scopée par pays (une ville homonyme FR/SN reste possible)
      { unique: true, fields: ['nom', 'pays'] },
      { fields: ['pays'] },
      { fields: ['zoneId'] },
      { fields: ['isActive'] },
    ],
  }
);

module.exports = Ville;
