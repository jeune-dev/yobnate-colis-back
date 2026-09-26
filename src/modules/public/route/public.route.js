const router = require('express').Router();
const ctrl = require('../controller/public.controller');
const validate = require('../../../middlewares/validate.middleware');
const { authRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { devisSchema } = require('../../colis/validation/colis.validation');
const { rechercheGeoSchema } = require('../../pointCollecte/validation/pointCollecte.validation');
const { referenceParam } = require('../../../validations/common');
const {
  zoneQuery,
  tarifsQuery,
  emballagesQuery,
  desabonnementParam,
} = require('../validation/public.validation');

/**
 * Points d'accès publics, sans authentification : suivi d'une expédition,
 * recherche de points de collecte, catalogue de services et simulation de devis.
 * Chacun est déclaré et justifié dans tests/security/routes.gardes.test.js.
 */

// Le numéro de suivi suffit à consulter l'avancement : débit limité contre l'énumération
router.get('/suivi/:reference', authRateLimit, validate(referenceParam, 'params'), ctrl.suivi);
router.get('/points-collecte', validate(rechercheGeoSchema, 'query'), ctrl.points);
router.get('/services', ctrl.services);
router.get('/villes', ctrl.villes);
router.post('/devis', validate(devisSchema), ctrl.devis);
router.get('/desabonnement/:jeton', validate(desabonnementParam, 'params'), ctrl.desabonner);

// Site vitrine et accueil de l'application
router.get('/configuration', ctrl.configuration);
router.get('/categories', ctrl.categories);
router.get('/accueil', validate(zoneQuery, 'query'), ctrl.accueil);
router.get('/tournees-collecte', validate(zoneQuery, 'query'), ctrl.tournees);
router.get('/tarifs', validate(tarifsQuery, 'query'), ctrl.tarifs);
router.get('/emballages', validate(emballagesQuery, 'query'), ctrl.emballages);

module.exports = router;
