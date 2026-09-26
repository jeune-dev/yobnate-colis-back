require('dotenv').config();
const { dialectOptions } = require('./dbOptions');

/**
 * Configuration de la CLI Sequelize (npm run migrate, docker-entrypoint.sh) :
 * mêmes paramètres de connexion que l'application, quel que soit NODE_ENV.
 */
const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: false,
  dialectOptions: dialectOptions(),
  define: { freezeTableName: true },
};

module.exports = { development: base, test: base, production: base };
