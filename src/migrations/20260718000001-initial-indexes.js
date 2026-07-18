'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Extensions PostgreSQL
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    `);

    // Index FK suivi_colis
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_suivi_colis_colis_created
        ON suivi_colis ("colisId", "createdAt");
    `);

    // Index composite factures
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_colis ON factures ("colisId");
      CREATE INDEX IF NOT EXISTS idx_factures_user_statut ON factures ("userId", statut);
    `);

    // Index paiements
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_paiements_facture ON paiements ("factureId");
      CREATE INDEX IF NOT EXISTS idx_paiements_user ON paiements ("userId");
    `);

    // Index activity_logs
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
        ON activity_logs ("userId", "createdAt");
      CREATE INDEX IF NOT EXISTS idx_activity_logs_entite
        ON activity_logs (entite, "entiteId");
    `);

    // Index notifications
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read
        ON notifications ("userId", "isRead");
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications ("userId", "createdAt");
    `);

    // Index token_blacklist
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
        ON token_blacklist ("expiresAt");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_suivi_colis_colis_created;
      DROP INDEX IF EXISTS idx_factures_colis;
      DROP INDEX IF EXISTS idx_factures_user_statut;
      DROP INDEX IF EXISTS idx_paiements_facture;
      DROP INDEX IF EXISTS idx_paiements_user;
      DROP INDEX IF EXISTS idx_activity_logs_user_created;
      DROP INDEX IF EXISTS idx_activity_logs_entite;
      DROP INDEX IF EXISTS idx_notifications_user_read;
      DROP INDEX IF EXISTS idx_notifications_user_created;
      DROP INDEX IF EXISTS idx_token_blacklist_expires;
    `);
  },
};
