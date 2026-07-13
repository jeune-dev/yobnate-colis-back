const Joi = require('joi');

const phone = Joi.string().pattern(/^\+?[0-9]{8,15}$/).message('Numéro de téléphone invalide');
const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
  .messages({
    'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
    'string.max': 'Le mot de passe ne peut pas dépasser 72 caractères',
    'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial'
  });

const createAdminSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  prenom: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().max(150).required(),
  telephone: phone.required(),
  password: password.required(),
  role: Joi.string().valid('admin', 'super_admin').default('admin')
});

const updateAdminSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone,
  role: Joi.string().valid('admin', 'super_admin'),
  isActive: Joi.boolean()
}).min(1);

const updateProfilSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone
}).min(1);

module.exports = { createAdminSchema, updateAdminSchema, updateProfilSchema };
