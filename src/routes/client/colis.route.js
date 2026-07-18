const router = require('express').Router();
const colisController = require('../../controllers/client/colis.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { createColisSchema } = require('../../validations/colis.validation');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Client - Colis
 *   description: Gestion des colis du client connecté
 */

router.use(auth, checkActiveUser);

/**
 * @swagger
 * /client/colis:
 *   get:
 *     tags: [Client - Colis]
 *     summary: Lister mes colis
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: statut, in: query, schema: { type: string } }
 *       - { name: dateDebut, in: query, schema: { type: string, format: date } }
 *       - { name: dateFin, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Liste des colis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     colis: { type: array, items: { $ref: '#/components/schemas/Colis' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', colisController.getMes);

/**
 * @swagger
 * /client/colis:
 *   post:
 *     tags: [Client - Colis]
 *     summary: Déclarer un nouveau colis
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [expediteurNom, expediteurTelephone, villeDepartId, destinataireNom, destinataireTelephone, villeArriveeId, adresseLivraison, poids]
 *             properties:
 *               expediteurNom: { type: string }
 *               expediteurTelephone: { type: string }
 *               villeDepartId: { type: string, format: uuid }
 *               destinataireNom: { type: string }
 *               destinataireTelephone: { type: string }
 *               villeArriveeId: { type: string, format: uuid }
 *               adresseLivraison: { type: string }
 *               description: { type: string }
 *               typeColis: { type: string, enum: [standard, express, fragile] }
 *               poids: { type: number }
 *               valeurDeclaree: { type: number }
 *               photos: { type: array, items: { type: string, format: binary }, maxItems: 5 }
 *     responses:
 *       201: { description: Colis créé avec sa facture }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', upload.array('photos', 5), validate(createColisSchema), colisController.create);

/**
 * @swagger
 * /client/colis/{id}:
 *   get:
 *     tags: [Client - Colis]
 *     summary: Détail d'un colis
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail du colis }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), colisController.getOne);

/**
 * @swagger
 * /client/colis/{id}/suivi:
 *   get:
 *     tags: [Client - Colis]
 *     summary: Historique de suivi d'un colis
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200:
 *         description: Historique de suivi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     historique: { type: array, items: { $ref: '#/components/schemas/SuiviColis' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/suivi', validate(uuidParam, 'params'), colisController.getSuivi);

/**
 * @swagger
 * /client/colis/{id}/annuler:
 *   patch:
 *     tags: [Client - Colis]
 *     summary: Annuler un colis (statut en_attente ou en_preparation uniquement)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motif: { type: string, maxLength: 255 }
 *     responses:
 *       200: { description: Colis annulé }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/annuler', validate(uuidParam, 'params'), colisController.annuler);

module.exports = router;
