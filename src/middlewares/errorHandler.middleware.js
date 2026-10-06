'use strict';
const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');
const masquerUrl = require('../utils/masquerUrl');

/**
 * Gestionnaire d'erreurs global — DERNIER middleware.
 *
 * Toute erreur est traduite en `{ success: false, message, details?, requestId }`
 * avec le bon code HTTP. Jamais de pile, de SQL ni de message interne au client
 * en production. Côté journaux (comme Widjila) :
 * - 4xx : `warn`, sans pile, avec les seuls NOMS des champs reçus (aucune donnée
 *   personnelle dans les logs pour une simple erreur de saisie) ;
 * - 5xx : `error`, avec la pile et le corps expurgé des secrets.
 */

// Évalué à chaque appel : NODE_ENV peut être positionné après le chargement (tests, scripts)
const enProd = () => process.env.NODE_ENV === 'production';

const CHAMPS_SENSIBLES = [
  'password',
  'token',
  'code',
  'otp',
  'apikey',
  'secret',
  'pin',
  'cvv',
  'cardnumber',
];

const expurger = (body) => {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([cle, valeur]) => [
      cle,
      CHAMPS_SENSIBLES.some((champ) => cle.toLowerCase().includes(champ)) ? '[REDACTED]' : valeur,
    ])
  );
};

const MESSAGE_INTERNE = 'Erreur interne du serveur';
const ERREURS_CONNEXION_BASE = [
  'SequelizeConnectionError',
  'SequelizeConnectionRefusedError',
  'SequelizeConnectionTimedOutError',
  'SequelizeTimeoutError',
  'SequelizeConnectionAcquireTimeoutError',
];
/**
 * Codes SQLSTATE d'une valeur mal formée : 22P02 (ENUM, UUID, entier), 22001 (texte
 * trop long), 22003 (nombre hors limites), 22007 / 22008 (date invalide).
 */
const CODES_SAISIE_INVALIDE = new Set(['22P02', '22001', '22003', '22007', '22008']);

/** Traduit une erreur en statut HTTP et corps de réponse. */
const traduire = (err) => {
  if (err instanceof AppError && err.isOperational) {
    const corps = { message: err.message };
    if (err.details && err.details.length) corps.details = err.details;
    // Code métier lisible par l'application (ex : EMAIL_NON_CONFIRME) et ses données
    if (err.codeMetier) corps.code = err.codeMetier;
    if (err.donnees) Object.assign(corps, err.donnees);
    return [err.statusCode, corps];
  }

  // Joi (validate.middleware) : le détail par champ ne révèle que le contrat de l'API
  if (err.isJoi) {
    return [
      400,
      {
        message: 'Données invalides',
        details: err.details?.map((d) => d.message.replace(/"/g, '')),
      },
    ];
  }

  if (err.name === 'TokenExpiredError') return [401, { message: 'Token expiré' }];
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return [401, { message: 'Token invalide' }];
  }

  if (err.name === 'MulterError') {
    return [
      400,
      {
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Fichier trop volumineux (taille maximale dépassée)'
            : "Erreur lors de l'envoi du fichier",
      },
    ];
  }

  if (err.type === 'entity.parse.failed')
    return [400, { message: 'Corps de requête JSON invalide' }];
  if (err.type === 'entity.too.large')
    return [413, { message: 'Corps de la requête trop volumineux' }];

  if (err.name === 'SequelizeValidationError') {
    return [
      422,
      {
        message: 'Données invalides',
        // En production, seul le nom du champ refusé est exposé (contrat de l'API,
        // comme pour Joi) : le client sait quoi corriger au lieu d'un message muet
        details: enProd()
          ? [...new Set((err.errors || []).map((e) => `Champ « ${e.path} » refusé`))]
          : err.errors?.map((e) => e.message),
      },
    ];
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return [409, { message: 'Cette ressource existe déjà' }];
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return [400, { message: 'Référence invalide vers une ressource liée' }];
  }
  // Valeur refusée par PostgreSQL (filtre hors liste, identifiant mal formé, date ou
  // nombre invalide, texte trop long) : erreur de saisie, pas une panne du serveur
  if (err.name === 'SequelizeDatabaseError' && CODES_SAISIE_INVALIDE.has(err.parent?.code)) {
    return [400, { message: 'Paramètre invalide' }];
  }
  // Base injoignable, pool saturé, ou requête annulée par statement_timeout (57014)
  if (ERREURS_CONNEXION_BASE.includes(err.name) || err.parent?.code === '57014') {
    return [503, { message: 'Service temporairement indisponible' }];
  }

  // Erreurs portant leur propre statut (Express, librairies tierces)
  const statutPorte = Number(err.status || err.statusCode);
  if (Number.isInteger(statutPorte) && statutPorte >= 400 && statutPorte <= 599) {
    const masque = enProd() && statutPorte >= 500;
    return [statutPorte, { message: masque ? MESSAGE_INTERNE : err.message || MESSAGE_INTERNE }];
  }

  return [500, { message: enProd() ? MESSAGE_INTERNE : err.message || MESSAGE_INTERNE }];
};

const errorHandler = (err, req, res, _next) => {
  const [statut, corps] = traduire(err);

  const contexte = {
    requestId: req.requestId,
    statut,
    nom: err.name,
    methode: req.method,
    chemin: masquerUrl(req.originalUrl || req.path),
    utilisateur: req.user?.id,
  };
  if (statut >= 500) {
    logger.error(err.message, { ...contexte, stack: err.stack, body: expurger(req.body) });
  } else {
    const champs = req.body && typeof req.body === 'object' ? Object.keys(req.body) : undefined;
    logger.warn(err.message, { ...contexte, champs });
  }

  return res.status(statut).json({ success: false, ...corps, requestId: req.requestId });
};

module.exports = errorHandler;
