const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression'); // PERF-01 : compression gzip
const { randomUUID } = require('crypto');

const { corsConfig } = require('./config/security');
const logger = require('./config/logger');
const { globalRateLimit } = require('./middlewares/rateLimit.middleware');
const { errorMiddleware, notFoundHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./routes/auth.route');
const clientColisRoutes = require('./routes/client/colis.route');
const clientProfilRoutes = require('./routes/client/profil.route');
const clientNotificationRoutes = require('./routes/client/notification.route');
const clientPaiementRoutes = require('./routes/client/paiement.route');
const adminDashboardRoutes = require('./routes/admin/dashboard.route');
const adminUserRoutes = require('./routes/admin/user.route');
const adminAdminRoutes = require('./routes/admin/admin.route');
const adminColisRoutes = require('./routes/admin/colis.route');
const adminVilleRoutes = require('./routes/admin/ville.route');
const adminTarifRoutes = require('./routes/admin/tarif.route');
const adminFactureRoutes = require('./routes/admin/facture.route');
const adminPaiementRoutes = require('./routes/admin/paiement.route');
const adminActivityLogRoutes = require('./routes/admin/activityLog.route');

const app = express();

app.set('trust proxy', 1);

// F-02 : Helmet avec CSP personnalisée + HSTS explicite
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // requis pour Swagger UI en dev
      styleSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:    ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc:["'self'"],
      fontSrc:   ["'self'"],
      objectSrc: ["'none'"],
      frameSrc:  ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,        // 1 an
    includeSubDomains: true,
    preload: true,
  },
}));
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
app.get('/health', (req, res) => res.json({ success: true, message: 'Yobnate Colis API opérationnelle' }));

// Routes
app.use('/auth', authRoutes);
app.use('/client/colis', clientColisRoutes);
app.use('/client/profil', clientProfilRoutes);
app.use('/client/notifications', clientNotificationRoutes);
app.use('/client/paiements', clientPaiementRoutes);
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/admin/admins', adminAdminRoutes);
app.use('/admin/colis', adminColisRoutes);
app.use('/admin/villes', adminVilleRoutes);
app.use('/admin/tarifs', adminTarifRoutes);
app.use('/admin/factures', adminFactureRoutes);
app.use('/admin/paiements', adminPaiementRoutes);
app.use('/admin/activity-logs', adminActivityLogRoutes);

// R-04 : Gestionnaire d'erreurs global — DERNIER middleware
app.use(notFoundHandler);
app.use(errorMiddleware);

module.exports = app;
