'use strict';

/**
 * Couleurs des emails : le vert d'origine laisse place aux couleurs du pictogramme
 * Yobante Colis dans les modèles d'email personnalisés par l'administrateur (les
 * modèles par défaut du code portent déjà les nouvelles couleurs).
 *
 * Idempotente : sans ancienne couleur en base, elle ne modifie rien.
 *
 * @type {import('sequelize-cli').Migration}
 */
const REMPLACEMENTS = [
  ['#0b3d2c', '#053D8F'], // vert foncé → bleu marine
  ['#9fd5bd', '#F6C537'], // vert clair → jaune
  ['#f0f7f4', '#E7EDF6'], // fond vert pâle → fond bleu pâle
];

const remplacer = async (queryInterface, sens) => {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('modeles_email')) return;
  for (const [ancien, nouveau] of REMPLACEMENTS) {
    const [de, vers] = sens === 'up' ? [ancien, nouveau] : [nouveau, ancien];
    // Insensible à la casse : #0B3D2C et #0b3d2c désignent la même couleur
    await queryInterface.sequelize.query(
      `UPDATE "modeles_email" SET "corpsHtml" = REGEXP_REPLACE("corpsHtml", :motif, :vers, 'gi')
       WHERE "corpsHtml" ~* :motif`,
      { replacements: { motif: de, vers } }
    );
  }
};

module.exports = {
  up: (queryInterface) => remplacer(queryInterface, 'up'),
  down: (queryInterface) => remplacer(queryInterface, 'down'),
};
