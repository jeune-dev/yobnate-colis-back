'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      titre: { type: Sequelize.STRING(150), allowNull: false },
      message: { type: Sequelize.STRING(500), allowNull: false },
      type: { type: Sequelize.ENUM('colis', 'paiement', 'systeme'), allowNull: false, defaultValue: 'systeme' },
      isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      lienCible: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('notifications', ['userId', 'isRead']);
    await queryInterface.addIndex('notifications', ['userId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_type";');
  }
};
