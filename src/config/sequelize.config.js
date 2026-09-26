require('dotenv').config();
const { dialectOptions, connexionParVariables } = require('./dbOptions');

/**
 * Configuration de la CLI Sequelize (npm run migrate, docker-entrypoint.sh),
 * alignée sur config/db.js : DATABASE_URL prioritaire, sinon les variables DB_*,
 * mêmes options de connexion que l'application quel que soit NODE_ENV.
 */
const base = {
  ...(process.env.DATABASE_URL ? { use_env_variable: 'DATABASE_URL' } : connexionParVariables()),
  dialect: 'postgres',
  logging: false,
  dialectOptions: dialectOptions(),
  define: { freezeTableName: true },
};

module.exports = { development: base, test: base, production: base };
