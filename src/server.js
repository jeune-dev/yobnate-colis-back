require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/db');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Connexion à la base de données établie.');

    app.listen(PORT, () => {
      logger.info(`Serveur Yobnate Colis démarré sur le port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Échec du démarrage du serveur : ${err.message}`);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.stack || err.message}`);
  process.exit(1);
});

start();
