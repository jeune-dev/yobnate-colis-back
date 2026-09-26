const Joi = require('joi');
const { PLATEFORMES } = require('../../../models/visite.model');

/** Chaîne libre courte et nettoyée (paramètres UTM, pages, référent). */
const texte = (max) => Joi.string().trim().max(max).allow('', null);

const visiteSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  visiteurId: Joi.string().uuid().required(),
  plateforme: Joi.string()
    .valid(...PLATEFORMES)
    .default('web'),
  /** `page` : nouvelle page vue ; `ping` : présence (mesure du temps passé). */
  evenement: Joi.string().valid('page', 'ping').default('page'),
  page: texte(255),
  referent: texte(500),
  utmSource: texte(80),
  utmMedium: texte(80),
  utmCampagne: texte(120),
});

/** Période des indicateurs du tableau de bord (30 derniers jours par défaut). */
const periodeQuery = Joi.object({
  dateDebut: Joi.date().iso(),
  dateFin: Joi.date().iso().min(Joi.ref('dateDebut')),
});

module.exports = { visiteSchema, periodeQuery };
