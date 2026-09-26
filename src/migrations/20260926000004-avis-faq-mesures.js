'use strict';

/**
 * Points du cahier des charges encore absents :
 *
 * - avis             : avis clients modérés (site vitrine, qualité des évaluations) ;
 * - faqs             : questions fréquentes du site vitrine et de l'application ;
 * - simulations_devis: simulations conservées pour le taux de conversion ;
 * - visites          : sessions de visite (trafic, visiteurs connus, temps, source) ;
 * - colis.coutRevient, rotations.coutTotal / coutDevise : marge moyenne.
 *
 * Idempotente : une base créée par sync() à partir des modèles possède déjà ces
 * éléments, ils ne sont alors pas recréés.
 *
 * @type {import('sequelize-cli').Migration}
 */
const COLONNES = [
  ['colis', 'coutRevient', (S) => ({ type: S.DECIMAL(12, 2), allowNull: true })],
  ['rotations', 'coutTotal', (S) => ({ type: S.DECIMAL(12, 2), allowNull: true })],
  ['rotations', 'coutDevise', (S) => ({ type: S.ENUM('EUR', 'XOF'), allowNull: true })],
];

const horodatage = (S) => ({
  createdAt: { type: S.DATE, allowNull: false },
  updatedAt: { type: S.DATE, allowNull: false },
});

const TABLES = {
  avis: (S) => ({
    id: { type: S.UUID, primaryKey: true, allowNull: false },
    userId: {
      type: S.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    colisId: {
      type: S.UUID,
      allowNull: true,
      references: { model: 'colis', key: 'id' },
      onDelete: 'SET NULL',
    },
    note: { type: S.SMALLINT, allowNull: false },
    titre: { type: S.STRING(120), allowNull: true },
    commentaire: { type: S.STRING(1000), allowNull: true },
    statut: {
      type: S.ENUM('en_attente', 'publie', 'rejete'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    motifRejet: { type: S.STRING(255), allowNull: true },
    reponse: { type: S.STRING(1000), allowNull: true },
    moderePar: { type: S.UUID, allowNull: true },
    modereLe: { type: S.DATE, allowNull: true },
    ...horodatage(S),
  }),
  faqs: (S) => ({
    id: { type: S.UUID, primaryKey: true, allowNull: false },
    question: { type: S.STRING(255), allowNull: false },
    reponse: { type: S.TEXT, allowNull: false },
    rubrique: {
      type: S.ENUM('general', 'expedition', 'tarifs', 'paiement', 'suivi', 'douane', 'compte'),
      allowNull: false,
      defaultValue: 'general',
    },
    ordre: { type: S.SMALLINT, allowNull: false, defaultValue: 0 },
    isActive: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
    modifiePar: { type: S.UUID, allowNull: true },
    ...horodatage(S),
  }),
  simulations_devis: (S) => ({
    id: { type: S.UUID, primaryKey: true, allowNull: false },
    userId: { type: S.UUID, allowNull: true },
    visiteurId: { type: S.UUID, allowNull: true },
    categorie: { type: S.STRING(20), allowNull: true },
    paysDepart: { type: S.ENUM('FR', 'SN'), allowNull: true },
    paysArrivee: { type: S.ENUM('FR', 'SN'), allowNull: true },
    montantEstime: { type: S.DECIMAL(12, 2), allowNull: true },
    devise: { type: S.STRING(3), allowNull: true },
    nbOffres: { type: S.SMALLINT, allowNull: false, defaultValue: 0 },
    colisId: {
      type: S.UUID,
      allowNull: true,
      references: { model: 'colis', key: 'id' },
      onDelete: 'SET NULL',
    },
    convertiLe: { type: S.DATE, allowNull: true },
    createdAt: { type: S.DATE, allowNull: false },
  }),
  visites: (S) => ({
    id: { type: S.UUID, primaryKey: true, allowNull: false },
    visiteurId: { type: S.UUID, allowNull: false },
    userId: { type: S.UUID, allowNull: true },
    plateforme: { type: S.ENUM('web', 'android', 'ios'), allowNull: false },
    source: {
      type: S.ENUM('direct', 'recherche', 'reseau_social', 'campagne', 'email', 'site_referent'),
      allowNull: false,
      defaultValue: 'direct',
    },
    referentDomaine: { type: S.STRING(120), allowNull: true },
    utmSource: { type: S.STRING(80), allowNull: true },
    utmMedium: { type: S.STRING(80), allowNull: true },
    utmCampagne: { type: S.STRING(120), allowNull: true },
    pageEntree: { type: S.STRING(255), allowNull: true },
    pagesVues: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
    debut: { type: S.DATE, allowNull: false },
    derniereActivite: { type: S.DATE, allowNull: false },
    dureeSecondes: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
  }),
};

// Index créés même si la table existait (base issue de sync()) : IF NOT EXISTS
const INDEX = [
  'CREATE INDEX IF NOT EXISTS "avis_statut_created_at" ON avis (statut, "createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS "avis_user_id" ON avis ("userId")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "avis_colis_id_unique" ON avis ("colisId")
     WHERE "colisId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "faqs_actif_rubrique_ordre" ON faqs ("isActive", rubrique, ordre)`,
  `CREATE INDEX IF NOT EXISTS "simulations_devis_created_at" ON simulations_devis ("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "simulations_devis_user_id"
     ON simulations_devis ("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "simulations_devis_visiteur_id"
     ON simulations_devis ("visiteurId", "createdAt")`,
  'CREATE INDEX IF NOT EXISTS "visites_debut" ON visites (debut)',
  'CREATE INDEX IF NOT EXISTS "visites_visiteur_id" ON visites ("visiteurId")',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [table, colonne, definition] of COLONNES) {
      const existantes = await queryInterface.describeTable(table);
      if (!existantes[colonne])
        await queryInterface.addColumn(table, colonne, definition(Sequelize));
    }

    const tables = await queryInterface.showAllTables();
    for (const [nom, definition] of Object.entries(TABLES)) {
      if (!tables.includes(nom)) await queryInterface.createTable(nom, definition(Sequelize));
    }
    for (const requete of INDEX) await queryInterface.sequelize.query(requete);
  },

  async down(queryInterface) {
    for (const nom of Object.keys(TABLES).reverse()) {
      await queryInterface.dropTable(nom);
    }
    for (const type of [
      'enum_avis_statut',
      'enum_faqs_rubrique',
      'enum_simulations_devis_paysDepart',
      'enum_simulations_devis_paysArrivee',
      'enum_visites_plateforme',
      'enum_visites_source',
    ]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${type}"`);
    }
    for (const [table, colonne] of COLONNES) {
      const existantes = await queryInterface.describeTable(table);
      if (existantes[colonne]) await queryInterface.removeColumn(table, colonne);
    }
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_rotations_coutDevise"');
  },
};
