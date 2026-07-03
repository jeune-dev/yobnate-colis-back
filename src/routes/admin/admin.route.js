const router = require('express').Router();
const adminController = require('../../controllers/admin/admin.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin, superAdmin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createAdminSchema, updateAdminSchema } = require('../../validations/user.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', adminController.getAll);
router.get('/:id', adminController.getOne);
router.post('/', superAdmin, validate(createAdminSchema), adminController.create);
router.put('/:id', superAdmin, validate(updateAdminSchema), adminController.update);

module.exports = router;
