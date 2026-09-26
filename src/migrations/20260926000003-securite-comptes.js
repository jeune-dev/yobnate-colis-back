'use strict';

/**
 * Sécurité des comptes et cycle de vie (audit de mise en production).
 *
 * - users.tokenVersion      : révocation des jetons d'accès au changement de mot de passe ;
 * - users.telephoneVerifie  : numéro prouvé par code (accès aux colis reçus) ;
 * - users.supprimeLe        : suppression du compte à la demande du titulaire ;
 * - user_otps.tentatives    : invalidation d'un code après plusieurs essais erronés ;
 * - user_otps.type          : nouveau type `verification_telephone` ;
 * - app_versions            : version minimale / dernière version de l'app mobile ;
 * - demandes_suppression    : demandes publiques de suppression de compte.
 *
 * Idempotente : une base créée par sync() à partir des modèles possède déjà ces
 * éléments, ils ne sont alors pas recréés.
 *
 * @type {import('sequelize-cli').Migration}
 */
const COLONNES = [
  ['users', 'tokenVersion', (S) => ({ type: S.INTEGER, allowNull: false, defaultValue: 0 })],
  [
    'users',
    'telephoneVerifie',
    (S) => ({ type: S.BOOLEAN, allowNull: false, defaultValue: false }),
  ],
  ['users', 'supprimeLe', (S) => ({ type: S.DATE, allowNull: true })],
  ['user_otps', 'tentatives', (S) => ({ type: S.INTEGER, allowNull: false, defaultValue: 0 })],
];

const horodatage = (S) => ({
  createdAt: { type: S.DATE, allowNull: false },
  updatedAt: { type: S.DATE, allowNull: false },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [table, colonne, definition] of COLONNES) {
      const existantes = await queryInterface.describeTable(table);
      if (!existantes[colonne])
        await queryInterface.addColumn(table, colonne, definition(Sequelize));
    }

    // ADD VALUE ne peut pas s'exécuter dans une transaction : requête isolée
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_user_otps_type" ADD VALUE IF NOT EXISTS 'verification_telephone'`
    );

    const tables = await queryInterface.showAllTables();

    if (!tables.includes('app_versions')) {
      await queryInterface.createTable('app_versions', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        plateforme: { type: Sequelize.ENUM('android', 'ios'), allowNull: false },
        derniereVersion: { type: Sequelize.STRING(20), allowNull: false },
        versionMinimale: { type: Sequelize.STRING(20), allowNull: false },
        miseAJourForcee: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        titre: {
          type: Sequelize.STRING(120),
          allowNull: false,
          defaultValue: 'Nouvelle version disponible',
        },
        message: { type: Sequelize.TEXT, allowNull: true },
        lienStore: { type: Sequelize.STRING(255), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...horodatage(Sequelize),
      });
      await queryInterface.addIndex('app_versions', ['plateforme', 'isActive']);
    }

    if (!tables.includes('demandes_suppression')) {
      await queryInterface.createTable('demandes_suppression', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        email: { type: Sequelize.STRING(150), allowNull: false },
        motif: { type: Sequelize.TEXT, allowNull: true },
        statut: {
          type: Sequelize.ENUM('en_attente', 'traitee', 'rejetee'),
          allowNull: false,
          defaultValue: 'en_attente',
        },
        ip: { type: Sequelize.STRING(64), allowNull: true },
        traitePar: { type: Sequelize.UUID, allowNull: true },
        traiteLe: { type: Sequelize.DATE, allowNull: true },
        noteAdmin: { type: Sequelize.TEXT, allowNull: true },
        ...horodatage(Sequelize),
      });
      await queryInterface.addIndex('demandes_suppression', ['statut', 'createdAt']);
      await queryInterface.addIndex('demandes_suppression', ['email']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('demandes_suppression');
    await queryInterface.dropTable('app_versions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_demandes_suppression_statut"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_app_versions_plateforme"');
    for (const [table, colonne] of COLONNES) {
      const existantes = await queryInterface.describeTable(table);
      if (existantes[colonne]) await queryInterface.removeColumn(table, colonne);
    }
    // Une valeur d'ENUM PostgreSQL ne se retire pas : `verification_telephone` reste déclarée.
  },
};
