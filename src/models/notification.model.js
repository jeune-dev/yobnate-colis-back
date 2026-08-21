const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/** Notification interne affichée dans l'espace client ou le back-office. */
class Notification extends Model {}

Notification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    titre: { type: DataTypes.STRING(150), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    type: {
      type: DataTypes.ENUM('colis', 'paiement', 'enlevement', 'douane', 'reclamation', 'systeme'),
      allowNull: false,
      defaultValue: 'systeme',
    },
    /** Une notification critique est mise en avant dans l'interface. */
    niveau: {
      type: DataTypes.ENUM('info', 'succes', 'alerte', 'critique'),
      allowNull: false,
      defaultValue: 'info',
    },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lienCible: { type: DataTypes.STRING(255), allowNull: true },
    /** Entité concernée, pour la navigation contextuelle. */
    entite: { type: DataTypes.STRING(50), allowNull: true },
    entiteId: { type: DataTypes.UUID, allowNull: true },
    luAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    updatedAt: false,
    indexes: [
      { fields: ['userId', 'isRead'] },
      { fields: ['userId', 'createdAt'] },
      { fields: ['type'] },
    ],
  }
);

module.exports = Notification;
