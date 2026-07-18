const router = require('express').Router();
const paiementController = require('../../controllers/admin/paiement.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { recordPaiementSchema } = require('../../validations/paiement.validation');
const { uuidParam, factureIdParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Paiements
 *   description: Enregistrement et suivi des paiements clients
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/paiements:
 *   get:
 *     tags: [Admin - Paiements]
 *     summary: Lister tous les paiements avec filtres
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: statut, in: query, schema: { type: string, enum: [en_attente, complete, rembourse, echoue] } }
 *       - { name: modePaiement, in: query, schema: { type: string } }
 *       - { name: dateDebut, in: query, schema: { type: string, format: date } }
 *       - { name: dateFin, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Liste paginée des paiements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     paiements: { type: array, items: { $ref: '#/components/schemas/Paiement' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', paiementController.getAll);

/**
 * @swagger
 * /admin/paiements/{id}:
 *   get:
 *     tags: [Admin - Paiements]
 *     summary: Détail d'un paiement
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail du paiement }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), paiementController.getOne);

/**
 * @swagger
 * /admin/paiements/factures/{factureId}:
 *   post:
 *     tags: [Admin - Paiements]
 *     summary: Enregistrer un paiement pour une facture (marque la facture comme payée)
 *     parameters:
 *       - { name: factureId, in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modePaiement, montant]
 *             properties:
 *               modePaiement: { type: string, enum: [especes, virement, mobile_money, carte] }
 *               montant: { type: number, minimum: 0 }
 *               reference: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Paiement enregistré, facture mise à jour }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/factures/:factureId', validate(factureIdParam, 'params'), validate(recordPaiementSchema), paiementController.enregistrer);

/**
 * @swagger
 * /admin/paiements/{id}/rembourser:
 *   patch:
 *     tags: [Admin - Paiements]
 *     summary: Marquer un paiement comme remboursé
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Paiement remboursé }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/rembourser', validate(uuidParam, 'params'), paiementController.rembourser);

module.exports = router;
