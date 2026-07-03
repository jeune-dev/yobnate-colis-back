const router = require('express').Router();
const factureController = require('../../controllers/admin/facture.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

router.use(auth, checkActiveUser, admin);

router.get('/', factureController.getAll);
router.get('/:id', factureController.getOne);
router.patch('/:id/annuler', factureController.annuler);

module.exports = router;
