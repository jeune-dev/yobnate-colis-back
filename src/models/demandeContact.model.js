const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Demande de contact déposée depuis le formulaire PUBLIC d'un site vitrine
 * (Yobanté Rek ou Yobanté Boutique).
 *
 * Volontairement sans clé étrangère vers `users` : le demandeur n'est pas
 * authentifié et n'a pas forcément de compte. L'administrateur y répond depuis
 * le back-office ; l'objet et la réponse sont conservés et envoyés par email.
 */
class DemandeContact extends Model {}

DemandeContact.SOURCES = ['rek', 'boutique'];
DemandeContact.STATUTS = ['en_attente', 'traitee'];

DemandeContact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    source: {
      type: DataTypes.ENUM(...DemandeContact.SOURCES),
      allowNull: false,
      defaultValue: 'rek',
    },
    prenom: { type: DataTypes.STRING(80), allowNull: false, validate: { notEmpty: true } },
    nom: { type: DataTypes.STRING(80), allowNull: false, validate: { notEmpty: true } },
    email: { type: DataTypes.STRING(150), allowNull: false, validate: { isEmail: true } },
    telephone: { type: DataTypes.STRING(30), allowNull: true },
    sujet: { type: DataTypes.STRING(150), allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    statut: {
      type: DataTypes.ENUM(...DemandeContact.STATUTS),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    objetReponse: { type: DataTypes.STRING(200), allowNull: true },
    reponse: { type: DataTypes.TEXT, allowNull: true },
    traitePar: { type: DataTypes.UUID, allowNull: true },
    traiteLe: { type: DataTypes.DATE, allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'DemandeContact',
    tableName: 'demandes_contact',
    indexes: [
      { name: 'demandes_contact_statut_created_at', fields: ['statut', 'createdAt'] },
      { name: 'demandes_contact_email', fields: ['email'] },
    ],
  }
);

module.exports = DemandeContact;
