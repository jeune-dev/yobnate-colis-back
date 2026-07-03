const router = require('express').Router();
const villeController = require('../../controllers/admin/ville.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createVilleSchema, updateVilleSchema } = require('../../validations/ville.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', villeController.getAll);
router.get('/:id', villeController.getOne);
router.post('/', validate(createVilleSchema), villeController.create);
router.put('/:id', validate(updateVilleSchema), villeController.update);

module.exports = router;
