const { Op } = require('sequelize');
const { TokenBlacklist, RefreshToken, UserOtp } = require('../models');
const logger = require('../utils/logger');

/** Les codes consommés sont gardés un jour (traçabilité d'un incident), puis purgés. */
const RETENTION_OTP_MS = 24 * 60 * 60 * 1000;

/**
 * Purge des jetons et codes expirés (repris de Sign) : liste de révocation,
 * refresh tokens et codes à usage unique grossissent à chaque connexion ou
 * demande de code, sans autre mécanisme de nettoyage.
 */
const cleanupExpiredTokens = async () => {
  const maintenant = new Date();
  const [revocations, refreshTokens, codes] = await Promise.all([
    TokenBlacklist.destroy({ where: { expiresAt: { [Op.lt]: maintenant } } }),
    RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: maintenant } } }),
    UserOtp.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: maintenant } },
          { isUsed: true, createdAt: { [Op.lt]: new Date(Date.now() - RETENTION_OTP_MS) } },
        ],
      },
    }),
  ]);
  if (revocations + refreshTokens + codes > 0) {
    logger.info('Purge des jetons expirés', { revocations, refreshTokens, codes });
  }
  return { revocations, refreshTokens, codes };
};

module.exports = { cleanupExpiredTokens };
