'use strict';

/**
 * Remise confirmée par le destinataire dans son application.
 *
 * Au retrait ou à la livraison, l'agent ou le coursier affiche un code à usage
 * unique ; le destinataire titulaire d'un compte le saisit sur son appareil, ce qui
 * clôt la remise. Seule l'empreinte du code est conservée.
 *
 * Idempotente : les colonnes ne sont créées que si elles manquent.
 *
 * @type {import('sequelize-cli').Migration}
 */
const COLONNES = {
  codeRemiseEmpreinte: (S) => ({ type: S.STRING(64), allowNull: true }),
  codeRemiseEvenement: (S) => ({ type: S.STRING(10), allowNull: true }),
  codeRemisePar: (S) => ({ type: S.UUID, allowNull: true }),
  codeRemiseExpireLe: (S) => ({ type: S.DATE, allowNull: true }),
  codeRemiseEchecs: (S) => ({ type: S.SMALLINT, allowNull: false, defaultValue: 0 }),
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const existantes = await queryInterface.describeTable('colis');
    for (const [nom, definition] of Object.entries(COLONNES)) {
      if (!existantes[nom]) await queryInterface.addColumn('colis', nom, definition(Sequelize));
    }
  },

  down: async (queryInterface) => {
    const existantes = await queryInterface.describeTable('colis');
    for (const nom of Object.keys(COLONNES)) {
      if (existantes[nom]) await queryInterface.removeColumn('colis', nom);
    }
  },
};
