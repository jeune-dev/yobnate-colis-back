'use strict';
const { AppError } = require('../errors/AppError');
const logger = require('../config/logger');

// Évalué à chaque appel et non à l'import : NODE_ENV peut être positionné
// après le chargement du module (tests, scripts), et une constante figée
// désactiverait silencieusement le masquage des messages en production.
const enProd = () => process.env.NODE_ENV === 'production';

// ── RÉDACTION DES DONNÉES SENSIBLES ─────────────────────────────────────────
const CHAMPS_SENSIBLES = [
  'password',
  'oldPassword',
  'newPassword',
  'token',
  'refreshToken',
  'code',
  'otp',
  'apiKey',
  'secret',
  'pin',
  'cvv',
  'cardNumber',
];

function redactBody(body) {
  if (!body || typeof body !== 'object') return body;

  const clean = Object.assign({}, body);
  for (const key of Object.keys(clean)) {
    if (CHAMPS_SENSIBLES.some((champ) => key.toLowerCase().includes(champ))) {
      clean[key] = '[REDACTED]';
    }
  }
  return clean;
}

const errorMiddleware = (err, req, res, _next) => {
  logger.error(err.message, {
    name: err.name,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack,
    body: redactBody(req.body),
  });

  if (err instanceof AppError && err.isOperational) {
    const body = { success: false, message: err.message };
    if (err.details && err.details.length) body.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // Joi : validate.middleware.js propage l'erreur brute via next(err).
  // Sans cette branche, toute validation échouée ressortirait en 500.
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: 'Données invalides',
      ...(enProd() ? {} : { details: err.details?.map((d) => d.message.replace(/"/g, '')) }),
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expiré' });
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }

  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (taille maximale dépassée)'
        : "Erreur lors de l'envoi du fichier";
    return res.status(400).json({ success: false, message });
  }

  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: 'Corps de requête JSON invalide' });
  }

  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Corps de la requête trop volumineux' });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(422).json({
      success: false,
      message: 'Données invalides',
      ...(enProd() ? {} : { details: err.errors?.map((e) => e.message) }),
    });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ success: false, message: 'Cette ressource existe déjà' });
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res
      .status(400)
      .json({ success: false, message: 'Référence invalide vers une ressource liée' });
  }
  if (
    [
      'SequelizeConnectionError',
      'SequelizeConnectionRefusedError',
      'SequelizeConnectionTimedOutError',
      'SequelizeTimeoutError',
    ].includes(err.name)
  ) {
    return res.status(503).json({ success: false, message: 'Service temporairement indisponible' });
  }

  // Erreurs portant leur propre statut (http-errors, Express, librairies tierces).
  const statutPorte = Number(err.status || err.statusCode);
  if (Number.isInteger(statutPorte) && statutPorte >= 400 && statutPorte <= 599) {
    // Un message de 5xx peut exposer des détails internes : on le masque en prod.
    const masque = enProd() && statutPorte >= 500;
    return res.status(statutPorte).json({
      success: false,
      message: masque ? 'Erreur interne du serveur' : err.message || 'Erreur interne du serveur',
    });
  }

  const message = enProd()
    ? 'Erreur interne du serveur'
    : err.message || 'Erreur interne du serveur';
  return res.status(500).json({ success: false, message });
};

module.exports = errorMiddleware;
