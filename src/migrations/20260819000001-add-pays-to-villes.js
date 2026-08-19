'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Enum pays (France / Sénégal uniquement pour le moment)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_villes_pays" AS ENUM ('FR', 'SN');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Colonne pays sur villes (backfill à SN — les villes seedées existantes sont sénégalaises)
    await queryInterface.sequelize.query(`
      ALTER TABLE villes ADD COLUMN IF NOT EXISTS pays "enum_villes_pays" NOT NULL DEFAULT 'SN';
      ALTER TABLE villes ALTER COLUMN pays DROP DEFAULT;
    `);

    // L'unicité du nom passe d'une portée globale à une portée par pays
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS villes_nom;
      DROP INDEX IF EXISTS villes_nom_unique;
      ALTER TABLE villes DROP CONSTRAINT IF EXISTS villes_nom_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_villes_nom_pays ON villes (nom, pays);
      CREATE INDEX IF NOT EXISTS idx_villes_pays ON villes (pays);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_villes_pays;
      DROP INDEX IF EXISTS idx_villes_nom_pays;
      CREATE UNIQUE INDEX IF NOT EXISTS villes_nom ON villes (nom);
      ALTER TABLE villes DROP COLUMN IF EXISTS pays;
      DROP TYPE IF EXISTS "enum_villes_pays";
    `);
  },
};
