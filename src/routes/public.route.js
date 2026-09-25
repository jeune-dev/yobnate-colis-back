const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../controllers/public/public.controller');
const validate = require('../middlewares/validate.middleware');
const { devisSchema } = require('../validations/colis.validation');
const { rechercheGeoSchema } = require('../validations/pointCollecte.validation');
const { referenceParam, pays } = require('../validations/shared');
const { CATEGORIES_COLIS } = require('../constants/colis');
const { MODES_TRANSPORT, EMPLACEMENTS_ANNONCE } = require('../constants/reseau');

const zoneQuery = Joi.object({
  pays,
  codePostal: Joi.string().pattern(/^\d{2,5}$/),
  villeId: Joi.string().uuid(),
  emplacement: Joi.string().valid(...EMPLACEMENTS_ANNONCE),
});
const tarifsQuery = Joi.object({
  categorie: Joi.string().valid(...CATEGORIES_COLIS),
  modeTransport: Joi.string().valid(...MODES_TRANSPORT),
  paysDepart: pays,
  paysArrivee: pays,
});
const emballagesQuery = Joi.object({
  categorie: Joi.string().valid(...CATEGORIES_COLIS),
  type: Joi.string().valid('contenant', 'prestation'),
});

/**
 * Points d'accès publics, sans authentification : suivi d'une expédition,
 * recherche de points de collecte, catalogue de services et simulation de devis.
 */

router.get('/suivi/:reference', validate(referenceParam, 'params'), ctrl.suivi);
router.get('/points-collecte', validate(rechercheGeoSchema, 'query'), ctrl.points);
router.get('/services', ctrl.services);
router.get('/villes', ctrl.villes);
router.post('/devis', validate(devisSchema), ctrl.devis);
router.get('/desabonnement/:jeton', ctrl.desabonner);

// Site vitrine et accueil de l'application
router.get('/configuration', ctrl.configuration);
router.get('/categories', ctrl.categories);
router.get('/accueil', validate(zoneQuery, 'query'), ctrl.accueil);
router.get('/tournees-collecte', validate(zoneQuery, 'query'), ctrl.tournees);
router.get('/tarifs', validate(tarifsQuery, 'query'), ctrl.tarifs);
router.get('/emballages', validate(emballagesQuery, 'query'), ctrl.emballages);

module.exports = router;
