const router = require('express').Router();
const ctrl = require('../controller/annonce.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  createAnnonceSchema,
  updateAnnonceSchema,
  listeAnnoncesQuery,
} = require('../validation/catalogue.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { Annonce } = require('../../../models');

/** Messages publiés sur la page d'accueil de l'application. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeAnnoncesQuery, 'query'), ctrl.getAll);
router.post('/', validate(createAnnonceSchema), ctrl.create);
router.put(
  '/:id',
  validate(uuidParam, 'params'),
  verrou(Annonce),
  validate(updateAnnonceSchema),
  ctrl.update
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);
router.post('/:id/image', validate(uuidParam, 'params'), upload.single('image'), ctrl.image);

module.exports = router;
