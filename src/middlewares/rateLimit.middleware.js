const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { rateLimitConfig, authRateLimitConfig } = require('../config/security');
const redis = require('../config/redis');

const _skipEnDev = () => process.env.NODE_ENV !== 'production';

/**
 * Store des compteurs : Redis partagé entre les processus quand il est
 * configuré, mémoire sinon. `passOnStoreError` laisse passer les requêtes si
 * Redis tombe : une panne du cache ne doit pas rendre l'API indisponible.
 */
const store = (prefixe) =>
  redis
    ? new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix: `rl:${prefixe}:` })
    : undefined;

const limiteur = (prefixe, options) =>
  rateLimit({ passOnStoreError: true, store: store(prefixe), ...options });

const globalRateLimit = limiteur('global', rateLimitConfig);
const authRateLimit = limiteur('auth', authRateLimitConfig);

// 3 envois d'OTP / 15 min par email — anti-spam emails de reset
const otpEmailRateLimit = limiteur('otp', {
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => String(req.body?.email || req.ip).toLowerCase(),
  message: {
    success: false,
    message: 'Trop de codes envoyés à cet email. Réessayez dans 15 minutes.',
  },
});

// Mutations sensibles d'un compte connecté (mot de passe, suppression, export) — repris de Sign
const mutationRateLimit = limiteur('mutation', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de modifications. Réessayez dans 15 minutes.' },
});

// Envoi d'un code de vérification au compte connecté (par compte, pas par IP :
// de nombreux clients mobiles partagent une même IP d'opérateur)
const envoiCodeRateLimit = limiteur('code', {
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de codes demandés. Réessayez dans 15 minutes.' },
});

// Formulaire public de demande de suppression de compte : ouvert à Internet
const demandePubliqueRateLimit = limiteur('demande', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  message: { success: false, message: 'Trop de demandes. Réessayez dans une heure.' },
});

module.exports = {
  globalRateLimit,
  authRateLimit,
  otpEmailRateLimit,
  mutationRateLimit,
  envoiCodeRateLimit,
  demandePubliqueRateLimit,
};
