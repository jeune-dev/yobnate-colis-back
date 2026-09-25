const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { DEVISES } = require('../constants/facturation');

/**
 * Emballage proposé à la vente ou prestation d'emballage.
 *
 * - `contenant` : barigot, carton, malle… que le client achète pour y placer ses
 *   affaires (dimensions et photos présentées dans l'application) ;
 * - `prestation` : emballage réalisé par nos équipes, sur site ou lors d'une
 *   collecte (option payante).
 */
class Emballage extends Model {
  get estEnRupture() {
    return this.stock !== null && Number(this.stock) <= 0;
  }
}

Emballage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    libelle: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING(500), allowNull: true },
    type: {
      type: DataTypes.ENUM('contenant', 'prestation'),
      allowNull: false,
      defaultValue: 'contenant',
    },
    longueurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    largeurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    hauteurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    capaciteKg: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    prix: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0 } },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'EUR' },
    /** Photos de présentation : [{ url, publicId }]. */
    photos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    /** Catégories de colis pour lesquelles l'emballage est proposé. */
    categoriesEligibles: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['colis_moyen', 'colis_xxl'],
    },
    /** Stock disponible ; null = non suivi. */
    stock: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
    ordreAffichage: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Emballage',
    tableName: 'emballages',
    indexes: [{ unique: true, fields: ['code'] }, { fields: ['type'] }, { fields: ['isActive'] }],
  }
);

module.exports = Emballage;
