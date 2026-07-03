'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      nom: { type: Sequelize.STRING(50), allowNull: false },
      prenom: { type: Sequelize.STRING(50), allowNull: false },
      email: { type: Sequelize.STRING(150), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(100), allowNull: false },
      telephone: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      role: { type: Sequelize.ENUM('client', 'admin', 'super_admin'), allowNull: false, defaultValue: 'client' },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      avatarUrl: { type: Sequelize.STRING(255), allowNull: true },
      avatarPublicId: { type: Sequelize.STRING(150), allowNull: true },
      lastLoginAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('users', ['role']);
    await queryInterface.addIndex('users', ['isActive']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  }
};
