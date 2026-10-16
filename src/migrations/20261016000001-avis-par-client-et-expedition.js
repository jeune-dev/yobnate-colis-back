'use strict';

/**
 * Avis liés aux expéditions : l'expéditeur et le destinataire d'un même colis
 * peuvent chacun l'évaluer.
 *
 * L'unicité passe de « un avis par expédition » à « un avis par client et par
 * expédition ». Les anciens avis généraux (`colisId` nul) sont conservés.
 *
 * Idempotente.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "avis_colis_id_user_id_unique"
        ON avis ("colisId", "userId") WHERE "colisId" IS NOT NULL
    `);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "avis_colis_id_unique"`);
  },

  down: async (queryInterface) => {
    // Échoue si un colis a été évalué par ses deux parties : à arbitrer à la main
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "avis_colis_id_unique"
        ON avis ("colisId") WHERE "colisId" IS NOT NULL
    `);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "avis_colis_id_user_id_unique"`);
  },
};
