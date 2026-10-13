'use strict';

/**
 * Stock des points de collecte recalculé.
 *
 * Un colis qui quittait son point (retrait, livraison, départ à l'international)
 * gardait son point actuel, et le compteur du point n'était jamais décrémenté. On
 * libère d'abord les colis qui ne peuvent plus être dans un point, puis chaque
 * compteur est recompté à partir des colis qui s'y trouvent réellement.
 *
 * Idempotente. Sans retour arrière : les anciens compteurs étaient faux.
 *
 * @type {import('sequelize-cli').Migration}
 */
const HORS_POINT = [
  'livre',
  'recupere',
  'retourne',
  'annule',
  'refuse',
  'en_transit',
  'en_livraison',
];

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE "colis" SET "pointActuelId" = NULL
        WHERE "pointActuelId" IS NOT NULL AND "statut"::text IN (:statuts)`,
      { replacements: { statuts: HORS_POINT } }
    );
    await queryInterface.sequelize.query(`
      UPDATE "points_collecte" p
         SET "colisEnStock" = (SELECT COUNT(*) FROM "colis" c WHERE c."pointActuelId" = p."id")
    `);
  },

  down: async () => {},
};
