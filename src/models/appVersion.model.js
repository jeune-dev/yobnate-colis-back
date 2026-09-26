const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Version de l'application mobile par plateforme (repris de Sign) : pilote la
 * proposition de mise à jour et, sous la version minimale, la mise à jour
 * obligatoire. Une seule configuration active par plateforme ; l'activation
 * d'une nouvelle désactive les autres (voir appVersion.service).
 */
class AppVersion extends Model {}

AppVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    plateforme: { type: DataTypes.ENUM('android', 'ios'), allowNull: false },
    derniereVersion: { type: DataTypes.STRING(20), allowNull: false },
    versionMinimale: { type: DataTypes.STRING(20), allowNull: false },
    miseAJourForcee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    titre: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'Nouvelle version disponible',
    },
    message: { type: DataTypes.TEXT, allowNull: true },
    lienStore: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'AppVersion',
    tableName: 'app_versions',
    indexes: [{ fields: ['plateforme', 'isActive'] }],
  }
);

module.exports = AppVersion;
