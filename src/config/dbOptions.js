/**
 * Options de connexion PostgreSQL communes à l'application (config/db.js) et à
 * la CLI de migration (config/sequelize.config.js) — une seule source.
 *
 * TLS (comme Widjila) : activé explicitement par DB_SSL=true, pour une base
 * managée hors de l'hôte. La base du docker-compose de production, joignable
 * seulement sur le réseau Docker interne, n'en a pas : l'imposer d'office
 * empêchait le conteneur de se connecter.
 * DB_SSL_CA (PEM ou base64) permet de vérifier un certificat auto-signé.
 */
const entier = (valeur, defaut) => {
  const n = parseInt(valeur, 10);
  return Number.isFinite(n) ? n : defaut;
};

const configurationSsl = () => {
  if (process.env.DB_SSL !== 'true') return false;
  const ssl = {
    require: true,
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
  const ca = process.env.DB_SSL_CA?.trim();
  if (ca) ssl.ca = ca.startsWith('-----') ? ca : Buffer.from(ca, 'base64').toString('utf-8');
  return ssl;
};

const dialectOptions = () => {
  const ssl = configurationSsl();
  return {
    ...(ssl ? { ssl } : {}),
    connectionTimeoutMillis: entier(process.env.DB_CONNECT_TIMEOUT_MS, 5000),
    // Une requête ou une transaction bloquée ne retient pas une connexion indéfiniment
    statement_timeout: entier(process.env.DB_STATEMENT_TIMEOUT_MS, 30000),
    idle_in_transaction_session_timeout: entier(process.env.DB_IDLE_TX_TIMEOUT_MS, 60000),
  };
};

const pool = () => ({
  max: entier(process.env.DB_POOL_MAX, 10),
  min: entier(process.env.DB_POOL_MIN, 0),
  acquire: entier(process.env.DB_POOL_ACQUIRE_MS, 30000),
  idle: 10000,
});

module.exports = { dialectOptions, pool, entier };
