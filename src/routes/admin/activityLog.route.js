const router = require('express').Router();
const activityLogController = require('../../controllers/admin/activityLog.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

router.use(auth, checkActiveUser, admin);

router.get('/', activityLogController.getAll);

module.exports = router;
