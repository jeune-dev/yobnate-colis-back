const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');

/**
 * Ligne d'une déclaration douanière — un article de la facture commerciale.
 * Le code SH (système harmonisé) détermine le taux de droits applicable.
 */
class ArticleDouane extends Model {
  get valeurTotale() {
    return Number((Number(this.quantite) * Number(this.valeurUnitaire)).toFixed(2));
  }
}

ArticleDouane.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    declarationId: { type: DataTypes.UUID, allowNull: false },
    designation: { type: DataTypes.STRING(255), allowNull: false, validate: { notEmpty: true } },
    /** Code du système harmonisé, de 6 à 10 chiffres. */
    codeSh: { type: DataTypes.STRING(12), allowNull: true, validate: { is: /^\d{6,10}$/ } },
    quantite: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 1,
      validate: { min: 0.001 },
    },
    unite: {
      type: DataTypes.ENUM('piece', 'kg', 'litre', 'metre', 'paire', 'lot'),
      allowNull: false,
      defaultValue: 'piece',
    },
    valeurUnitaire: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0 } },
    poidsNetKg: { type: DataTypes.DECIMAL(8, 3), allowNull: true, validate: { min: 0 } },
    /** Pays de fabrication, distinct du pays d'expédition. */
    paysOrigine: { type: DataTypes.STRING(2), allowNull: true },
    /** Taux de droits de douane appliqué à cette ligne, en pourcentage. */
    tauxDroits: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    marque: { type: DataTypes.STRING(80), allowNull: true },
    ordre: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'ArticleDouane',
    tableName: 'articles_douane',
    indexes: [{ fields: ['declarationId'] }, { fields: ['codeSh'] }],
  }
);

ArticleDouane.PAYS_CONNUS = CODES_PAYS;

module.exports = ArticleDouane;
