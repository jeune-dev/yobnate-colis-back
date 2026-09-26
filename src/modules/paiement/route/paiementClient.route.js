const router = require('express').Router();
const ctrl = require('../controller/paiementClient.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { uuidParam } = require('../../../validations/common');

/** Factures et règlements du client connecté. */
router.use(auth, checkActiveUser);

router.get('/factures', ctrl.getMesFactures);
router.get('/factures/:id', validate(uuidParam, 'params'), ctrl.getFacture);
router.get('/factures/:id/document', validate(uuidParam, 'params'), ctrl.document);
router.get('/', ctrl.getMesPaiements);
router.get('/encours', ctrl.getEncours);
router.get('/methodes', ctrl.methodes);

module.exports = router;
