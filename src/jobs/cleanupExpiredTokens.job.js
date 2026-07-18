const cron = require('node-cron');
const { Op } = require('sequelize');
const { RefreshToken, UserOtp, TokenBlacklist } = require('../models');
const logger = require('../config/logger');

// Tous les lundis à minuit
const startCleanupJob = () => {
  cron.schedule('0 0 * * 1', async () => {
    try {
      const now = new Date();

      const [deletedTokens, deletedOtps, deletedBlacklist] = await Promise.all([
        RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: now } } }),
        UserOtp.destroy({ where: { [Op.or]: [{ expiresAt: { [Op.lt]: now } }, { isUsed: true }] } }),
        TokenBlacklist.destroy({ where: { expiresAt: { [Op.lt]: now } } }),
      ]);

      logger.info(`[Cleanup] ${deletedTokens} refresh tokens, ${deletedOtps} OTP, ${deletedBlacklist} blacklist supprimés`);
    } catch (err) {
      logger.error('[Cleanup] Erreur nettoyage tokens :', { message: err.message });
    }
  });

  logger.info('[Cleanup] Job de nettoyage planifié (tous les lundis à minuit)');
};

module.exports = { startCleanupJob };
