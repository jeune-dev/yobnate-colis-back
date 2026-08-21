// ─────────────────────────────────────────────────────────────
// middlewares/validate.middleware.js — Validation Joi centralisée
// Propage l'erreur Joi brute au gestionnaire d'erreurs global via next(err)
// pour garantir un format de réponse uniforme (voir error.middleware.js).
// ─────────────────────────────────────────────────────────────
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) return next(error);

    req[source] = value;
    next();
  };

module.exports = validate;
