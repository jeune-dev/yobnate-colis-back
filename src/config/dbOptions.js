/**
 * Options de connexion PostgreSQL communes à l'application (config/db.js) et à
 * la CLI de migration (config/sequelize.config.js) — une seule source.
 *
 * Connexion : DATABASE_URL (postgres://user:mot_de_passe@hote:5432/base), telle
 * que la fournissent Render et la plupart des hébergeurs, est prioritaire ; sinon
 * DB_HOST, DB_PORT, DB_NAME, DB_USER et DB_PASSWORD (Docker, poste local).
 *
 * TLS :
 * - DB_SSL=true / false décide explicitement ;
 * - sans DB_SSL : TLS en production quand DATABASE_URL est utilisée (base
 *   managée hors de l'hôte), pas de TLS pour la base du docker-compose,
 *   joignable seulement sur le réseau Docker interne et sans certificat.
 * DB_SSL_CA (PEM ou base64) permet de vérifier un certificat auto-signé.
 *
 * Pool (valeurs issues de l'audit de performance) :
 * - DB_POOL_MAX (10) connexions par processus ; en cluster PM2 le total vaut
 *   DB_POOL_MAX × workers et doit rester sous max_connections (100 par défaut) ;
 * - acquire 15 s : une requête sans connexion échoue (503) au lieu de s'empiler ;
 * - statement_timeout / idle_in_transaction_session_timeout : aucune requête ni
 *   transaction oubliée ne monopolise une connexion.
 */
const entier = (valeur, defaut) => {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 ? n : defaut;
};

const tlsActive = () => {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  return process.env.NODE_ENV === 'production' && Boolean(process.env.DATABASE_URL);
};

const configurationSsl = () => {
  if (!tlsActive()) return false;
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
    application_name: 'yobante-colis-api',
    connectionTimeoutMillis: entier(process.env.DB_CONNECT_TIMEOUT_MS, 5000),
    statement_timeout: entier(process.env.DB_STATEMENT_TIMEOUT_MS, 30000),
    idle_in_transaction_session_timeout: entier(process.env.DB_IDLE_TX_TIMEOUT_MS, 60000),
    keepAlive: true,
  };
};

const pool = () => ({
  max: entier(process.env.DB_POOL_MAX, 10) || 10,
  min: entier(process.env.DB_POOL_MIN, 0),
  acquire: entier(process.env.DB_POOL_ACQUIRE_MS, 15000),
  idle: 10000,
  evict: 5000,
});

/** Paramètres de connexion hors DATABASE_URL. */
const connexionParVariables = () => ({
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || '127.0.0.1',
  port: entier(process.env.DB_PORT, 5432),
});

module.exports = { dialectOptions, pool, entier, connexionParVariables };
