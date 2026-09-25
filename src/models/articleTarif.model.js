const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { DEVISES } = require('../constants/facturation');
const { CATEGORIES_COLIS } = require('../constants/colis');
const { MODES_TRANSPORT } = require('../constants/reseau');

/**
 * Article de la grille forfaitaire (« Nature du colis »).
 *
 * Les catégories 1 et 2 ne sont pas facturées au poids mais à l'article : une
 * valise de 23 kg, un grand barigot, une télévision de 94 cm… ont chacun un prix
 * fixe défini par l'administrateur, livraison incluse, qui varie selon que la
 * ville sénégalaise desservie relève de Dakar ou des autres régions. Une grille
 * distincte peut être tenue pour le fret maritime et pour le fret aérien.
 */
class ArticleTarif extends Model {
  /** Prix unitaire selon la zone de la ville sénégalaise du trajet. */
  prixPour(zoneDakar) {
    return Number(zoneDakar ? this.prixDakar : this.prixAutresRegions);
  }
}

ArticleTarif.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    libelle: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.STRING(500), allowNull: true },
    categorie: {
      type: DataTypes.ENUM(...CATEGORIES_COLIS),
      allowNull: false,
      defaultValue: 'colis_moyen',
    },
    modeTransport: {
      type: DataTypes.ENUM(...MODES_TRANSPORT),
      allowNull: false,
      defaultValue: 'maritime',
    },
    /** Corridor : la grille s'applique dans un sens donné (France → Sénégal par défaut). */
    paysDepart: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false, defaultValue: 'FR' },
    paysArrivee: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false, defaultValue: 'SN' },
    prixDakar: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    prixAutresRegions: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'EUR' },
    /** Prix plancher (« à partir de ») : l'administrateur peut l'ajuster à la validation. */
    prixAPartirDe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /** Gabarit indicatif, affiché au client pour l'aider à choisir. */
    poidsMaxKg: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    longueurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    largeurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    hauteurCm: { type: DataTypes.DECIMAL(7, 1), allowNull: true },
    photoUrl: { type: DataTypes.STRING(255), allowNull: true },
    photoPublicId: { type: DataTypes.STRING(150), allowNull: true },
    ordreAffichage: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'ArticleTarif',
    tableName: 'articles_tarif',
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['categorie', 'modeTransport'] },
      { fields: ['paysDepart', 'paysArrivee'] },
      { fields: ['isActive'] },
    ],
  }
);

module.exports = ArticleTarif;
