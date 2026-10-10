const router = require('express').Router();
const ctrl = require('../controller/tourneeCollecte.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  createTourneeSchema,
  updateTourneeSchema,
  changerStatutTourneeSchema,
  listeTourneesQuery,
} = require('../validation/catalogue.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { TourneeCollecte } = require('../../../models');

/** Tournées de collecte à domicile : date, zone (villes, codes postaux), bannière. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeTourneesQuery, 'query'), ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', validate(createTourneeSchema), ctrl.create);
router.put(
  '/:id',
  validate(uuidParam, 'params'),
  verrou(TourneeCollecte),
  validate(updateTourneeSchema),
  ctrl.update
);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(changerStatutTourneeSchema),
  ctrl.changerStatut
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
