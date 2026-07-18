const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class User extends Model {
  toSafeJSON() {
    const { password: _password, ...safe } = this.toJSON();
    return safe;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    nom: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true, len: [2, 50] }
    },
    prenom: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true, len: [2, 50] }
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },
    password: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    role: {
      type: DataTypes.ENUM('client', 'admin', 'super_admin'),
      allowNull: false,
      defaultValue: 'client'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    avatarUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    avatarPublicId: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    indexes: [
      { fields: ['role'] },
      { fields: ['isActive'] }
    ]
  }
);

module.exports = User;
