const Joi = require('joi');
const { phone, email, nomPersonne, password, pays } = require('../../../validations/common');

const registerSchema = Joi.object({
  nom: nomPersonne('nom').required(),
  prenom: nomPersonne('prénom').required(),
  email: email.required(),
  telephone: phone
    .required()
    .messages({ 'any.required': 'Le numéro de téléphone est obligatoire' }),
  password: password.required(),
  pays: pays.default('SN'),
  villeId: Joi.string().uuid(),
  adresse: Joi.string().max(255).allow('', null),
  typeCompte: Joi.string().valid('particulier', 'entreprise').default('particulier'),
  raisonSociale: Joi.string()
    .trim()
    .max(150)
    .when('typeCompte', { is: 'entreprise', then: Joi.required() })
    .messages({ 'any.required': 'La raison sociale est requise pour un compte entreprise' }),
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
  password: Joi.string().max(128).required(),
})
  .or('identifiant', 'email', 'telephone')
  .messages({ 'object.missing': 'Indiquez votre email ou votre numéro de téléphone' });

/** Confirmation de l'adresse email : code à 6 chiffres reçu à l'inscription. */
const verifierEmailSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  code: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.empty': 'Saisissez le code reçu par email.',
      'any.required': 'Saisissez le code reçu par email.',
      'string.pattern.base': 'Le code comporte 6 chiffres.',
    }),
});

const renvoyerVerificationSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().max(512),
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
  oldPassword: Joi.string().max(128).required(),
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
