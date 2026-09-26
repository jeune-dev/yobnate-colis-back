/**
 * Organisation des tests :
 * - tests/unit         logique pure, modèles simulés, aucune base ;
 * - tests/security     garde-fous transverses (routes protégées, rôles) ;
 * - tests/integration  API réelle (supertest) sur une base PostgreSQL jetable,
 *                      activés par TEST_DB_NAME (voir tests/helpers/env.js).
 * Les suites d'intégration partagent une seule base : exécution en série, dans
 * UN worker recyclé au-delà d'un seuil mémoire (--runInBand accumule la mémoire
 * de chaque fichier jusqu'à l'épuisement du tas).
 */
module.exports = {
  testEnvironment: 'node',
  // Racine explicite : des copies de travail d'outils tiers (.kilo/worktrees…)
  // contiennent elles aussi un dossier tests/ qui ne doit pas être exécuté.
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/helpers/env.js'],
  globalSetup: '<rootDir>/tests/helpers/globalSetup.js',
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 30000,
  maxWorkers: 1,
  workerIdleMemoryLimit: '300MB',
  verbose: true,
};
