const router = require('express').Router();
const ctrl = require('../controller/enlevementAdmin.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  planifierSchema,
  cloturerSchema,
  annulerEnlevementSchema,
} = require('../validation/enlevement.validation');
const { uuidParam } = require('../../../validations/common');
const { DemandeEnlevement } = require('../../../models');
const perimetre = require('../../../utils/perimetre');
const { siUuid } = require('../../../middlewares/perimetre.middleware');

/** Gestion des demandes d'enlèvement à domicile. */
router.use(auth, checkActiveUser, personnel);

// Coursier : enlèvements qui lui sont affectés ; agent : ceux déposés à son point
router.param(
  'id',
  siUuid(
    perimetre.exigerPerimetre(
      DemandeEnlevement,
      perimetre.enlevements,
      "Demande d'enlèvement introuvable"
    )
  )
);

router.get('/', ctrl.getAll);
router.get('/tournee/aujourdhui', ctrl.tournee);
router.get('/tournee/:coursierId', ctrl.tournee);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);

router.patch(
  '/:id/planifier',
  admin,
  validate(uuidParam, 'params'),
  validate(planifierSchema),
  ctrl.planifier
);
router.patch('/:id/demarrer', validate(uuidParam, 'params'), ctrl.demarrer);
router.patch(
  '/:id/cloturer',
  validate(uuidParam, 'params'),
  validate(cloturerSchema),
  ctrl.cloturer
);
router.patch(
  '/:id/annuler',
  admin,
  validate(uuidParam, 'params'),
  validate(annulerEnlevementSchema),
  ctrl.annuler
);

module.exports = router;
