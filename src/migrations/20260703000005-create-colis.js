'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('colis', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      reference: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      expediteurNom: { type: Sequelize.STRING(100), allowNull: false },
      expediteurTelephone: { type: Sequelize.STRING(20), allowNull: false },
      villeDepartId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'villes', key: 'id' },
        onDelete: 'RESTRICT'
      },
      destinataireNom: { type: Sequelize.STRING(100), allowNull: false },
      destinataireTelephone: { type: Sequelize.STRING(20), allowNull: false },
      villeArriveeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'villes', key: 'id' },
        onDelete: 'RESTRICT'
      },
      adresseLivraison: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: true },
      typeColis: { type: Sequelize.ENUM('standard', 'express', 'fragile'), allowNull: false, defaultValue: 'standard' },
      poids: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      valeurDeclaree: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      montant: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      statut: {
        type: Sequelize.ENUM('en_attente', 'en_preparation', 'en_transit', 'arrive', 'recupere', 'livre', 'annule'),
        allowNull: false,
        defaultValue: 'en_attente'
      },
      photos: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      dateLivraisonEstimee: { type: Sequelize.DATEONLY, allowNull: true },
      dateLivraisonEffective: { type: Sequelize.DATE, allowNull: true },
      annuleMotif: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('colis', ['userId']);
    await queryInterface.addIndex('colis', ['statut']);
    await queryInterface.addIndex('colis', ['villeDepartId']);
    await queryInterface.addIndex('colis', ['villeArriveeId']);
    await queryInterface.addIndex('colis', ['userId', 'createdAt']);
    await queryInterface.addIndex('colis', ['createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('colis');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_colis_typeColis";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_colis_statut";');
  }
};
