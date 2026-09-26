'use strict';

/**
 * Index et nettoyage issus de l'audit de performance.
 *
 * 1. Dédoublonnage : chaque `sequelize.sync()` (au démarrage du serveur et dans les
 *    migrations précédentes) recréait les contraintes UNIQUE portées par les colonnes
 *    (`users_email_key1`, `_key2`…). Chaque doublon ralentit toutes les écritures et
 *    occupe du disque. On garde un seul index par définition : la clé primaire ou la
 *    contrainte d'origine (sans suffixe numérique).
 * 2. Index redondants : préfixes stricts d'un index composite existant.
 * 3. Index manquants, justifiés par EXPLAIN ANALYZE sur 200 000 colis :
 *    - colis ("destinataireTelephone", "createdAt" DESC) — onglet « Reçus » : 20 ms → 0,1 ms ;
 *    - colis reference (GIN pg_trgm) — recherche partielle : 83 ms → 0,6 ms ;
 *    - suivi_colis ("colisPieceId") partiel — clé étrangère : supprimer 3 pièces
 *      parcourait tout l'historique (239 ms → 0,4 ms).
 *
 * Les index sont créés avec CONCURRENTLY (sans bloquer les écritures en production) :
 * cette migration ne doit donc pas s'exécuter dans une transaction (comportement
 * par défaut de sequelize-cli).
 *
 * @type {import('sequelize-cli').Migration}
 */

const NOUVEAUX_INDEX = [
  {
    nom: 'colis_destinataire_telephone_created_at',
    sql: 'ON colis ("destinataireTelephone", "createdAt" DESC)',
  },
  { nom: 'colis_reference_trgm', sql: 'ON colis USING gin (reference gin_trgm_ops)' },
  {
    nom: 'suivi_colis_colis_piece_id',
    sql: 'ON suivi_colis ("colisPieceId") WHERE "colisPieceId" IS NOT NULL',
  },
];

const INDEX_REDONDANTS = ['colis_user_id', 'colis_statut', 'suivi_colis_colis_id_created_at'];

const dedoublonner = async (sequelize) => {
  const [groupes] = await sequelize.query(`
    SELECT i.indrelid::regclass::text AS "table",
           json_agg(json_build_object(
             'index', ci.relname,
             'primaire', i.indisprimary,
             'contrainte', con.conname
           ) ORDER BY i.indisprimary DESC, (con.conname IS NULL), length(ci.relname), ci.relname) AS "index"
      FROM pg_index i
      JOIN pg_class ci ON ci.oid = i.indexrelid
      JOIN pg_class ct ON ct.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = ct.relnamespace
      LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid AND con.conrelid = i.indrelid
     WHERE n.nspname = current_schema()
     GROUP BY i.indrelid, i.indkey::text, i.indclass::text,
              COALESCE(pg_get_expr(i.indexprs, i.indrelid), ''),
              COALESCE(pg_get_expr(i.indpred, i.indrelid), ''), i.indisunique
    HAVING COUNT(*) > 1`);

  for (const { table, index } of groupes) {
    // Le premier est conservé : clé primaire, sinon contrainte au nom le plus court
    for (const doublon of index.slice(1)) {
      const requete = doublon.contrainte
        ? `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${doublon.contrainte}"`
        : `DROP INDEX IF EXISTS "${doublon.index}"`;
      try {
        await sequelize.query(requete);
      } catch (err) {
        // Une clé étrangère peut dépendre de cet index précis : on le laisse en place
        // eslint-disable-next-line no-console -- sortie de sequelize-cli
        console.warn(`Index ${doublon.index} conservé : ${err.message}`);
      }
    }
  }
};

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

    await dedoublonner(sequelize);

    for (const nom of INDEX_REDONDANTS) {
      await sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nom}"`);
    }

    for (const { nom, sql } of NOUVEAUX_INDEX) {
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
    const { sequelize } = queryInterface;
    for (const { nom } of NOUVEAUX_INDEX) {
      await sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nom}"`);
    }
    await sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "colis_user_id" ON colis ("userId")'
    );
    await sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "colis_statut" ON colis (statut)'
    );
    await sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "suivi_colis_colis_id_created_at" ON suivi_colis ("colisId", "createdAt")'
    );
    // Les doublons supprimés ne sont pas recréés : ils n'avaient aucune utilité.
  },
};
