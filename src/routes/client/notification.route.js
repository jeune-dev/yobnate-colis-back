const router = require('express').Router();
const ctrl = require('../../controllers/client/notification.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuidParam } = require('../../validations/shared');

/** Notifications internes du client connecté. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getMes);
router.get('/non-lues', ctrl.getNbNonLues);
router.patch('/:id/lue', validate(uuidParam, 'params'), ctrl.marquerLue);
router.patch('/toutes-lues', ctrl.marquerToutesLues);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.supprimer);

module.exports = router;
