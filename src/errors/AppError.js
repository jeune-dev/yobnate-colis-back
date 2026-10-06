'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Requête invalide', details = []) {
    super(message, 400);
    this.details = details;
  }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Non authentifié') {
    super(message, 401);
  }
}
class ForbiddenError extends AppError {
  /**
   * @param {string} [codeMetier] code renvoyé au client (`code`) pour qu'il réagisse
   *   autrement qu'en affichant le message (ex : EMAIL_NON_CONFIRME)
   * @param {object} [donnees] champs ajoutés à la réponse (ex : { email })
   */
  constructor(message = 'Accès refusé', codeMetier = null, donnees = null) {
    super(message, 403);
    this.codeMetier = codeMetier;
    this.donnees = donnees;
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable') {
    super(message, 404);
  }
}
class ConflictError extends AppError {
  constructor(message = 'Cette ressource existe déjà') {
    super(message, 409);
  }
}
class ValidationError extends AppError {
  constructor(message = 'Données invalides', details = []) {
    super(message, 422);
    this.details = details;
  }
}

/** Dépendance externe indisponible ou non configurée (canal d'envoi, prestataire). */
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporairement indisponible') {
    super(message, 503);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
};
