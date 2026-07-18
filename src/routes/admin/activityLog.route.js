const router = require('express').Router();
const activityLogController = require('../../controllers/admin/activityLog.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Journal d'activité
 *   description: Consultation du journal des actions administratives
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/activity-logs:
 *   get:
 *     tags: [Admin - Journal d'activité]
 *     summary: Lister les entrées du journal d'activité avec filtres
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: userId, in: query, schema: { type: string, format: uuid }, description: Filtrer par utilisateur }
 *       - { name: action, in: query, schema: { type: string }, description: Filtrer par type d'action }
 *       - { name: entite, in: query, schema: { type: string }, description: Filtrer par entité concernée }
 *       - { name: dateDebut, in: query, schema: { type: string, format: date } }
 *       - { name: dateFin, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Journal d'activité paginé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs: { type: array, items: { $ref: '#/components/schemas/ActivityLog' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', activityLogController.getAll);

module.exports = router;
