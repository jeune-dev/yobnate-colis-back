const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
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
    { fields: ['token'] },       // H-04 : recherche O(log n) pour les lookups blacklist
    { fields: ['expires_at'] },  // accélère le nettoyage par cron
  ],
});

module.exports = TokenBlacklist;
