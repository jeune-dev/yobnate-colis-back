'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('villes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      nom: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      region: { type: Sequelize.STRING(80), allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('villes', ['isActive']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('villes');
  }
};
