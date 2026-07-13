const router = require('express').Router();
const tarifController = require('../../controllers/admin/tarif.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { calculerPrixSchema, createTarifSchema, updateTarifSchema } = require('../../validations/tarif.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', tarifController.getAll);
router.post('/calculer-prix', validate(calculerPrixSchema), tarifController.calculerPrix);
router.get('/:id', tarifController.getOne);
router.post('/', validate(createTarifSchema), tarifController.create);
router.put('/:id', validate(updateTarifSchema), tarifController.update);

module.exports = router;
