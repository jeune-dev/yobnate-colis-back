require('dotenv').config();

/**
 * Configuration de sequelize-cli (migrations), alignée sur src/config/db.js :
 * DATABASE_URL prioritaire, sinon les variables DB_*.
 */
const ssl =
  process.env.NODE_ENV === 'production'
    ? { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false;

const base = process.env.DATABASE_URL
  ? { use_env_variable: 'DATABASE_URL' }
  : {
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
    };

const commun = {
  ...base,
  dialect: 'postgres',
  dialectOptions: { ssl },
  define: { freezeTableName: true },
};

module.exports = {
  development: commun,
  test: process.env.DATABASE_URL ? commun : { ...commun, database: `${process.env.DB_NAME}_test` },
  production: commun,
};
