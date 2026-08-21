const router = require('express').Router();
const ctrl = require('../../controllers/admin/personnel.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createPersonnelSchema,
  updatePersonnelSchema,
} = require('../../validations/user.validation');
const { uuidParam } = require('../../validations/shared');

/** Coursiers et agents de point de collecte. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/coursiers-disponibles', ctrl.coursiersDisponibles);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', validate(createPersonnelSchema), ctrl.create);
router.put('/:id', validate(uuidParam, 'params'), validate(updatePersonnelSchema), ctrl.update);
router.patch('/:id/statut', validate(uuidParam, 'params'), ctrl.toggle);

module.exports = router;
