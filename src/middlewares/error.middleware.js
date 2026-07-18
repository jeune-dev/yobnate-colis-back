const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } = require('sequelize');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route introuvable : ${req.method} ${req.originalUrl}`));
};

const errorMiddleware = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erreur interne du serveur';
  let errors = err.errors || null;

  if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    message = 'Cette ressource existe déjà';
    errors = err.errors?.map((e) => e.message);
  } else if (err instanceof ForeignKeyConstraintError) {
    statusCode = 400;
    message = 'Référence invalide vers une ressource liée';
  } else if (err instanceof ValidationError) {
    statusCode = 400;
    message = 'Données invalides';
    errors = err.errors?.map((e) => e.message);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token invalide ou expiré';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error(err.stack || err.message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 ? { stack: err.stack } : {})
  });
};

module.exports = { errorMiddleware, notFoundHandler };
