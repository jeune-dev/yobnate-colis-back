const router = require('express').Router();
const ctrl = require('../controller/demandeContact.controller');
const validate = require('../../../middlewares/validate.middleware');
const { contactPubliqueRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { deposerDemandeSchema } = require('../validation/demandeContact.validation');

// Public par nature : formulaire de contact des sites vitrines, sans compte.
// Compensé par un plafond de débit par IP.
router.post('/', contactPubliqueRateLimit, validate(deposerDemandeSchema), ctrl.deposer);

module.exports = router;
