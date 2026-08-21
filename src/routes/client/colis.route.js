const router = require('express').Router();
const ctrl = require('../../controllers/client/colis.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const parseJsonFields = require('../../middlewares/parseJsonFields.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const {
  devisSchema,
  declarerColisSchema,
  annulerColisSchema,
  abonnerSuiviSchema,
} = require('../../validations/colis.validation');
const { uuidParam } = require('../../validations/shared');

/** Déclaration et suivi des expéditions du client connecté. */
router.use(auth, checkActiveUser);

router.post('/devis', validate(devisSchema), ctrl.devis);
router.get('/', ctrl.getMes);
router.post(
  '/',
  upload.array('photos', 10),
  parseJsonFields('pieces', 'articlesDouane'),
  validate(declarerColisSchema),
  ctrl.declarer
);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/suivi', validate(uuidParam, 'params'), ctrl.suivi);
router.get('/:id/etiquettes', validate(uuidParam, 'params'), ctrl.etiquettes);
router.get('/:id/bordereau', validate(uuidParam, 'params'), ctrl.bordereau);
router.get('/:id/facture-commerciale', validate(uuidParam, 'params'), ctrl.factureCommerciale);
router.patch(
  '/:id/annuler',
  validate(uuidParam, 'params'),
  validate(annulerColisSchema),
  ctrl.annuler
);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 10),
  ctrl.ajouterPhotos
);
router.post(
  '/:id/abonnement-suivi',
  validate(uuidParam, 'params'),
  validate(abonnerSuiviSchema),
  ctrl.abonnerSuivi
);

module.exports = router;
