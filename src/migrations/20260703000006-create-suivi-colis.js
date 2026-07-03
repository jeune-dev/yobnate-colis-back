'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('suivi_colis', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      colisId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'colis', key: 'id' },
        onDelete: 'CASCADE'
      },
      statut: {
        type: Sequelize.ENUM('en_attente', 'en_preparation', 'en_transit', 'arrive', 'recupere', 'livre', 'annule'),
        allowNull: false
      },
      localisation: { type: Sequelize.STRING(150), allowNull: true },
      commentaire: { type: Sequelize.STRING(255), allowNull: true },
      createdBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('suivi_colis', ['colisId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('suivi_colis');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_suivi_colis_statut";');
  }
};
