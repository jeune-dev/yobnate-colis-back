const { Op } = require('sequelize');
const { TokenBlacklist, RefreshToken } = require('../models');
const logger = require('../config/logger');

const INTERVAL_MS = 60 * 60 * 1000; // toutes les heures

const purge = async () => {
  const now = new Date();
  const [blacklistCount] = await Promise.all([
    TokenBlacklist.destroy({ where: { expiresAt: { [Op.lt]: now } } }),
    RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: now } } }),
  ]);
  if (blacklistCount > 0) logger.info(`Purge tokens expirés : ${blacklistCount} entrée(s) supprimée(s)`);
};

const startPurgeJob = () => {
  purge().catch((err) => logger.error('Purge tokens : erreur initiale', { message: err.message }));
  setInterval(() => {
    purge().catch((err) => logger.error('Purge tokens : erreur périodique', { message: err.message }));
  }, INTERVAL_MS);
};

module.exports = { startPurgeJob };
