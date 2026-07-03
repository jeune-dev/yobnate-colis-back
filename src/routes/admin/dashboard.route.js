const router = require('express').Router();
const dashboardController = require('../../controllers/admin/dashboard.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

router.use(auth, checkActiveUser, admin);

router.get('/stats', dashboardController.getStats);
router.get('/colis-par-statut', dashboardController.getColisParStatut);
router.get('/utilisateurs-actifs', dashboardController.getUtilisateursActifs);
router.get('/villes-frequentes', dashboardController.getVillesFrequentes);
router.get('/destinations-frequentes', dashboardController.getDestinationsFrequentes);
router.get('/activites-recentes', dashboardController.getActivitesRecentes);
router.get('/derniers-utilisateurs', dashboardController.getDerniersUtilisateurs);
router.get('/derniers-colis', dashboardController.getDerniersColis);

module.exports = router;
