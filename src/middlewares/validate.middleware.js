const logger = require('../utils/logger');
const masquerUrl = require('../utils/masquerUrl');

/**
 * Validation Joi centralisée.
 *
 * - `stripUnknown` retire les champs non prévus (protection contre l'assignation
 *   de masse) ; comme dans Widjila, chaque champ retiré est JOURNALISÉ : une
 *   faute de nom côté client (`motif` au lieu de `raison`) ne passe plus en
 *   silence, elle apparaît dans les logs ;
 * - l'erreur Joi est propagée telle quelle au gestionnaire global, qui répond 400 ;
 * - le schéma et sa source sont exposés sur le middleware (`schema`, `source`)
 *   pour la documentation OpenAPI générée à partir des routes.
 */
const CLES_IGNOREES = new Set(['_', '__proto__']);

const signalerChampsIgnores = (source, recu, valide, req) => {
  if (!recu || typeof recu !== 'object' || Array.isArray(recu)) return;
  const retires = Object.keys(recu).filter(
    (cle) => !CLES_IGNOREES.has(cle) && !(cle in (valide || {}))
  );
  if (!retires.length) return;
  logger.warn('validation : champ(s) ignoré(s), absent(s) du schéma', {
    route: `${req.method} ${masquerUrl(req.originalUrl)}`,
    source,
    champs: retires,
    requestId: req.requestId,
  });
};

const validate = (schema, source = 'body') => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) return next(error);

    signalerChampsIgnores(source, req[source], value, req);
    req[source] = value;
    next();
  };
  middleware.schema = schema;
  middleware.source = source;
  return middleware;
};

module.exports = validate;
