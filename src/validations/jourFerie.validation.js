const Joi = require('joi');
const { pays, dateISO } = require('./shared');

const createJourFerieSchema = Joi.object({
  date: dateISO.required(),
  pays: pays.required(),
  libelle: Joi.string().min(2).max(100).required(),
  recurrent: Joi.boolean().default(false),
});

const updateJourFerieSchema = Joi.object({
  date: dateISO,
  pays: pays,
  libelle: Joi.string().min(2).max(100),
  recurrent: Joi.boolean(),
}).min(1);

const importerCalendrierSchema = Joi.object({
  jours: Joi.array().items(createJourFerieSchema).min(1).required(),
});

module.exports = { createJourFerieSchema, updateJourFerieSchema, importerCalendrierSchema };
