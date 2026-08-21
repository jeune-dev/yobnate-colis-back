const router = require('express').Router();
const ctrl = require('../../controllers/client/profil.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const {
  updateProfilSchema,
  updatePreferencesSchema,
} = require('../../validations/user.validation');

/** Profil et préférences du client connecté. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.get);
router.put('/', validate(updateProfilSchema), ctrl.update);
router.post('/avatar', upload.single('avatar'), ctrl.updateAvatar);
router.put('/preferences', validate(updatePreferencesSchema), ctrl.updatePreferences);

module.exports = router;
