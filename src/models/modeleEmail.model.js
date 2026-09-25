const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Modèle d'email personnalisé par l'administrateur.
 *
 * Chaque courriel transactionnel possède un gabarit par défaut dans le code ;
 * un modèle actif portant le même code le remplace. Le sujet et le corps
 * acceptent des variables `{{nom}}`, substituées (et échappées) à l'envoi.
 */
class ModeleEmail extends Model {}

ModeleEmail.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    sujet: { type: DataTypes.STRING(200), allowNull: false },
    /** Corps HTML, inséré dans l'habillage commun des courriels. */
    corpsHtml: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    modifiePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ModeleEmail',
    tableName: 'modeles_email',
    indexes: [{ unique: true, fields: ['code'] }],
  }
);

module.exports = ModeleEmail;
