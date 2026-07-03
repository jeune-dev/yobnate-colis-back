'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_otps', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      codeHash: { type: Sequelize.STRING(64), allowNull: false },
      type: { type: Sequelize.ENUM('reset_password'), allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      isUsed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('user_otps', ['userId', 'type', 'isUsed']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_otps');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_otps_type";');
  }
};
