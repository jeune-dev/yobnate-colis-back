const router = require('express').Router();
const ctrl = require('../controller/compte.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { mutationRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { supprimerCompteSchema } = require('../validation/compte.validation');

router.use(auth, checkActiveUser);

// RGPD art. 20 : export des données personnelles
router.get('/export', mutationRateLimit, ctrl.exporter);
// RGPD art. 17 : suppression du compte (mot de passe redemandé)
router.delete('/', mutationRateLimit, validate(supprimerCompteSchema), ctrl.supprimer);

module.exports = router;
