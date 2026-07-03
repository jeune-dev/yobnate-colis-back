const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');

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
app.use(helmet());
app.use(cors(corsConfig));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(globalRateLimit);

app.get('/health', (req, res) => res.json({ success: true, message: 'Yobnate Colis API opérationnelle' }));

const apiPrefix = process.env.API_PREFIX || '/api';
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/client/colis`, clientColisRoutes);
app.use(`${apiPrefix}/client/profil`, clientProfilRoutes);
app.use(`${apiPrefix}/client/notifications`, clientNotificationRoutes);
app.use(`${apiPrefix}/client/paiements`, clientPaiementRoutes);
app.use(`${apiPrefix}/admin/dashboard`, adminDashboardRoutes);
app.use(`${apiPrefix}/admin/users`, adminUserRoutes);
app.use(`${apiPrefix}/admin/admins`, adminAdminRoutes);
app.use(`${apiPrefix}/admin/colis`, adminColisRoutes);
app.use(`${apiPrefix}/admin/villes`, adminVilleRoutes);
app.use(`${apiPrefix}/admin/tarifs`, adminTarifRoutes);
app.use(`${apiPrefix}/admin/factures`, adminFactureRoutes);
app.use(`${apiPrefix}/admin/paiements`, adminPaiementRoutes);
app.use(`${apiPrefix}/admin/activity-logs`, adminActivityLogRoutes);

app.use(notFoundHandler);
app.use(errorMiddleware);

module.exports = app;
