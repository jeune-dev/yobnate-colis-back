const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { STATUTS_ENLEVEMENT, CRENEAUX_ENLEVEMENT } = require('../constants/reseau');

/**
 * Demande d'enlèvement à domicile.
 *
 * Le client demande le passage d'un coursier à une adresse et sur un créneau ;
 * un administrateur planifie la tournée en affectant un coursier, qui clôture la
 * demande une fois les colis récupérés et remis au point de rattachement.
 */
class DemandeEnlevement extends Model {}

DemandeEnlevement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    /** Colis déjà déclaré et rattaché à la demande (facultatif : enlèvement à blanc). */
    colisId: { type: DataTypes.UUID, allowNull: true },
    contactNom: { type: DataTypes.STRING(120), allowNull: false },
    contactTelephone: { type: DataTypes.STRING(20), allowNull: false },
    pays: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    villeId: { type: DataTypes.UUID, allowNull: false },
    adresse: { type: DataTypes.STRING(255), allowNull: false },
    complementAdresse: { type: DataTypes.STRING(255), allowNull: true },
    codePostal: { type: DataTypes.STRING(10), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    dateSouhaitee: { type: DataTypes.DATEONLY, allowNull: false },
    creneau: { type: DataTypes.ENUM(...CRENEAUX_ENLEVEMENT), allowNull: false },
    nbColis: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1, max: 100 },
    },
    poidsEstimeKg: { type: DataTypes.DECIMAL(8, 3), allowNull: true, validate: { min: 0.001 } },
    instructions: { type: DataTypes.STRING(500), allowNull: true },
    statut: {
      type: DataTypes.ENUM(...STATUTS_ENLEVEMENT),
      allowNull: false,
      defaultValue: 'demande',
    },
    coursierId: { type: DataTypes.UUID, allowNull: true },
    /** Point de collecte où le coursier dépose les colis récupérés. */
    pointDepotId: { type: DataTypes.UUID, allowNull: true },
    datePlanifiee: { type: DataTypes.DATE, allowNull: true },
    dateEffective: { type: DataTypes.DATE, allowNull: true },
    motifEchec: { type: DataTypes.STRING(255), allowNull: true },
    /** Frais d'enlèvement facturés au client, dans la devise du pays de départ. */
    fraisEnlevement: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    commentaireCoursier: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: 'DemandeEnlevement',
    tableName: 'demandes_enlevement',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['coursierId', 'dateSouhaitee'] },
      { fields: ['pays', 'dateSouhaitee'] },
      { fields: ['colisId'] },
    ],
  }
);

module.exports = DemandeEnlevement;
