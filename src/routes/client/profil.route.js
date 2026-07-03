const router = require('express').Router();
const profilController = require('../../controllers/client/profil.controller');
const auth = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { updateProfilSchema } = require('../../validations/user.validation');

router.use(auth);

router.get('/', profilController.get);
router.put('/', validate(updateProfilSchema), profilController.update);
router.patch('/avatar', upload.single('avatar'), profilController.updateAvatar);

module.exports = router;
