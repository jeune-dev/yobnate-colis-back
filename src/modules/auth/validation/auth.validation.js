const Joi = require('joi');
const { phone, password, pays } = require('../../../validations/common');

const registerSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().trim().lowercase().email().max(150).required(),
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
  codePostal: Joi.string().max(10).allow('', null),
  // Code personnel d'un client existant (programme de parrainage)
  codeParrainage: Joi.string().trim().uppercase().max(12).allow('', null),
});

/**
 * Connexion par email ou par numéro de téléphone : `identifiant` accepte l'un ou
 * l'autre ; `email` et `telephone` restent acceptés pour compatibilité.
 */
const loginSchema = Joi.object({
  identifiant: Joi.string().trim().max(150),
  email: Joi.string().trim().lowercase().email(),
  telephone: Joi.string().trim().max(20),
  password: Joi.string().required(),
})
  .or('identifiant', 'email', 'telephone')
  .messages({ 'object.missing': 'Indiquez votre email ou votre numéro de téléphone' });

const verifierEmailSchema = Joi.object({
  token: Joi.string().hex().length(64).required(),
});

const renvoyerVerificationSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
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
  verifierEmailSchema,
  renvoyerVerificationSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
