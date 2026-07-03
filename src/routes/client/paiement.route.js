const router = require('express').Router();
const paiementController = require('../../controllers/client/paiement.controller');
const auth = require('../../middlewares/auth.middleware');

router.use(auth);

router.get('/factures', paiementController.getMesFactures);
router.get('/factures/:id', paiementController.getFacture);

module.exports = router;
