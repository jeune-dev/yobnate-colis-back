const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Question fréquente du site vitrine et de l'application (cahier des charges :
 * page « FAQ »). Classée par rubrique et ordonnée par l'administrateur.
 */
class Faq extends Model {}

Faq.RUBRIQUES = ['general', 'expedition', 'tarifs', 'paiement', 'suivi', 'douane', 'compte'];

Faq.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    question: { type: DataTypes.STRING(255), allowNull: false, validate: { notEmpty: true } },
    reponse: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    rubrique: { type: DataTypes.ENUM(...Faq.RUBRIQUES), allowNull: false, defaultValue: 'general' },
    ordre: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    modifiePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Faq',
    tableName: 'faqs',
    indexes: [{ name: 'faqs_actif_rubrique_ordre', fields: ['isActive', 'rubrique', 'ordre'] }],
  }
);

module.exports = Faq;
