const router = require('express').Router();
const paiementController = require('../../controllers/admin/paiement.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { recordPaiementSchema } = require('../../validations/paiement.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', paiementController.getAll);
router.get('/:id', paiementController.getOne);
router.post('/factures/:factureId', validate(recordPaiementSchema), paiementController.enregistrer);
router.patch('/:id/rembourser', paiementController.rembourser);

module.exports = router;
