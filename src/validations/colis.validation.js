const Joi = require('joi');

const phone = Joi.string().pattern(/^\+?[0-9]{8,15}$/).message('Numéro de téléphone invalide');
const uuid = Joi.string().uuid();

const createColisSchema = Joi.object({
  expediteurNom: Joi.string().min(2).max(100).required(),
  expediteurTelephone: phone.required(),
  villeDepartId: uuid.required(),
  destinataireNom: Joi.string().min(2).max(100).required(),
  destinataireTelephone: phone.required(),
  villeArriveeId: uuid.required(),
  adresseLivraison: Joi.string().min(5).max(255).required(),
  description: Joi.string().max(255).allow('', null),
  typeColis: Joi.string().valid('standard', 'express', 'fragile').default('standard'),
  poids: Joi.number().positive().precision(2).max(9999).required(),
  valeurDeclaree: Joi.number().min(0).precision(2).allow(null)
});

const updateColisSchema = Joi.object({
  expediteurNom: Joi.string().min(2).max(100),
  expediteurTelephone: phone,
  destinataireNom: Joi.string().min(2).max(100),
  destinataireTelephone: phone,
  adresseLivraison: Joi.string().min(5).max(255),
  description: Joi.string().max(255).allow('', null),
  typeColis: Joi.string().valid('standard', 'express', 'fragile'),
  poids: Joi.number().positive().precision(2).max(9999),
  valeurDeclaree: Joi.number().min(0).precision(2).allow(null)
}).min(1);

const updateStatutColisSchema = Joi.object({
  statut: Joi.string()
    .valid('en_attente', 'en_preparation', 'en_transit', 'arrive', 'recupere', 'livre', 'annule')
    .required(),
  localisation: Joi.string().max(150).allow('', null),
  commentaire: Joi.string().max(255).allow('', null),
  annuleMotif: Joi.string().max(255).allow('', null)
});

module.exports = { createColisSchema, updateColisSchema, updateStatutColisSchema };
