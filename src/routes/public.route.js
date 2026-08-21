const router = require('express').Router();
const ctrl = require('../controllers/public/public.controller');
const validate = require('../middlewares/validate.middleware');
const { devisSchema } = require('../validations/colis.validation');
const { rechercheGeoSchema } = require('../validations/pointCollecte.validation');
const { referenceParam } = require('../validations/shared');

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

module.exports = router;
