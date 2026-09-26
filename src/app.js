const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const { corsConfig } = require('./config/security');
const sequelize = require('./config/db');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const masquerUrl = require('./utils/masquerUrl');
const etatApplication = require('./utils/etatApplication');
const requestId = require('./middlewares/requestId.middleware');
const { globalRateLimit } = require('./middlewares/rateLimit.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');
const { ROUTES } = require('./modules');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

/** Préfixe versionné de l'API (comme Widjila). Les chemins historiques sans préfixe restent servis. */
const PREFIXE_API = '/api/v1';

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);

// Helmet : CSP stricte (l'API ne sert pas de HTML, hors Swagger UI en développement)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        styleSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});
app.use(cors(corsConfig));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

// Journal HTTP structuré : URL masquée (jetons), identifiant de corrélation et utilisateur
app.use((req, res, next) => {
  const debut = Date.now();
  res.on('finish', () => {
    logger.info('http', {
      requestId: req.requestId,
      method: req.method,
      url: masquerUrl(req.originalUrl),
      status: res.statusCode,
      ms: Date.now() - debut,
      ip: req.ip,
      utilisateur: req.user?.id,
    });
  });
  next();
});

/* ── Sondes de santé ─────────────────────────────────────────────────────── */

const DELAI_SONDE_MS = 3000;
const DUREE_CACHE_SANTE_MS = 5000;
let bilan = null;
let bilanLe = 0;

const avecDelai = (promesse, ms) => {
  let minuteur;
  const delai = new Promise((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new Error('délai dépassé')), ms);
    minuteur.unref();
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
};

/** Bilan mis en cache quelques secondes : une rafale de sondes ne sature pas la base. */
const evaluerSante = async () => {
  if (bilan && Date.now() - bilanLe < DUREE_CACHE_SANTE_MS) return bilan;
  const dbOk = await avecDelai(sequelize.authenticate(), DELAI_SONDE_MS).then(
    () => true,
    () => false
  );
  const redisEtat = redis ? redis.status : 'non configuré';
  bilan = {
    dbOk,
    corps: {
      success: dbOk,
      status: dbOk && (!redis || redis.status === 'ready') ? 'ok' : 'degraded',
      message: dbOk ? 'Yobante Colis API opérationnelle' : 'Base de données injoignable',
      db: dbOk ? 'connected' : 'disconnected',
      redis: redisEtat,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  };
  bilanLe = Date.now();
  return bilan;
};

/** Vivacité : le processus répond (redémarrage par l'orchestrateur sinon). */
const vivacite = (req, res) =>
  res.json({ success: true, status: 'ok', uptime: Math.round(process.uptime()) });

/** Disponibilité : base joignable et processus hors arrêt ; 503 sinon. */
const disponibilite = async (req, res) => {
  const { dbOk, corps } = await evaluerSante();
  const enArret = etatApplication.estEnArret();
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(dbOk && !enArret ? 200 : 503)
    .json(enArret ? { ...corps, success: false, status: 'arret en cours' } : corps);
};

for (const base of ['', PREFIXE_API]) {
  app.get(`${base}/health`, disponibilite);
  app.get(`${base}/health/ready`, disponibilite);
  app.get(`${base}/health/live`, vivacite);
}

/* ── Documentation (hors production) ────────────────────────────────────── */

if (!isProd) {
  // Générée à la première consultation seulement : inutile de la construire à
  // chaque démarrage (ni dans chaque suite de tests).
  let spec = null;
  const documentation = () => {
    spec = spec || require('./config/openapi').genererOpenApi(ROUTES, { prefixe: PREFIXE_API });
    return spec;
  };
  const swaggerUi = require('swagger-ui-express');
  app.get('/api-docs.json', (req, res) => res.json(documentation()));
  app.use('/api-docs', swaggerUi.serve, (req, res, next) =>
    swaggerUi.setup(documentation())(req, res, next)
  );
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

app.use(globalRateLimit);

// Montage sous /api/v1 (chemin canonique) et à la racine (clients existants)
for (const { chemin, routeur } of ROUTES) {
  app.use(`${PREFIXE_API}${chemin}`, routeur);
  app.use(chemin, routeur);
}

app.use((req, res) =>
  res.status(404).json({ success: false, message: 'Route introuvable', requestId: req.requestId })
);
app.use(errorHandler);

app.PREFIXE_API = PREFIXE_API;
module.exports = app;
