const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { MODES_TRANSPORT } = require('../constants/reseau');
const { TYPES_CONTENU } = require('../constants/colis');

/**
 * Produit commercial proposé au client (Express, Standard, Économique…).
 * Porte les engagements de délai, l'heure limite de dépôt et les règles
 * de gabarit qui conditionnent l'éligibilité d'une expédition.
 */
class ServiceExpedition extends Model {
  /** Le dépôt est-il encore pris en charge aujourd'hui à cette heure ? */
  avantHeureLimite(date = new Date()) {
    if (!this.heureLimiteDepot) return true;
    const [h, m] = String(this.heureLimiteDepot).split(':').map(Number);
    return date.getHours() * 60 + date.getMinutes() <= h * 60 + m;
  }
}

ServiceExpedition.init(
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
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    modeTransport: {
      type: DataTypes.ENUM(...MODES_TRANSPORT),
      allowNull: false,
      defaultValue: 'aerien',
    },
    /** Fourchette d'acheminement annoncée, en jours ouvrés. */
    delaiMinJours: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 2,
      validate: { min: 0, max: 120 },
    },
    delaiMaxJours: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 5,
      validate: { min: 0, max: 180 },
    },
    /** Le délai se compte-t-il en jours ouvrés (hors week-ends et fériés) ? */
    joursOuvresUniquement: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    /** Heure limite de dépôt pour un départ le jour même (format HH:MM). */
    heureLimiteDepot: {
      type: DataTypes.STRING(5),
      allowNull: true,
      validate: { is: /^([01]\d|2[0-3]):[0-5]\d$/ },
    },
    /** Diviseur du poids volumétrique : (L × l × h en cm) / coefficient. */
    coefficientVolumetrique: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5000,
      validate: { min: 1000, max: 10000 },
    },
    poidsMinKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 0.1,
      validate: { min: 0.01 },
    },
    poidsMaxKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 70,
      validate: { min: 0.1 },
    },
    /** Somme des trois dimensions maximale, en centimètres. */
    dimensionsMaxCm: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 10 },
    },
    /** Natures de contenu acceptées par ce service. */
    typesContenuAutorises: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: TYPES_CONTENU,
    },
    assuranceIncluse: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    suiviDetaille: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    livraisonSamedi: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Ordre d'affichage dans le tunnel de commande. */
    ordreAffichage: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'ServiceExpedition',
    tableName: 'services_expedition',
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['isActive'] },
      { fields: ['ordreAffichage'] },
    ],
    validate: {
      delaiCoherent() {
        if (Number(this.delaiMaxJours) < Number(this.delaiMinJours)) {
          throw new Error('Le délai maximum doit être supérieur ou égal au délai minimum');
        }
      },
      poidsCoherent() {
        if (Number(this.poidsMaxKg) <= Number(this.poidsMinKg)) {
          throw new Error('Le poids maximum doit être supérieur au poids minimum');
        }
      },
    },
  }
);

module.exports = ServiceExpedition;
