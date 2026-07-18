const router = require('express').Router();
const factureController = require('../../controllers/admin/facture.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Factures
 *   description: Gestion des factures (générées automatiquement à la création d'un colis)
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/factures:
 *   get:
 *     tags: [Admin - Factures]
 *     summary: Lister toutes les factures avec filtres
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: statut, in: query, schema: { type: string, enum: [en_attente, payee, annulee] } }
 *       - { name: clientId, in: query, schema: { type: string, format: uuid } }
 *       - { name: dateDebut, in: query, schema: { type: string, format: date } }
 *       - { name: dateFin, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Liste paginée des factures
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', factureController.getAll);

/**
 * @swagger
 * /admin/factures/{id}:
 *   get:
 *     tags: [Admin - Factures]
 *     summary: Détail d'une facture avec son paiement
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail de la facture }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), factureController.getOne);

/**
 * @swagger
 * /admin/factures/{id}/annuler:
 *   patch:
 *     tags: [Admin - Factures]
 *     summary: Annuler une facture (uniquement si statut en_attente)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Facture annulée }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/annuler', validate(uuidParam, 'params'), factureController.annuler);

module.exports = router;
