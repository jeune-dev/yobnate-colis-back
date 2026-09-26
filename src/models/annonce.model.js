const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { EMPLACEMENTS_ANNONCE } = require('../config/reseau');

/**
 * Message publié par l'administrateur sur la page d'accueil de l'application :
 * date de la prochaine collecte, fermeture exceptionnelle, promotion…
 */
class Annonce extends Model {
  get estEnLigne() {
    if (!this.isActive) return false;
    const maintenant = new Date();
    if (this.dateDebut && new Date(this.dateDebut) > maintenant) return false;
    if (this.dateFin && new Date(this.dateFin) < maintenant) return false;
    return true;
  }
}

Annonce.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    titre: { type: DataTypes.STRING(150), allowNull: false, validate: { notEmpty: true } },
    message: { type: DataTypes.TEXT, allowNull: false },
    emplacement: {
      type: DataTypes.ENUM(...EMPLACEMENTS_ANNONCE),
      allowNull: false,
      defaultValue: 'accueil',
    },
    niveau: {
      type: DataTypes.ENUM('info', 'succes', 'alerte'),
      allowNull: false,
      defaultValue: 'info',
    },
    lienUrl: { type: DataTypes.STRING(255), allowNull: true },
    lienLibelle: { type: DataTypes.STRING(60), allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    imagePublicId: { type: DataTypes.STRING(150), allowNull: true },
    dateDebut: { type: DataTypes.DATE, allowNull: true },
    dateFin: { type: DataTypes.DATE, allowNull: true },
    priorite: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Annonce',
    tableName: 'annonces',
    indexes: [{ fields: ['isActive', 'emplacement'] }, { fields: ['dateDebut', 'dateFin'] }],
  }
);

module.exports = Annonce;
