const router = require('express').Router();
const ctrl = require('../controller/public.controller');
const validate = require('../../../middlewares/validate.middleware');
const { authRateLimit, mesureRateLimit } = require('../../../middlewares/rateLimit.middleware');
const authOptionnelle = require('../../../middlewares/authOptionnelle.middleware');
const avisCtrl = require('../../avis/controller/avis.controller');
const faqCtrl = require('../../faq/controller/faq.controller');
const { listeAvisPublicQuery } = require('../../avis/validation/avis.validation');
const { visiteSchema } = require('../../mesure/validation/mesure.validation');
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
// Simulation sans compte ; le compte éventuellement connecté sert seulement à la mesure
router.post('/devis', authOptionnelle, validate(devisSchema), ctrl.devis);
router.get('/desabonnement/:jeton', validate(desabonnementParam, 'params'), ctrl.desabonner);

// Site vitrine et accueil de l'application
router.get('/configuration', ctrl.configuration);
router.get('/categories', ctrl.categories);
router.get('/accueil', validate(zoneQuery, 'query'), ctrl.accueil);
router.get('/tournees-collecte', validate(zoneQuery, 'query'), ctrl.tournees);
router.get('/tarifs', validate(tarifsQuery, 'query'), ctrl.tarifs);
router.get('/emballages', validate(emballagesQuery, 'query'), ctrl.emballages);
router.get('/avis', validate(listeAvisPublicQuery, 'query'), avisCtrl.publics);
router.get('/faq', faqCtrl.publique);

// Mesure d'audience (trafic, visiteurs connus, temps passé, source) : débit limité
router.post('/visites', mesureRateLimit, authOptionnelle, validate(visiteSchema), ctrl.visite);

module.exports = router;
