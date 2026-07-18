const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tokenHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'token_blacklist',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['expires_at'] },
  ],
});

module.exports = TokenBlacklist;
