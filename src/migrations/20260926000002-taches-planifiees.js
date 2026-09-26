'use strict';

/**
 * Registre des tâches planifiées : garantit qu'une tâche (relance de factures,
 * alertes…) ne s'exécute qu'une fois par créneau, même avec plusieurs processus.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('taches_planifiees')) return;
    await queryInterface.createTable('taches_planifiees', {
      nom: { type: Sequelize.STRING(60), primaryKey: true },
      derniereExecution: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('taches_planifiees');
  },
};
