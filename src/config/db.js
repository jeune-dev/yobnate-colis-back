require('dotenv').config();
const { Sequelize } = require('sequelize');
const { dialectOptions, pool, connexionParVariables } = require('./dbOptions');

/** Connexion PostgreSQL : DATABASE_URL prioritaire, sinon DB_* (voir dbOptions.js). */
const options = {
  dialect: 'postgres',
  logging: false,
  dialectOptions: dialectOptions(),
  pool: pool(),
  define: { freezeTableName: true },
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, options)
  : (() => {
      const { database, username, password, host, port } = connexionParVariables();
      return new Sequelize(database, username, password, { ...options, host, port });
    })();

module.exports = sequelize;
