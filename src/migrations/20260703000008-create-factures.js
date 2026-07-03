'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('factures', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      reference: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      colisId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'colis', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      montantTransport: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      remise: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      montantTotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      statut: { type: Sequelize.ENUM('en_attente', 'payee', 'annulee'), allowNull: false, defaultValue: 'en_attente' },
      dateEmission: { type: Sequelize.DATEONLY, allowNull: false, defaultValue: Sequelize.NOW },
      dateLimitePaiement: { type: Sequelize.DATEONLY, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('factures', ['userId']);
    await queryInterface.addIndex('factures', ['statut']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('factures');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_factures_statut";');
  }
};
