const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class UserOtp extends Model {}

UserOtp.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    codeHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('reset_password', 'verification_email', 'verification_telephone'),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Codes erronés déjà soumis : au-delà du plafond, le code est invalidé. */
    tentatives: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'UserOtp',
    tableName: 'user_otps',
    updatedAt: false,
    indexes: [{ fields: ['userId', 'type', 'isUsed'] }],
  }
);

module.exports = UserOtp;
