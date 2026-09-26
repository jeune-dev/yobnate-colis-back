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
  await sequelize.sync({ force: true });
  await sequelize.close();
};
