const router = require('express').Router();
const ctrl = require('../controller/profil.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  updateProfilSchema,
  updatePreferencesSchema,
  updateDeviceTokenSchema,
  verifierTelephoneSchema,
} = require('../validation/profil.validation');
const {
  envoiCodeRateLimit,
  mutationRateLimit,
} = require('../../../middlewares/rateLimit.middleware');

/** Profil et préférences du client connecté. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.get);
router.put('/', validate(updateProfilSchema), ctrl.update);
router.post('/avatar', upload.single('avatar'), ctrl.updateAvatar);
router.put('/preferences', validate(updatePreferencesSchema), ctrl.updatePreferences);
router.post('/justificatif-pro', upload.single('justificatif'), ctrl.deposerJustificatifPro);
router.get('/parrainage', ctrl.parrainage);
router.post('/device-token', validate(updateDeviceTokenSchema), ctrl.updateDeviceToken);

// Preuve de possession du numéro (accès aux colis reçus)
router.post('/telephone/code', envoiCodeRateLimit, ctrl.demanderCodeTelephone);
router.post(
  '/telephone/verifier',
  mutationRateLimit,
  validate(verifierTelephoneSchema),
  ctrl.verifierTelephone
);

module.exports = router;
