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
const entier = (valeur, defaut) => {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 ? n : defaut;
};

/**
 * Pool de connexions.
 * - DB_POOL_MAX (défaut 10) : connexions par processus. Avec PM2 en cluster, le
 *   total est DB_POOL_MAX × nombre de workers : il doit rester sous le
 *   max_connections de PostgreSQL (100 par défaut), marge d'administration comprise.
 * - acquire : une requête qui n'obtient pas de connexion en 15 s échoue (503) au lieu
 *   de s'empiler indéfiniment derrière un pool saturé.
 * - statement_timeout : aucune requête SQL ne peut monopoliser une connexion plus de
 *   DB_STATEMENT_TIMEOUT_MS (défaut 30 s) ; idle_in_transaction_session_timeout libère
 *   une transaction laissée ouverte par erreur.
 */
const options = {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl:
      process.env.NODE_ENV === 'production'
        ? { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    application_name: 'yobnate-colis-api',
    statement_timeout: entier(process.env.DB_STATEMENT_TIMEOUT_MS, 30000),
    idle_in_transaction_session_timeout: entier(process.env.DB_IDLE_TX_TIMEOUT_MS, 60000),
    keepAlive: true,
  },
  pool: {
    max: entier(process.env.DB_POOL_MAX, 10) || 10,
    min: entier(process.env.DB_POOL_MIN, 0),
    acquire: entier(process.env.DB_POOL_ACQUIRE_MS, 15000),
    idle: 10000,
    evict: 5000,
  },
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
