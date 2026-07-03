const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class ActivityLog extends Model {}

ActivityLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    entite: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    entiteId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'ActivityLog',
    tableName: 'activity_logs',
    updatedAt: false,
    indexes: [
      { fields: ['userId', 'createdAt'] },
      { fields: ['action'] },
      { fields: ['entite', 'entiteId'] }
    ]
  }
);

module.exports = ActivityLog;
