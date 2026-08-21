const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/** Message du fil de discussion d'une réclamation. */
class MessageReclamation extends Model {}

MessageReclamation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reclamationId: { type: DataTypes.UUID, allowNull: false },
    auteurId: { type: DataTypes.UUID, allowNull: true },
    /** Côté émetteur : le client ou le service client. */
    origine: { type: DataTypes.ENUM('client', 'support'), allowNull: false },
    message: { type: DataTypes.STRING(2000), allowNull: false, validate: { notEmpty: true } },
    piecesJointes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    /** Une note interne n'est jamais renvoyée au client. */
    interne: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    luAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'MessageReclamation',
    tableName: 'messages_reclamation',
    updatedAt: false,
    indexes: [{ fields: ['reclamationId', 'createdAt'] }],
  }
);

module.exports = MessageReclamation;
