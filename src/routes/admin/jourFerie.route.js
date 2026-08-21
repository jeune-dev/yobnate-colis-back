const router = require('express').Router();
const ctrl = require('../../controllers/admin/jourFerie.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createJourFerieSchema,
  updateJourFerieSchema,
  importerCalendrierSchema,
} = require('../../validations/jourFerie.validation');
const { uuidParam } = require('../../validations/shared');

/** Calendrier des jours fériés par pays, utilisé dans le calcul des délais. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.post('/', validate(createJourFerieSchema), ctrl.create);
router.post('/import', validate(importerCalendrierSchema), ctrl.importer);
router.put('/:id', validate(uuidParam, 'params'), validate(updateJourFerieSchema), ctrl.update);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
