'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('paiements', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      factureId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'factures', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      montant: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      methode: { type: Sequelize.ENUM('wave', 'orange_money', 'carte', 'virement', 'cash'), allowNull: false },
      statut: { type: Sequelize.ENUM('en_attente', 'succes', 'echoue', 'rembourse'), allowNull: false, defaultValue: 'en_attente' },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      recordedBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      payeAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('paiements', ['userId']);
    await queryInterface.addIndex('paiements', ['statut']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('paiements');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_paiements_methode";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_paiements_statut";');
  }
};
