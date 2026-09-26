const Joi = require('joi');

const version = Joi.string()
  .pattern(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/)
  .messages({ 'string.pattern.base': 'Version invalide, format attendu 1.2.3' });

const plateforme = Joi.string().valid('android', 'ios');

const plateformeQuery = Joi.object({ plateforme: plateforme.default('android') });

const creerVersionSchema = Joi.object({
  plateforme: plateforme.required(),
  derniereVersion: version.required(),
  versionMinimale: version.required(),
  miseAJourForcee: Joi.boolean().default(false),
  titre: Joi.string().trim().max(120),
  message: Joi.string().trim().max(2000).allow('', null),
  lienStore: Joi.string()
    .uri({ scheme: ['https'] })
    .max(255)
    .required(),
  isActive: Joi.boolean().default(true),
});

const modifierVersionSchema = creerVersionSchema
  .fork(['plateforme', 'derniereVersion', 'versionMinimale', 'lienStore'], (s) => s.optional())
  .min(1);

module.exports = { plateformeQuery, creerVersionSchema, modifierVersionSchema };
