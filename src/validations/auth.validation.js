const Joi = require('joi');
const { phone, password, pays } = require('./shared');

const registerSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().max(150).required(),
  telephone: phone.required(),
  password: password.required(),
  pays: pays.default('SN'),
  villeId: Joi.string().uuid(),
  adresse: Joi.string().max(255).allow('', null),
  typeCompte: Joi.string().valid('particulier', 'entreprise').default('particulier'),
  raisonSociale: Joi.string()
    .max(150)
    .when('typeCompte', { is: 'entreprise', then: Joi.required() }),
  numeroIdentificationFiscale: Joi.string().max(30).allow('', null),
  numeroTvaIntracom: Joi.string().max(20).allow('', null),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required(),
  newPassword: password.required(),
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: password.required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
