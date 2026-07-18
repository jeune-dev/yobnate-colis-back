const router = require('express').Router();
const colisController = require('../../controllers/admin/colis.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { updateColisSchema, updateStatutColisSchema } = require('../../validations/colis.validation');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Colis
 *   description: Gestion administrative des colis
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/colis:
 *   get:
 *     tags: [Admin - Colis]
 *     summary: Lister tous les colis avec filtres avancés
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: statut, in: query, schema: { type: string } }
 *       - { name: villeDepartId, in: query, schema: { type: string, format: uuid } }
 *       - { name: villeArriveeId, in: query, schema: { type: string, format: uuid } }
 *       - { name: reference, in: query, schema: { type: string } }
 *       - { name: expediteur, in: query, schema: { type: string } }
 *       - { name: destinataire, in: query, schema: { type: string } }
 *       - { name: dateDebut, in: query, schema: { type: string, format: date } }
 *       - { name: dateFin, in: query, schema: { type: string, format: date } }
 *       - { name: sortBy, in: query, schema: { type: string, enum: [createdAt, statut, montant, poids] } }
 *       - { name: sortOrder, in: query, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Liste paginée des colis }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', colisController.getAll);

/**
 * @swagger
 * /admin/colis/statistiques:
 *   get:
 *     tags: [Admin - Colis]
 *     summary: Statistiques des colis par statut
 *     responses:
 *       200: { description: Comptage par statut }
 */
router.get('/statistiques', colisController.getStatistiques);

/**
 * @swagger
 * /admin/colis/{id}:
 *   get:
 *     tags: [Admin - Colis]
 *     summary: Détail complet d'un colis (avec suivi, facture, paiement)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail du colis }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), colisController.getOne);

/**
 * @swagger
 * /admin/colis/{id}:
 *   put:
 *     tags: [Admin - Colis]
 *     summary: Modifier les informations d'un colis (recalcul automatique du montant si poids/trajet change)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expediteurNom: { type: string }
 *               poids: { type: number }
 *               typeColis: { type: string }
 *               adresseLivraison: { type: string }
 *     responses:
 *       200: { description: Colis mis à jour }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put('/:id', validate(uuidParam, 'params'), validate(updateColisSchema), colisController.update);

/**
 * @swagger
 * /admin/colis/{id}/statut:
 *   patch:
 *     tags: [Admin - Colis]
 *     summary: Changer le statut d'un colis (machine à états)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [statut]
 *             properties:
 *               statut: { type: string, enum: [en_attente, en_preparation, en_transit, arrive, recupere, livre, annule] }
 *               localisation: { type: string }
 *               commentaire: { type: string }
 *               annuleMotif: { type: string }
 *     responses:
 *       200: { description: Statut mis à jour, client notifié par email et notification }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/statut', validate(uuidParam, 'params'), validate(updateStatutColisSchema), colisController.updateStatut);

/**
 * @swagger
 * /admin/colis/{id}/photos:
 *   post:
 *     tags: [Admin - Colis]
 *     summary: Ajouter des photos à un colis (max 5 par upload)
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos: { type: array, items: { type: string, format: binary }, maxItems: 5 }
 *     responses:
 *       200: { description: Photos ajoutées }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/photos', validate(uuidParam, 'params'), upload.array('photos', 5), colisController.ajouterPhotos);

module.exports = router;
