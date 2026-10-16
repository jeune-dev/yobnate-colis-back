const router = require('express').Router();
const ctrl = require('../controller/colisAdmin.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  coutRevientSchema,
  updateColisSchema,
  corrigerPeseeSchema,
  enregistrerEvenementSchema,
  enregistrerEvenementLotSchema,
  changerPointRetraitSchema,
  affecterCoursierSchema,
  noteInterneSchema,
  validerDemandeSchema,
  refuserDemandeSchema,
  proposerTarifSchema,
  listeColisAdminQuery,
} = require('../validation/colis.validation');
const { uuidParam } = require('../../../validations/common');
const { Colis } = require('../../../models');
const perimetre = require('../../../utils/perimetre');
const { siUuid } = require('../../../middlewares/perimetre.middleware');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');

/** Back-office des expéditions : acheminement, pesée, incidents, documents. */
router.use(auth, checkActiveUser, personnel);

// Agent et coursier n'accèdent qu'aux colis de leur périmètre (404 sinon)
router.param(
  'id',
  siUuid(perimetre.exigerPerimetre(Colis, perimetre.colis, 'Expédition introuvable'))
);

router.get('/', validate(listeColisAdminQuery, 'query'), ctrl.getAll);
router.get('/statistiques', ctrl.statistiques);
router.get('/export', admin, validate(listeColisAdminQuery, 'query'), ctrl.exporter);
router.get('/codes-evenements', ctrl.codesEvenements);
router.get('/recherche/:numero', ctrl.rechercher);
/**
 * @swagger
 * /admin/colis/{id}:
 *   get:
 *     tags: [Admin — Colis]
 *     summary: Détail d'une expédition (masqué pour le personnel de terrain)
 *     description: >-
 *       Outre le colis, la réponse indique `evenementsPossibles` pour l'utilisateur et,
 *       quand le colis attend sa remise (disponible_retrait, en_livraison) :
 *       `destinataireACompte` (la remise se confirme dans l'application du
 *       destinataire, voir `code-remise`) et `reglementAvantRemise` (solde à
 *       encaisser avant toute remise ; faux en paiement différé).
 *     responses:
 *       200:
 *         description: Détail de l'expédition
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Détail de l'expédition
 *               data:
 *                 colis: { id: "3f0c…", statut: disponible_retrait, destinataireACompte: true, reglementAvantRemise: false }
 */
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/etiquettes', validate(uuidParam, 'params'), ctrl.etiquettes);
router.get('/:id/bordereau', validate(uuidParam, 'params'), ctrl.bordereau);
// Coût de revient (marge moyenne) : réservé aux administrateurs
router.patch(
  '/:id/cout-revient',
  admin,
  validate(uuidParam, 'params'),
  validate(coutRevientSchema),
  ctrl.coutRevient
);

router.post(
  '/:id/evenements',
  validate(uuidParam, 'params'),
  validate(enregistrerEvenementSchema),
  ctrl.enregistrerEvenement
);
router.post(
  '/evenements/lot',
  admin,
  validate(enregistrerEvenementLotSchema),
  ctrl.enregistrerEvenementLot
);
// Étude des demandes : validation (cat. 2), refus, proposition tarifaire (cat. 3)
router.post(
  '/:id/valider',
  admin,
  validate(uuidParam, 'params'),
  validate(validerDemandeSchema),
  ctrl.valider
);
router.post(
  '/:id/refuser',
  admin,
  validate(uuidParam, 'params'),
  validate(refuserDemandeSchema),
  ctrl.refuser
);
router.post(
  '/:id/proposition',
  admin,
  validate(uuidParam, 'params'),
  validate(proposerTarifSchema),
  ctrl.proposerTarif
);
router.post(
  '/:id/pesee',
  admin,
  validate(uuidParam, 'params'),
  validate(corrigerPeseeSchema),
  ctrl.corrigerPesee
);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 10),
  ctrl.ajouterPhotos
);
router.post(
  '/:id/notes',
  validate(uuidParam, 'params'),
  validate(noteInterneSchema),
  ctrl.ajouterNoteInterne
);
router.post('/:id/code-retrait', admin, validate(uuidParam, 'params'), ctrl.regenererCodeRetrait);
/**
 * @swagger
 * /admin/colis/{id}/code-remise:
 *   post:
 *     tags: [Admin — Colis]
 *     summary: Afficher un code de remise au destinataire titulaire d'un compte
 *     description: >-
 *       Code à six chiffres, valable dix minutes, à montrer au destinataire qui le
 *       saisit dans son application (`POST /client/colis/recus/{id}/confirmer-remise`).
 *       Un nouveau code remplace le précédent. `codeEvenement` vaut RETIRE au point
 *       et LIVRE en livraison. Sans l'application, le personnel de terrain remet
 *       avec le code de retrait (événement classique, tracé au journal).
 *     responses:
 *       200:
 *         description: Code généré
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Montrez ce code au destinataire : il le saisit dans son application."
 *               data: { code: "482913", codeEvenement: RETIRE, expireLe: "2026-10-16T10:10:00.000Z" }
 *       400: { description: "Colis pas en attente de remise, destinataire sans compte ou facture impayée" }
 *       403: { description: Remise hors de la mission de l'utilisateur }
 */
// Code à usage unique que le destinataire saisit dans son application à la remise
router.post('/:id/code-remise', validate(uuidParam, 'params'), ctrl.genererCodeRemise);

router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  verrou(Colis),
  validate(updateColisSchema),
  ctrl.update
);
router.patch(
  '/:id/point-retrait',
  admin,
  validate(uuidParam, 'params'),
  validate(changerPointRetraitSchema),
  ctrl.changerPointRetrait
);
router.patch(
  '/:id/coursier',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterCoursierSchema),
  ctrl.affecterCoursier
);

module.exports = router;
