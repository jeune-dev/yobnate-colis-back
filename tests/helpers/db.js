/**
 * Suites qui exigent la base jetable : ignorées (et signalées comme telles)
 * quand TEST_DB_NAME n'est pas défini, plutôt que de passer en silence.
 */
const BASE_DISPONIBLE = Boolean(process.env.TEST_DB_NAME);

const describeDb = BASE_DISPONIBLE ? describe : describe.skip;

const fermerBase = async () => {
  if (!BASE_DISPONIBLE) return;
  const { sequelize } = require('../../src/models');
  await sequelize.close();
};

module.exports = { BASE_DISPONIBLE, describeDb, fermerBase };
