const Joi = require('joi');
const { SOURCES, STATUTS } = require('../../../models/demandeContact.model');

/** Dépôt depuis le formulaire public d'un site vitrine. */
const deposerDemandeSchema = Joi.object({
  source: Joi.string()
    .valid(...SOURCES)
    .default('rek'),
  prenom: Joi.string().trim().min(1).max(80).required(),
  nom: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(150).required(),
  // Saisie libre (« numéro de téléphone ou WhatsApp ») : on borne sans imposer un pays
  telephone: Joi.string()
    .trim()
    .pattern(/^[0-9+().\s-]{6,30}$/)
    .allow('', null)
    .messages({ 'string.pattern.base': 'Numéro de téléphone invalide' }),
  sujet: Joi.string().trim().max(150).allow('', null),
  message: Joi.string().trim().min(5).max(3000).required(),
});

const listerDemandesQuery = Joi.object({
  statut: Joi.string().valid(...STATUTS),
  source: Joi.string().valid(...SOURCES),
  q: Joi.string().trim().max(100),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

/** Réponse de l'administrateur : objet et corps de l'email envoyé au demandeur. */
const traiterDemandeSchema = Joi.object({
  objet: Joi.string().trim().min(3).max(200).required(),
  reponse: Joi.string().trim().min(2).max(5000).required(),
});

module.exports = { deposerDemandeSchema, listerDemandesQuery, traiterDemandeSchema };
