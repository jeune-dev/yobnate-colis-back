const router = require('express').Router();
const colisController = require('../../controllers/admin/colis.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { updateColisSchema, updateStatutColisSchema } = require('../../validations/colis.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', colisController.getAll);
router.get('/statistiques', colisController.getStatistiques);
router.get('/:id', colisController.getOne);
router.put('/:id', validate(updateColisSchema), colisController.update);
router.patch('/:id/statut', validate(updateStatutColisSchema), colisController.updateStatut);
router.post('/:id/photos', upload.array('photos', 5), colisController.ajouterPhotos);

module.exports = router;
