const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Preuve de livraison (POD).
 *
 * Enregistrée au moment où le colis quitte définitivement le réseau : remise en
 * main propre par un coursier, ou retrait par le destinataire dans un point.
 * Elle conserve l'identité du signataire, sa signature et, si besoin, une photo.
 */
class PreuveLivraison extends Model {}

PreuveLivraison.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    colisId: { type: DataTypes.UUID, allowNull: false, unique: true },
    /** Remise à domicile par un coursier ou retrait au comptoir. */
    mode: { type: DataTypes.ENUM('livraison_domicile', 'retrait_point'), allowNull: false },
    signataireNom: { type: DataTypes.STRING(120), allowNull: false },
    /** Qualité du signataire : destinataire lui-même, proche, gardien, collègue. */
    signataireQualite: {
      type: DataTypes.ENUM('destinataire', 'proche', 'gardien', 'collegue', 'voisin', 'autre'),
      allowNull: false,
      defaultValue: 'destinataire',
    },
    /** Référence du document d'identité présenté au retrait. */
    signatairePieceIdentite: { type: DataTypes.STRING(50), allowNull: true },
    signatureUrl: { type: DataTypes.STRING(255), allowNull: true },
    signaturePublicId: { type: DataTypes.STRING(150), allowNull: true },
    photoUrl: { type: DataTypes.STRING(255), allowNull: true },
    photoPublicId: { type: DataTypes.STRING(150), allowNull: true },
    /** Le code de retrait communiqué au destinataire a-t-il été vérifié ? */
    codeRetraitVerifie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    dateLivraison: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lieu: { type: DataTypes.STRING(255), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    pointRetraitId: { type: DataTypes.UUID, allowNull: true },
    /** Agent ou coursier ayant constaté la remise. */
    remisPar: { type: DataTypes.UUID, allowNull: true },
    commentaire: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: 'PreuveLivraison',
    tableName: 'preuves_livraison',
    indexes: [
      { unique: true, fields: ['colisId'] },
      { fields: ['pointRetraitId'] },
      { fields: ['dateLivraison'] },
    ],
  }
);

module.exports = PreuveLivraison;
