/**
 * Prépare une fois pour toutes la base jetable des tests d'intégration :
 * schéma recréé à partir des modèles (le mécanisme même des migrations du projet).
 *
 * Garde-fou : le nom de la base doit se terminer par `_test`, pour qu'une
 * variable mal renseignée ne puisse jamais vider une base de travail.
 */
module.exports = async () => {
  require('./env');
  if (!process.env.TEST_DB_NAME) return;
  if (!/_test$/.test(process.env.TEST_DB_NAME)) {
    throw new Error(
      `TEST_DB_NAME doit se terminer par "_test" (reçu : ${process.env.TEST_DB_NAME})`
    );
  }

  const { sequelize } = require('../../src/models');
  // Extensions créées en production par la migration initiale (index trigrammes de recherche)
  await sequelize.query(
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm;'
  );
  await sequelize.sync({ force: true });
  await sequelize.close();
};
