'use strict';

/**
 * Migration initiale du schéma Yobante Colis.
 *
 * Plutôt que de dupliquer à la main la définition de 28 tables — au risque
 * d'une dérive silencieuse entre le schéma de développement et celui de
 * production — cette migration délègue la création à Sequelize lui-même, à
 * partir des modèles qui font foi (`src/models`). C'est exactement le mécanisme
 * qu'utilise déjà le mode développement (`sequelize.sync()` dans server.js) :
 * l'exécuter une fois via une migration lui donne une trace versionnée et la
 * possibilité d'être rejouée sur un environnement de production vierge.
 *
 * Les associations `belongsTo` des modèles produisent de vraies clés étrangères
 * (68 contraintes sur une base vierge) ; sync() ordonne lui-même la création
 * des tables selon ces dépendances.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    `);

    // Base déjà créée hors migrations (sync() du mode développement) : son schéma
    // est celui d'une version antérieure des modèles, que les migrations suivantes
    // font évoluer. Un sync() ici tenterait d'indexer des colonnes encore absentes.
    const tables = await queryInterface.showAllTables();
    if (tables.includes('colis')) return;

    // Charge toutes les définitions de modèles et associations, puis crée
    // les tables absentes avec leurs colonnes, types, valeurs par défaut et index.
    const { sequelize } = require('../models');
    await sequelize.sync();
  },

  async down(queryInterface) {
    // Un rollback complet supprimerait l'intégralité du schéma applicatif ;
    // en environnement de production, une restauration de sauvegarde est le
    // chemin de secours attendu plutôt qu'un DROP automatisé.
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS "pg_trgm";');
  },
};
