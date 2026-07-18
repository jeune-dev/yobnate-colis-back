const router = require('express').Router();
const paiementController = require('../../controllers/client/paiement.controller');
const auth = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Client - Factures
 *   description: Consultation des factures du client connecté
 */

router.use(auth);

/**
 * @swagger
 * /client/paiements/factures:
 *   get:
 *     tags: [Client - Factures]
 *     summary: Lister mes factures
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Liste des factures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     factures: { type: array, items: { $ref: '#/components/schemas/Facture' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/factures', paiementController.getMesFactures);

/**
 * @swagger
 * /client/paiements/factures/{id}:
 *   get:
 *     tags: [Client - Factures]
 *     summary: Détail d'une facture
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail de la facture }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/factures/:id', validate(uuidParam, 'params'), paiementController.getFacture);

module.exports = router;
