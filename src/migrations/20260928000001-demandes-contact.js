'use strict';

/**
 * Demandes de contact déposées depuis les formulaires publics des sites vitrines
 * (Yobanté Rek et Yobanté Boutique), puis traitées depuis le back-office : la
 * réponse de l'administrateur est conservée et envoyée par email au demandeur.
 *
 * Idempotente : une base créée par sync() possède déjà la table.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('demandes_contact')) return;

    await queryInterface.createTable('demandes_contact', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      source: {
        type: Sequelize.ENUM('rek', 'boutique'),
        allowNull: false,
        defaultValue: 'rek',
      },
      prenom: { type: Sequelize.STRING(80), allowNull: false },
      nom: { type: Sequelize.STRING(80), allowNull: false },
      email: { type: Sequelize.STRING(150), allowNull: false },
      telephone: { type: Sequelize.STRING(30), allowNull: true },
      sujet: { type: Sequelize.STRING(150), allowNull: true },
      message: { type: Sequelize.TEXT, allowNull: false },
      statut: {
        type: Sequelize.ENUM('en_attente', 'traitee'),
        allowNull: false,
        defaultValue: 'en_attente',
      },
      objetReponse: { type: Sequelize.STRING(200), allowNull: true },
      reponse: { type: Sequelize.TEXT, allowNull: true },
      traitePar: { type: Sequelize.UUID, allowNull: true },
      traiteLe: { type: Sequelize.DATE, allowNull: true },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('demandes_contact', ['statut', 'createdAt'], {
      name: 'demandes_contact_statut_created_at',
    });
    await queryInterface.addIndex('demandes_contact', ['email'], {
      name: 'demandes_contact_email',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('demandes_contact');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_demandes_contact_source"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_demandes_contact_statut"');
  },
};
