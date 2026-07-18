const rateLimit = require('express-rate-limit');
const { rateLimitConfig, authRateLimitConfig } = require('../config/security');

const _skipEnDev = () => process.env.NODE_ENV !== 'production';

const globalRateLimit = rateLimit(rateLimitConfig);
const authRateLimit   = rateLimit(authRateLimitConfig);

// 3 envois d'OTP / 15 min par email — anti-spam emails de reset
const otpEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => (req.body?.email || req.ip),
  message: { success: false, message: 'Trop de codes envoyés à cet email. Réessayez dans 15 minutes.' },
});

// 300 req / 15 min par userId — endpoints authentifiés courants
const authenticatedRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Limite de requêtes atteinte. Réessayez dans 15 minutes.' },
});

module.exports = { globalRateLimit, authRateLimit, otpEmailRateLimit, authenticatedRateLimit };
