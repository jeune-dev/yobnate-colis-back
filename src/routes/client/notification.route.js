const router = require('express').Router();
const notificationController = require('../../controllers/client/notification.controller');
const auth = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Client - Notifications
 *   description: Notifications du client connecté
 */

router.use(auth);

/**
 * @swagger
 * /client/notifications:
 *   get:
 *     tags: [Client - Notifications]
 *     summary: Lister mes notifications
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Liste des notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications: { type: array, items: { $ref: '#/components/schemas/Notification' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', notificationController.getMes);

/**
 * @swagger
 * /client/notifications/non-lues:
 *   get:
 *     tags: [Client - Notifications]
 *     summary: Nombre de notifications non lues
 *     responses:
 *       200:
 *         description: Compteur de notifications non lues
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, properties: { total: { type: integer } } }
 */
router.get('/non-lues', notificationController.getNbNonLues);

/**
 * @swagger
 * /client/notifications/{id}/lue:
 *   patch:
 *     tags: [Client - Notifications]
 *     summary: Marquer une notification comme lue
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Notification marquée lue }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/lue', validate(uuidParam, 'params'), notificationController.marquerLue);

/**
 * @swagger
 * /client/notifications/toutes-lues:
 *   patch:
 *     tags: [Client - Notifications]
 *     summary: Marquer toutes les notifications comme lues
 *     responses:
 *       200: { description: Toutes les notifications marquées lues }
 */
router.patch('/toutes-lues', notificationController.marquerToutesLues);

module.exports = router;
