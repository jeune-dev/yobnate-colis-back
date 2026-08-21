const Joi = require('joi');
const { phone, password, pays } = require('./shared');

const createAdminSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().max(150).required(),
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

const updateProfilSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone,
  adresse: Joi.string().max(255).allow('', null),
  villeId: Joi.string().uuid().allow(null),
  raisonSociale: Joi.string().max(150).allow('', null),
  numeroIdentificationFiscale: Joi.string().max(30).allow('', null),
  numeroTvaIntracom: Joi.string().max(20).allow('', null),
  langue: Joi.string().valid('fr'),
}).min(1);

const updatePreferencesSchema = Joi.object({
  notificationsEmail: Joi.boolean(),
  notificationsSms: Joi.boolean(),
}).min(1);

const conditionsCommercialesSchema = Joi.object({
  remiseContractuelle: Joi.number().min(0).max(100),
  paiementDiffereAutorise: Joi.boolean(),
  plafondEncours: Joi.number().min(0).allow(null),
}).min(1);

const createPersonnelSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().max(150).required(),
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
  updateProfilSchema,
  updatePreferencesSchema,
  conditionsCommercialesSchema,
  createPersonnelSchema,
  updatePersonnelSchema,
};
