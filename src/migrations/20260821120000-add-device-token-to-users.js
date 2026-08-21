'use strict';

/**
 * Ajoute le stockage du token FCM (push notifications mobile) sur les utilisateurs.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'deviceToken', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'devicePlatform', {
      type: Sequelize.ENUM('ios', 'android'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'deviceToken');
    await queryInterface.removeColumn('users', 'devicePlatform');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_devicePlatform";');
  },
};
