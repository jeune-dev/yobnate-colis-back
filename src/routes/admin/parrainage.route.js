const router = require('express').Router();
const Joi = require('joi');
const service = require('../../services/admin/parrainage.service');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { uuidParam } = require('../../validations/shared');

const ajusterCreditSchema = Joi.object({
  creditParrainage: Joi.number().min(0).max(100000).required(),
  motif: Joi.string().max(255).allow('', null),
});

/** Programme de parrainage : parrains, filleuls, crédits. */
router.use(auth, checkActiveUser, admin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await service.getParrains(req.query, req.query);
    return ok(
      res,
      { parrains: result.parrains, totaux: result.totaux, pagination: result.pagination },
      result.message
    );
  })
);

router.get(
  '/:id/filleuls',
  validate(uuidParam, 'params'),
  asyncHandler(async (req, res) => {
    const result = await service.getFilleuls(req.params.id);
    return ok(res, { parrain: result.parrain, filleuls: result.filleuls }, result.message);
  })
);

router.patch(
  '/:id/credit',
  validate(uuidParam, 'params'),
  validate(ajusterCreditSchema),
  asyncHandler(async (req, res) => {
    const result = await service.ajusterCredit(req.params.id, req.body, req.user.id);
    return ok(res, { utilisateur: result.utilisateur }, result.message);
  })
);

module.exports = router;
