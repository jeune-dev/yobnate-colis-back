const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Notification extends Model {}

Notification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    titre: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('colis', 'paiement', 'systeme'),
      allowNull: false,
      defaultValue: 'systeme'
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    lienCible: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    updatedAt: false,
    indexes: [
      { fields: ['userId', 'isRead'] },
      { fields: ['userId', 'createdAt'] }
    ]
  }
);

module.exports = Notification;
