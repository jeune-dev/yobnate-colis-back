const router = require('express').Router();
const ctrl = require('../../controllers/admin/tourneeCollecte.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createTourneeSchema,
  updateTourneeSchema,
  changerStatutTourneeSchema,
} = require('../../validations/catalogue.validation');
const { uuidParam } = require('../../validations/shared');

/** Tournées de collecte à domicile : date, zone (villes, codes postaux), bannière. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', validate(createTourneeSchema), ctrl.create);
router.put('/:id', validate(uuidParam, 'params'), validate(updateTourneeSchema), ctrl.update);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(changerStatutTourneeSchema),
  ctrl.changerStatut
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
