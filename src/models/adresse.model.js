const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');

/**
 * Carnet d'adresses du client : expéditeurs et destinataires enregistrés,
 * réutilisables en un clic lors d'une nouvelle expédition.
 */
class Adresse extends Model {}

Adresse.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    /** Libellé mémo choisi par le client (ex. « Maman Dakar », « Bureau Paris »). */
    libelle: { type: DataTypes.STRING(80), allowNull: false, validate: { notEmpty: true } },
    type: {
      type: DataTypes.ENUM('expediteur', 'destinataire', 'les_deux'),
      allowNull: false,
      defaultValue: 'destinataire',
    },
    nom: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
    entreprise: { type: DataTypes.STRING(120), allowNull: true },
    telephone: { type: DataTypes.STRING(20), allowNull: false },
    telephoneSecondaire: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true, validate: { isEmail: true } },
    pays: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    villeId: { type: DataTypes.UUID, allowNull: false },
    adresse: { type: DataTypes.STRING(255), allowNull: false, validate: { notEmpty: true } },
    complementAdresse: { type: DataTypes.STRING(255), allowNull: true },
    quartier: { type: DataTypes.STRING(100), allowNull: true },
    codePostal: { type: DataTypes.STRING(10), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    instructions: { type: DataTypes.STRING(500), allowNull: true },
    /** Point de retrait habituel associé à cette adresse. */
    pointRetraitPrefereId: { type: DataTypes.UUID, allowNull: true },
    /** Adresse proposée par défaut dans le formulaire d'expédition. */
    parDefaut: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Adresse',
    tableName: 'adresses',
    indexes: [{ fields: ['userId'] }, { fields: ['userId', 'type'] }, { fields: ['villeId'] }],
  }
);

module.exports = Adresse;
