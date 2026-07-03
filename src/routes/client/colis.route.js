const router = require('express').Router();
const colisController = require('../../controllers/client/colis.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { createColisSchema } = require('../../validations/colis.validation');

router.use(auth, checkActiveUser);

router.get('/', colisController.getMes);
router.post('/', upload.array('photos', 5), validate(createColisSchema), colisController.create);
router.get('/:id', colisController.getOne);
router.get('/:id/suivi', colisController.getSuivi);
router.patch('/:id/annuler', colisController.annuler);

module.exports = router;
