const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression'); // PERF-01 : compression gzip
const { randomUUID } = require('crypto');

const { corsConfig } = require('./config/security');
const logger = require('./config/logger');
const { globalRateLimit } = require('./middlewares/rateLimit.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const authRoutes = require('./routes/auth.route');
const publicRoutes = require('./routes/public.route');

const clientColisRoutes = require('./routes/client/colis.route');
const clientProfilRoutes = require('./routes/client/profil.route');
const clientNotificationRoutes = require('./routes/client/notification.route');
const clientPaiementRoutes = require('./routes/client/paiement.route');
const clientEnlevementRoutes = require('./routes/client/enlevement.route');
const clientAdresseRoutes = require('./routes/client/adresse.route');
const clientReclamationRoutes = require('./routes/client/reclamation.route');

const adminDashboardRoutes = require('./routes/admin/dashboard.route');
const adminUserRoutes = require('./routes/admin/user.route');
const adminPersonnelRoutes = require('./routes/admin/personnel.route');
const adminAdminRoutes = require('./routes/admin/admin.route');
const adminColisRoutes = require('./routes/admin/colis.route');
const adminVilleRoutes = require('./routes/admin/ville.route');
const adminZoneRoutes = require('./routes/admin/zone.route');
const adminPointCollecteRoutes = require('./routes/admin/pointCollecte.route');
const adminServiceExpeditionRoutes = require('./routes/admin/serviceExpedition.route');
const adminTarifRoutes = require('./routes/admin/tarif.route');
const adminSurchargeRoutes = require('./routes/admin/surcharge.route');
const adminJourFerieRoutes = require('./routes/admin/jourFerie.route');
const adminRotationRoutes = require('./routes/admin/rotation.route');
const adminEnlevementRoutes = require('./routes/admin/enlevement.route');
const adminDouaneRoutes = require('./routes/admin/douane.route');
const adminReclamationRoutes = require('./routes/admin/reclamation.route');
const adminFactureRoutes = require('./routes/admin/facture.route');
const adminPaiementRoutes = require('./routes/admin/paiement.route');
const adminParametreRoutes = require('./routes/admin/parametre.route');
const adminActivityLogRoutes = require('./routes/admin/activityLog.route');

const app = express();

app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';

// F-02 : Helmet avec CSP personnalisée + HSTS explicite
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // unsafe-inline restreint à dev (Swagger UI) ; en prod on n'expose pas l'UI Swagger
        scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        styleSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 an
      includeSubDomains: true,
      preload: true,
    },
  })
);
app.use(cors(corsConfig));

// LOW-03 : X-Request-ID pour le tracing distribué
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// PERF-01 : compression gzip/brotli
app.use(compression());

app.use(globalRateLimit);

// Logger HTTP structuré avec Request ID
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
});

// R-02 : Swagger UI désactivé en production
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// LOW-08 : health check
app.get('/health', (req, res) =>
  res.json({ success: true, message: 'Yobnate Express API opérationnelle' })
);

// Routes publiques (aucune authentification)
app.use('/auth', authRoutes);
app.use('/public', publicRoutes);

// Espace client
app.use('/client/colis', clientColisRoutes);
app.use('/client/profil', clientProfilRoutes);
app.use('/client/notifications', clientNotificationRoutes);
app.use('/client/paiements', clientPaiementRoutes);
app.use('/client/enlevements', clientEnlevementRoutes);
app.use('/client/adresses', clientAdresseRoutes);
app.use('/client/reclamations', clientReclamationRoutes);

// Back-office
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/admin/personnel', adminPersonnelRoutes);
app.use('/admin/admins', adminAdminRoutes);
app.use('/admin/colis', adminColisRoutes);
app.use('/admin/villes', adminVilleRoutes);
app.use('/admin/zones', adminZoneRoutes);
app.use('/admin/points-collecte', adminPointCollecteRoutes);
app.use('/admin/services', adminServiceExpeditionRoutes);
app.use('/admin/tarifs', adminTarifRoutes);
app.use('/admin/surcharges', adminSurchargeRoutes);
app.use('/admin/jours-feries', adminJourFerieRoutes);
app.use('/admin/rotations', adminRotationRoutes);
app.use('/admin/enlevements', adminEnlevementRoutes);
app.use('/admin/douane', adminDouaneRoutes);
app.use('/admin/reclamations', adminReclamationRoutes);
app.use('/admin/factures', adminFactureRoutes);
app.use('/admin/paiements', adminPaiementRoutes);
app.use('/admin/parametres', adminParametreRoutes);
app.use('/admin/activity-logs', adminActivityLogRoutes);

// R-04 : Gestionnaire d'erreurs global — DERNIER middleware
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route introuvable' }));
app.use(errorMiddleware);

module.exports = app;
