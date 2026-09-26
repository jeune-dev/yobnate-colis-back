require('dotenv').config();
const { Sequelize } = require('sequelize');

/**
 * Connexion PostgreSQL.
 *
 * Deux façons de la configurer :
 * - DATABASE_URL (postgres://user:mot_de_passe@hote:5432/base), telle que la
 *   fournissent Render et la plupart des hébergeurs — prioritaire si définie ;
 * - sinon DB_HOST, DB_PORT, DB_NAME, DB_USER et DB_PASSWORD (Docker, poste local).
 * En production, la connexion passe en SSL.
 */
const options = {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl:
      process.env.NODE_ENV === 'production'
        ? { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  define: { freezeTableName: true },
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, options)
  : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
      ...options,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
    });

module.exports = sequelize;
