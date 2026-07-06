require('dotenv').config();

// C-03 : bloquer le démarrage si JWT_SECRET manquant ou trop court
const _jwtSecret        = process.env.JWT_SECRET;
const _jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

if (!_jwtSecret || _jwtSecret.length < 32) {
  throw new Error('[SECURITY] JWT_SECRET manquant ou inférieur à 32 caractères — démarrage bloqué.');
}
if (!_jwtRefreshSecret || _jwtRefreshSecret.length < 32) {
  throw new Error('[SECURITY] JWT_REFRESH_SECRET manquant ou inférieur à 32 caractères — démarrage bloqué.');
}

/**
 * Configuration JWT
 */
const jwtConfig = {
  secret: _jwtSecret,
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshSecret: _jwtRefreshSecret,
  refreshExpiresIn: '7d'
};

// LOW-01 : saltRounds augmenté à 12 (recommandé 2025 pour systèmes financiers)
const bcryptConfig = {
  saltRounds: 12
};

// MED-02 : politique de mot de passe renforcée
const passwordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

// En développement, on désactive le rate limiting pour ne pas bloquer les tests
// (un dashboard fait naturellement beaucoup de requêtes, doublées par React StrictMode).
const _skipEnDev = () => process.env.NODE_ENV !== 'production';


// Rate Limiting global — configurable via RATE_LIMIT_MAX (défaut 1000 / 15 min / IP en prod)
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer dans 15 minutes.' }
};

// Rate Limiting spécifique auth/OTP — strict en prod (anti brute-force), désactivé en dev
const authRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: _skipEnDev,
  message: { success: false, message: 'Trop de tentatives, veuillez réessayer dans 15 minutes.' }
};

// CORS sécurisé
const corsConfig = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true
};

//Cookies (si refresh token)

const cookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
};


/**
 * Upload fichiers (PDF / Signature)
 */
const uploadConfig = {
  maxFileSize: 5 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg']
};

/**
 * Chiffrement & Hash
 */
const cryptoConfig = {
  hashAlgorithm: 'sha256',
  encoding: 'hex'
};

module.exports = {
  jwtConfig,
  bcryptConfig,
  passwordPolicy,
  rateLimitConfig,
  authRateLimitConfig,
  corsConfig,
  cookieConfig,
  uploadConfig,
  cryptoConfig
};
