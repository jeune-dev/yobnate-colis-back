const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { TYPES_EMBALLAGE } = require('../constants/colis');

/**
 * Pièce physique d'une expédition.
 *
 * Une expédition multi-colis compte autant de pièces que de contenants remis au
 * réseau. Chaque pièce porte son propre numéro de suivi (dérivé de la LTA), ses
 * dimensions et son poids : le poids volumétrique de l'expédition est la somme
 * des poids volumétriques de ses pièces.
 */
class ColisPiece extends Model {
  /** Poids volumétrique de la pièce pour un coefficient de service donné. */
  poidsVolumetrique(coefficient = 5000) {
    const l = Number(this.longueurCm || 0);
    const w = Number(this.largeurCm || 0);
    const h = Number(this.hauteurCm || 0);
    if (!l || !w || !h) return 0;
    return Number(((l * w * h) / coefficient).toFixed(3));
  }

  /** Somme des trois dimensions, utilisée pour contrôler le gabarit maximal. */
  get sommeDimensionsCm() {
    return Number(this.longueurCm || 0) + Number(this.largeurCm || 0) + Number(this.hauteurCm || 0);
  }
}

ColisPiece.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    colisId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    /** Numéro de suivi propre à la pièce : LTA suffixée du rang (ex. YB0000123-02). */
    numeroSuivi: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
    },
    /** Rang de la pièce dans l'expédition, à partir de 1. */
    ordre: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
    designation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    typeEmballage: {
      type: DataTypes.ENUM(...TYPES_EMBALLAGE),
      allowNull: false,
      defaultValue: 'carton',
    },
    poidsKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      validate: { min: 0.001 },
    },
    longueurCm: {
      type: DataTypes.DECIMAL(7, 1),
      allowNull: true,
      validate: { min: 1 },
    },
    largeurCm: {
      type: DataTypes.DECIMAL(7, 1),
      allowNull: true,
      validate: { min: 1 },
    },
    hauteurCm: {
      type: DataTypes.DECIMAL(7, 1),
      allowNull: true,
      validate: { min: 1 },
    },
    /** Poids volumétrique figé au moment du calcul tarifaire. */
    poidsVolumetriqueKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      defaultValue: 0,
    },
    /** Une pièce peut être scannée reçue indépendamment des autres. */
    scanneeReceptionAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scanneeLivraisonAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    photoPublicId: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ColisPiece',
    tableName: 'colis_pieces',
    indexes: [
      { unique: true, fields: ['numeroSuivi'] },
      { fields: ['colisId'] },
      { unique: true, fields: ['colisId', 'ordre'] },
    ],
  }
);

module.exports = ColisPiece;
