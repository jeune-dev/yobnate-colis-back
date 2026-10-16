const router = require('express').Router();
const ctrl = require('../controller/colisClient.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const parseJsonFields = require('../../../middlewares/parseJsonFields.middleware');
const { upload, uploadColis } = require('../../../middlewares/upload.middleware');
const {
  devisSchema,
  declarerColisSchema,
  annulerColisSchema,
  abonnerSuiviSchema,
  modifierColisClientSchema,
  repondrePropositionSchema,
  listeColisClientQuery,
  listeColisRecusQuery,
  confirmerRemiseSchema,
} = require('../validation/colis.validation');
const { mutationRateLimit } = require('../../../middlewares/rateLimit.middleware');
const { uuidParam } = require('../../../validations/common');

/** Déclaration et suivi des expéditions du client connecté. */
router.use(auth, checkActiveUser);

router.post('/devis', validate(devisSchema), ctrl.devis);
router.get('/', validate(listeColisClientQuery, 'query'), ctrl.getMes);
/**
 * @swagger
 * /client/colis/recus:
 *   get:
 *     tags: [Client — Colis]
 *     summary: Colis dont le client connecté est le destinataire
 *     description: >-
 *       Rapprochés par numéro de téléphone (vérifié si le paramètre l'exige).
 *       Chaque colis porte `enRetard` et `avisDonne` : le destinataire a déjà
 *       déposé son avis sur cette expédition (bouton « Donner mon avis » à masquer).
 *     responses:
 *       200:
 *         description: Page de colis reçus
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Colis reçus
 *               data:
 *                 colis:
 *                   - { id: "3f0c…", reference: PNCO0313102026AGU03, statut: recupere, enRetard: false, avisDonne: true }
 *                 pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
 */
router.get('/recus', validate(listeColisRecusQuery, 'query'), ctrl.getRecus);
/**
 * @swagger
 * /client/colis/recus/{id}/confirmer-remise:
 *   post:
 *     tags: [Client — Colis]
 *     summary: Confirmer la réception avec le code affiché par l'agent ou le coursier
 *     description: >-
 *       Le code (six chiffres, valable dix minutes, usage unique) est généré par
 *       `POST /admin/colis/{id}/code-remise`. La remise est enregistrée (RETIRE ou
 *       LIVRE) au nom de l'agent qui l'a affiché. Cinq erreurs annulent le code ;
 *       un colis qui n'est plus en attente de remise, ou dont la facture reste
 *       impayée, est refusé (le code reste alors utilisable après règlement).
 *     responses:
 *       200:
 *         description: Réception confirmée
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Réception confirmée. Merci ! Vous pouvez maintenant donner votre avis.
 *               data: { colis: { id: "3f0c…", reference: PNCO0313102026AGU03, statut: recupere } }
 *       400: { description: "Code incorrect, expiré, déjà utilisé, trop d'essais, colis plus en attente de remise ou facture impayée" }
 *       404: { description: Colis inconnu ou adressé à un autre numéro }
 */
// Le destinataire saisit le code affiché par l'agent : la remise est enregistrée
router.post(
  '/recus/:id/confirmer-remise',
  mutationRateLimit,
  validate(uuidParam, 'params'),
  validate(confirmerRemiseSchema),
  ctrl.confirmerRemise
);
// Formulaire multipart : photos (champ « photos ») et message vocal facultatif (champ « vocal »)
router.post(
  '/',
  uploadColis,
  parseJsonFields('pieces', 'articlesDouane', 'articles', 'emballages', 'infosCollecte'),
  validate(declarerColisSchema),
  ctrl.declarer
);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
// Correction de la demande tant que le colis n'est pas arrivé au Sénégal
router.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(modifierColisClientSchema),
  ctrl.modifier
);
// Catégorie 3 : réponse à la proposition tarifaire
router.post('/:id/proposition/accepter', validate(uuidParam, 'params'), ctrl.accepterProposition);
router.post(
  '/:id/proposition/refuser',
  validate(uuidParam, 'params'),
  validate(repondrePropositionSchema),
  ctrl.refuserProposition
);
router.get('/:id/suivi', validate(uuidParam, 'params'), ctrl.suivi);
router.get('/:id/etiquettes', validate(uuidParam, 'params'), ctrl.etiquettes);
router.get('/:id/bordereau', validate(uuidParam, 'params'), ctrl.bordereau);
router.get('/:id/facture-commerciale', validate(uuidParam, 'params'), ctrl.factureCommerciale);
router.patch(
  '/:id/annuler',
  validate(uuidParam, 'params'),
  validate(annulerColisSchema),
  ctrl.annuler
);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 10),
  ctrl.ajouterPhotos
);
router.post('/:id/vocal', validate(uuidParam, 'params'), uploadColis, ctrl.deposerVocal);
router.post(
  '/:id/abonnement-suivi',
  validate(uuidParam, 'params'),
  validate(abonnerSuiviSchema),
  ctrl.abonnerSuivi
);

module.exports = router;
