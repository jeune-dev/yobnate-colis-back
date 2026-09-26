const Joi = require('joi');

/** Inventaire imprimable : par conteneur (rotation) ou par tournée de collecte. */
const inventaireQuery = Joi.object({
  rotationId: Joi.string().uuid(),
  tourneeCollecteId: Joi.string().uuid(),
  format: Joi.string().valid('json', 'csv', 'html').default('json'),
}).or('rotationId', 'tourneeCollecteId');

module.exports = { inventaireQuery };
