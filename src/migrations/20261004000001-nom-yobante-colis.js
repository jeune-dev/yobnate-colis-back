'use strict';

/**
 * Nom commercial : « Yobnate Express » devient « Yobante Colis » dans les données
 * déjà enregistrées (raison sociale des documents, adresses de réception,
 * points de collecte, modèles d'email, annonces). Les valeurs par défaut du
 * code portent déjà le nouveau nom ; une valeur personnalisée par
 * l'administrateur n'est touchée que si elle contient l'ancien nom.
 *
 * Idempotente : sans ancien nom en base, elle ne modifie rien.
 *
 * @type {import('sequelize-cli').Migration}
 */
const REMPLACEMENTS = [
  ['YOBNATE EXPRESS', 'YOBANTE COLIS'],
  ['Yobnate Express', 'Yobante Colis'],
  ['Agence Yobnate', 'Agence Yobante Colis'],
];

/** Colonnes texte où le nom commercial peut apparaître, par table. */
const COLONNES = {
  parametres_systeme: ['valeur'],
  points_collecte: ['nom'],
  modeles_email: ['sujet', 'corpsHtml'],
  annonces: ['titre', 'message'],
};

const remplacer = async (queryInterface, sens) => {
  const tables = await queryInterface.showAllTables();
  for (const [table, colonnes] of Object.entries(COLONNES)) {
    if (!tables.includes(table)) continue;
    const description = await queryInterface.describeTable(table);
    for (const colonne of colonnes.filter((c) => description[c])) {
      for (const [ancien, nouveau] of REMPLACEMENTS) {
        const [de, vers] = sens === 'up' ? [ancien, nouveau] : [nouveau, ancien];
        await queryInterface.sequelize.query(
          `UPDATE "${table}" SET "${colonne}" = REPLACE("${colonne}", :de, :vers)
           WHERE "${colonne}" LIKE :motif`,
          { replacements: { de, vers, motif: `%${de}%` } }
        );
      }
    }
  }
};

module.exports = {
  up: (queryInterface) => remplacer(queryInterface, 'up'),
  down: (queryInterface) => remplacer(queryInterface, 'down'),
};
