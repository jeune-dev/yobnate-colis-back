'use strict';

/**
 * Index manquants relevés par l'audit de charge (base de 200 000 colis, 40 000
 * factures, 20 000 paiements, 19 000 avis, 20 000 comptes ; EXPLAIN ANALYZE) :
 *
 * - paiements ("createdAt") : liste et export des paiements du back-office, triés
 *   du plus récent au plus ancien. Sans index, PostgreSQL joignait TOUTE la table
 *   (factures, colis, comptes, fichiers temporaires) avant d'en garder 20 lignes :
 *   212 ms → 4 ms, et un coût qui croissait avec le nombre de paiements ;
 * - factures ("createdAt") : même défaut sur la liste des factures, 168 ms → 0,7 ms ;
 * - avis ("createdAt" DESC, id DESC) : file de modération sans filtre de statut,
 *   l'index (statut, createdAt) ne servait pas : 81 ms → 0,7 ms ;
 * - users (lower(email)) : chaque connexion, inscription et demande de code
 *   recherche l'email sans tenir compte de la casse, ce qui parcourait toute la
 *   table des comptes (5 ms pour 20 000 comptes, proportionnel au nombre de
 *   comptes) : 0,1 ms.
 *
 * CONCURRENTLY : aucune écriture bloquée pendant la création en production (la
 * migration ne s'exécute donc pas dans une transaction).
 *
 * @type {import('sequelize-cli').Migration}
 */
const INDEX = [
  { nom: 'paiements_created_at', sql: 'ON paiements ("createdAt")' },
  { nom: 'factures_created_at', sql: 'ON factures ("createdAt")' },
  { nom: 'avis_created_at_id', sql: 'ON avis ("createdAt" DESC, id DESC)' },
  { nom: 'users_lower_email', sql: 'ON users (lower(email))' },
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    for (const { nom, sql } of INDEX) {
      // Une création CONCURRENTLY interrompue laisse un index INVALID que
      // « IF NOT EXISTS » ignorerait : on le supprime avant de le reconstruire.
      const [[invalide]] = await sequelize.query(
        `SELECT 1 AS present FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
          WHERE c.relname = :nom AND NOT i.indisvalid`,
        { replacements: { nom } }
      );
      if (invalide) await sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nom}"`);
      await sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${nom}" ${sql}`);
    }
  },

  async down(queryInterface) {
    for (const { nom } of INDEX) {
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nom}"`);
    }
  },
};
