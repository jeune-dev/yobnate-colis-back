const router = require('express').Router();
const userController = require('../../controllers/admin/user.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

router.use(auth, checkActiveUser, admin);

router.get('/', userController.getAll);
router.get('/:id', userController.getOne);
router.get('/:id/colis', userController.getColis);
router.patch('/:id/activer', userController.activer);
router.patch('/:id/desactiver', userController.desactiver);

module.exports = router;
