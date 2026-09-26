const router = require('express').Router();
const ctrl = require('../controller/avis.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { mutationRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { deposerAvisSchema } = require('../validation/avis.validation');
const { uuidParam } = require('../../../validations/common');

/** Avis du client connecté : dépôt (modéré avant publication), consultation, retrait. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.mesAvis);
router.post('/', mutationRateLimit, validate(deposerAvisSchema), ctrl.deposer);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.supprimerMonAvis);

module.exports = router;
