const Joi = require('joi');
const { phone, password, pays } = require('../../../validations/common');

const createAdminSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().trim().lowercase().email().max(150).required(),
  telephone: phone.required(),
  password: password.required(),
  role: Joi.string().valid('admin', 'super_admin').default('admin'),
});

const updateAdminSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone,
  role: Joi.string().valid('admin', 'super_admin'),
  isActive: Joi.boolean(),
}).min(1);

const conditionsCommercialesSchema = Joi.object({
  remiseContractuelle: Joi.number().min(0).max(100),
  paiementDiffereAutorise: Joi.boolean(),
  plafondEncours: Joi.number().min(0).allow(null),
  // NINEA ou Kbis contrôlé : ouvre droit au tarif préférentiel professionnel
  justificatifProValide: Joi.boolean(),
}).min(1);

const createPersonnelSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().trim().lowercase().email().max(150).required(),
  telephone: phone.required(),
  password: password.required(),
  role: Joi.string().valid('coursier', 'agent_point').required(),
  pays: pays.required(),
  pointCollecteId: Joi.string().uuid().when('role', { is: 'agent_point', then: Joi.required() }),
});

const updatePersonnelSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone,
  pays: pays,
  pointCollecteId: Joi.string().uuid().allow(null),
  isActive: Joi.boolean(),
}).min(1);

module.exports = {
  createAdminSchema,
  updateAdminSchema,
  conditionsCommercialesSchema,
  createPersonnelSchema,
  updatePersonnelSchema,
};
