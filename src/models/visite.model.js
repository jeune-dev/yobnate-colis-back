const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Session de visite du site vitrine ou de l'application (indicateurs marketing du
 * cahier des charges : trafic, visiteurs connus, temps passé, source du trafic).
 *
 * Une ligne par session : le site crée la session puis signale chaque page vue et
 * une présence régulière (`ping`). Aucune adresse IP ni empreinte de navigateur
 * n'est enregistrée : `visiteurId` est un UUID aléatoire stocké par le client,
 * `userId` n'est renseigné que si la personne est connectée.
 */
class Visite extends Model {}

Visite.PLATEFORMES = ['web', 'android', 'ios'];
Visite.SOURCES = ['direct', 'recherche', 'reseau_social', 'campagne', 'email', 'site_referent'];

Visite.init(
  {
    /** Identifiant de session généré par le client (UUID). */
    id: { type: DataTypes.UUID, primaryKey: true },
    visiteurId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    plateforme: { type: DataTypes.ENUM(...Visite.PLATEFORMES), allowNull: false },
    source: { type: DataTypes.ENUM(...Visite.SOURCES), allowNull: false, defaultValue: 'direct' },
    referentDomaine: { type: DataTypes.STRING(120), allowNull: true },
    utmSource: { type: DataTypes.STRING(80), allowNull: true },
    utmMedium: { type: DataTypes.STRING(80), allowNull: true },
    utmCampagne: { type: DataTypes.STRING(120), allowNull: true },
    pageEntree: { type: DataTypes.STRING(255), allowNull: true },
    pagesVues: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    debut: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    derniereActivite: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    /** Temps passé : écart entre la première et la dernière activité (plafonné). */
    dureeSecondes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'Visite',
    tableName: 'visites',
    timestamps: false,
    indexes: [
      { name: 'visites_debut', fields: ['debut'] },
      { name: 'visites_visiteur_id', fields: ['visiteurId'] },
    ],
  }
);

module.exports = Visite;
