const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Demande de suppression de compte déposée depuis la page PUBLIQUE (exigence
 * Google Play : une URL joignable sans connexion ni application installée).
 *
 * Volontairement sans clé étrangère vers `users` (repris de Widjila) : le
 * demandeur n'est pas authentifié et peut ne plus avoir de compte ; la demande
 * doit malgré tout être tracée, le RGPD imposant d'y répondre sous 30 jours.
 * L'administrateur vérifie l'identité avant toute suppression.
 */
class DemandeSuppression extends Model {}

DemandeSuppression.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(150), allowNull: false },
    motif: { type: DataTypes.TEXT, allowNull: true },
    statut: {
      type: DataTypes.ENUM('en_attente', 'traitee', 'rejetee'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    traitePar: { type: DataTypes.UUID, allowNull: true },
    traiteLe: { type: DataTypes.DATE, allowNull: true },
    noteAdmin: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'DemandeSuppression',
    tableName: 'demandes_suppression',
    indexes: [{ fields: ['statut', 'createdAt'] }, { fields: ['email'] }],
  }
);

module.exports = DemandeSuppression;
