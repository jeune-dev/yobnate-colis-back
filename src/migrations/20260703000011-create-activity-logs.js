'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activity_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      action: { type: Sequelize.STRING(100), allowNull: false },
      entite: { type: Sequelize.STRING(50), allowNull: true },
      entiteId: { type: Sequelize.UUID, allowNull: true },
      details: { type: Sequelize.JSONB, allowNull: true },
      ipAddress: { type: Sequelize.STRING(45), allowNull: true },
      userAgent: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('activity_logs', ['userId', 'createdAt']);
    await queryInterface.addIndex('activity_logs', ['action']);
    await queryInterface.addIndex('activity_logs', ['entite', 'entiteId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('activity_logs');
  }
};
