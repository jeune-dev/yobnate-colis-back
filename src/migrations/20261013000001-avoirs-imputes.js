'use strict';

/**
 * Avoirs imputés sur la facture d'origine et numérotation propre des avoirs.
 *
 * 1. `factures.montantAvoirs` : cumul des avoirs émis sur une facture. Le reste dû
 *    devient total − encaissé − avoirs ; un avoir n'est plus un encaissement.
 * 2. Reprise de l'existant : chaque facture reçoit le cumul de ses avoirs, celles
 *    qui sont ainsi soldées passent « payée », et les avoirs rattachés à une
 *    facture passent « payée » (imputés). Les avoirs sans facture d'origine
 *    (indemnisations de réclamation) restent « en attente » : sommes dues au client.
 * 3. Séquence annuelle des avoirs (`avo_<année>_seq`) : jusqu'ici les avoirs
 *    prenaient leur numéro dans la séquence des factures ou des réclamations, d'où
 *    des trous dans les FAC et des collisions entre AVO. La séquence part après le
 *    plus grand numéro AVO déjà attribué pour chaque année.
 *
 * Idempotente : colonne et séquences ne sont créées que si elles manquent.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const colonnes = await queryInterface.describeTable('factures');
    if (!colonnes.montantAvoirs) {
      await queryInterface.addColumn('factures', 'montantAvoirs', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE "factures" f
         SET "montantAvoirs" = a.total
        FROM (SELECT "factureOrigineId", SUM("montantTotal") AS total
                FROM "factures"
               WHERE "type" = 'avoir' AND "factureOrigineId" IS NOT NULL
               GROUP BY "factureOrigineId") a
       WHERE f."id" = a."factureOrigineId"
    `);
    await queryInterface.sequelize.query(`
      UPDATE "factures"
         SET "statut" = 'payee', "datePaiementComplet" = COALESCE("datePaiementComplet", NOW())
       WHERE "type" <> 'avoir'
         AND "statut" IN ('en_attente', 'partiellement_payee')
         AND "montantAvoirs" > 0
         AND "montantTotal" - "montantPaye" - "montantAvoirs" <= 0
    `);
    await queryInterface.sequelize.query(`
      UPDATE "factures" SET "statut" = 'payee'
       WHERE "type" = 'avoir' AND "factureOrigineId" IS NOT NULL AND "statut" = 'en_attente'
    `);

    const [annees] = await queryInterface.sequelize.query(`
      SELECT SPLIT_PART("reference", '-', 2) AS annee,
             MAX(CAST(SPLIT_PART("reference", '-', 3) AS INTEGER)) AS dernier
        FROM "factures"
       WHERE "reference" ~ '^AVO-[0-9]{4}-[0-9]+$'
       GROUP BY 1
    `);
    for (const { annee, dernier } of annees) {
      const nom = `avo_${annee}_seq`;
      await queryInterface.sequelize.query(`CREATE SEQUENCE IF NOT EXISTS "${nom}" START 1`);
      // Ne recule jamais une séquence déjà plus avancée
      await queryInterface.sequelize.query(
        `SELECT setval('"${nom}"', GREATEST(:dernier, (SELECT last_value FROM "${nom}")))`,
        { replacements: { dernier: Number(dernier) } }
      );
    }
  },

  down: async (queryInterface) => {
    const colonnes = await queryInterface.describeTable('factures');
    if (colonnes.montantAvoirs) await queryInterface.removeColumn('factures', 'montantAvoirs');
  },
};
