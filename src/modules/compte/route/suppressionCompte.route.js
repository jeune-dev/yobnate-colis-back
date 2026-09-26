const router = require('express').Router();
const ctrl = require('../controller/compte.controller');
const validate = require('../../../middlewares/validate.middleware');
const { demandePubliqueRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { demandeSuppressionSchema } = require('../validation/compte.validation');

// Public par exigence Google Play : joignable sans connexion ni application installée.
// Compensé par le seuil de débit le plus strict de l'API.
router.post('/', demandePubliqueRateLimit, validate(demandeSuppressionSchema), ctrl.deposerDemande);

module.exports = router;
