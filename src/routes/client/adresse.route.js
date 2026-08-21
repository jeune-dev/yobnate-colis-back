const router = require('express').Router();
const ctrl = require('../../controllers/client/adresse.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createAdresseSchema,
  updateAdresseSchema,
} = require('../../validations/adresse.validation');
const { uuidParam } = require('../../validations/shared');

/** Carnet d'adresses du client connecté. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getMes);
router.post('/', validate(createAdresseSchema), ctrl.create);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.put('/:id', validate(uuidParam, 'params'), validate(updateAdresseSchema), ctrl.update);
router.patch('/:id/defaut', validate(uuidParam, 'params'), ctrl.parDefaut);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
