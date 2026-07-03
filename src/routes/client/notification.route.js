const router = require('express').Router();
const notificationController = require('../../controllers/client/notification.controller');
const auth = require('../../middlewares/auth.middleware');

router.use(auth);

router.get('/', notificationController.getMes);
router.get('/non-lues', notificationController.getNbNonLues);
router.patch('/:id/lue', notificationController.marquerLue);
router.patch('/toutes-lues', notificationController.marquerToutesLues);

module.exports = router;
