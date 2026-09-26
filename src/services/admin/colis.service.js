const { Op } = require('sequelize');
const {
  sequelize,
  Colis,
  ColisPiece,
  SuiviColis,
  Ville,
  User,
  Facture,
  Paiement,
  ServiceExpedition,
  PointCollecte,
  Rotation,
  DeclarationDouane,
  ArticleDouane,
  PreuveLivraison,
  DemandeEnlevement,
  TourneeCollecte,
} = require('../../models');
const { arrondir, formater } = require('../../utils/devise');
const { envoyerModele, URL_PUBLIQUE } = require('../../utils/mailer');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult, listerPagine } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const { uploadToCloudinary } = require('../../utils/uploadService');
const suiviService = require('../suivi.service');
const tarificationService = require('../tarification.service');
const parametreService = require('../parametre.service');
const notificationService = require('../notification.service');
const documents = require('../../utils/documents');
const { versCsv } = require('../../utils/csv');
const cache = require('../../config/cache');
const { EVENEMENTS_SUIVI, STATUTS_COLIS } = require('../../constants/colis');
const { PAYS } = require('../../constants/pays');
const { genererCodeRetrait } = require('../../utils/referenceGenerator');

/**
 * Back-office des expéditions.
 *
 * L'administrateur pilote l'acheminement : il fait progresser les colis dans la
 * chaîne d'événements, corrige une pesée, réaffecte un point de retrait, traite
 * les incidents et édite les documents d'exploitation. Tout changement de statut
 * passe par le moteur de traçabilité, jamais par une écriture directe.
 */

class ColisService {
  static INCLUDE_LISTE = [
    { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] },
    { model: Ville, as: 'villeDepart', attributes: ['id', 'nom', 'pays'] },
    { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom', 'pays'] },
    { model: ServiceExpedition, as: 'service', attributes: ['id', 'code', 'nom'] },
    { model: PointCollecte, as: 'pointActuel', attributes: ['id', 'code', 'nom', 'pays'] },
  ];

  /**
   * Détail complet. Les relations « 1-N » (pièces, paiements, articles douaniers,
   * historique) sont chargées par des requêtes séparées (`separate: true`) : jointes
   * dans une seule requête, elles se multipliaient entre elles (10 pièces × 30
   * événements × 10 articles × 3 paiements = 9 000 lignes pour un seul colis,
   * 1,7 s mesurées) au lieu de 53 lignes.
   */
  static INCLUDE_DETAIL = [
    ...ColisService.INCLUDE_LISTE,
    { model: ColisPiece, as: 'pieces', separate: true, order: [['ordre', 'ASC']] },
    {
      model: PointCollecte,
      as: 'pointCollecteDepart',
      attributes: ['id', 'code', 'nom', 'adresse', 'pays'],
    },
    {
      model: PointCollecte,
      as: 'pointRetrait',
      attributes: ['id', 'code', 'nom', 'adresse', 'pays', 'delaiGardeJours'],
    },
    {
      model: Rotation,
      as: 'rotation',
      attributes: ['id', 'reference', 'statut', 'dateDepartPrevue'],
    },
    { model: User, as: 'coursierEnlevement', attributes: ['id', 'nom', 'prenom', 'telephone'] },
    { model: User, as: 'coursierLivraison', attributes: ['id', 'nom', 'prenom', 'telephone'] },
    {
      model: Facture,
      as: 'facture',
      include: [
        { model: Paiement, as: 'paiements', separate: true, order: [['createdAt', 'ASC']] },
      ],
    },
    {
      model: DeclarationDouane,
      as: 'declarationDouane',
      include: [
        { model: ArticleDouane, as: 'articles', separate: true, order: [['createdAt', 'ASC']] },
      ],
    },
    { model: PreuveLivraison, as: 'preuveLivraison' },
    {
      model: TourneeCollecte,
      as: 'tourneeCollecte',
      attributes: ['id', 'reference', 'titre', 'dateCollecte', 'statut'],
    },
    { model: DemandeEnlevement, as: 'enlevement' },
    { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] },
    {
      model: SuiviColis,
      as: 'historique',
      separate: true,
      order: [
        ['dateEvenement', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      include: [{ model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom', 'role'] }],
    },
  ];

  /* ── Recherche ──────────────────────────────────────────────────────────── */

  static construireFiltres = (filters = {}) => {
    const where = {};
    if (filters.statut)
      where.statut = Array.isArray(filters.statut) ? { [Op.in]: filters.statut } : filters.statut;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.paysDepart) where.paysDepart = filters.paysDepart;
    if (filters.paysArrivee) where.paysArrivee = filters.paysArrivee;
    if (filters.villeDepartId) where.villeDepartId = filters.villeDepartId;
    if (filters.villeArriveeId) where.villeArriveeId = filters.villeArriveeId;
    if (filters.pointCollecteId) {
      where[Op.or] = [
        { pointCollecteDepartId: filters.pointCollecteId },
        { pointRetraitId: filters.pointCollecteId },
        { pointActuelId: filters.pointCollecteId },
      ];
    }
    if (filters.pointActuelId) where.pointActuelId = filters.pointActuelId;
    if (filters.rotationId) where.rotationId = filters.rotationId;
    if (filters.coursierId) {
      where[Op.or] = [
        { coursierEnlevementId: filters.coursierId },
        { coursierLivraisonId: filters.coursierId },
      ];
    }
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
    if (filters.expediteur) where.expediteurNom = { [Op.iLike]: `%${filters.expediteur}%` };
    if (filters.destinataire) where.destinataireNom = { [Op.iLike]: `%${filters.destinataire}%` };
    if (filters.typeContenu) where.typeContenu = filters.typeContenu;
    if (filters.categorie) where.categorie = filters.categorie;
    if (filters.tourneeCollecteId) where.tourneeCollecteId = filters.tourneeCollecteId;
    if (filters.modeDepot) where.modeDepot = filters.modeDepot;
    // Demandes à étudier (catégories 2 et 3), en commençant par les plus urgentes
    if (filters.aEtudier === 'true' || filters.aEtudier === true) {
      where.statut = { [Op.in]: ['en_attente_validation'] };
    }
    if (filters.etudeEnRetard === 'true' || filters.etudeEnRetard === true) {
      where.statut = 'en_attente_validation';
      where.dateLimiteEtude = { [Op.lt]: new Date() };
    }
    // Recherche par produit : description du colis, articles de la grille ou lignes douanières
    if (filters.produit) {
      const motif = `%${String(filters.produit).replace(/[%_]/g, '')}%`;
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { description: { [Op.iLike]: motif } },
            sequelize.where(sequelize.cast(sequelize.col('Colis.lignesForfait'), 'text'), {
              [Op.iLike]: motif,
            }),
            {
              id: {
                [Op.in]: sequelize.literal(
                  `(SELECT d."colisId" FROM declarations_douane d
                     JOIN articles_douane a ON a."declarationId" = d.id
                    WHERE a.designation ILIKE ${sequelize.escape(motif)})`
                ),
              },
            },
          ],
        },
      ];
    }
    if (filters.sansRotation === 'true' || filters.sansRotation === true) where.rotationId = null;

    if (filters.enRetard === 'true' || filters.enRetard === true) {
      where.dateLivraisonEstimee = { [Op.lt]: new Date().toISOString().slice(0, 10) };
      where.statut = { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule'] };
    }
    if (filters.enSouffrance === 'true' || filters.enSouffrance === true) {
      where.dateLimiteRetrait = { [Op.lt]: new Date().toISOString().slice(0, 10) };
      where.statut = 'disponible_retrait';
    }
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }
    return where;
  };

  static CHAMPS_TRIABLES = [
    'createdAt',
    'statut',
    'montantTotal',
    'poidsFactureKg',
    'dateLivraisonEstimee',
  ];

  static getAllColis = async (filters = {}, pagination = {}) => {
    const where = ColisService.construireFiltres(filters);
    const sortBy = ColisService.CHAMPS_TRIABLES.includes(filters.sortBy)
      ? filters.sortBy
      : 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await listerPagine(Colis, {
      where,
      include: ColisService.INCLUDE_LISTE,
      order: [[sortBy, sortOrder]],
      limit,
      offset,
    });

    return {
      message: 'Liste des expéditions',
      colis: rows.map((c) => ({ ...c.toJSON(), enRetard: c.estEnRetard })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static chargerColis = async (id, include = ColisService.INCLUDE_DETAIL) => {
    // L'ordre de l'historique est porté par son include (chargé séparément)
    const colis = await Colis.findByPk(id, { include });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    return colis;
  };

  static getColisById = async (id) => {
    const colis = await ColisService.chargerColis(id);
    return {
      message: "Détail de l'expédition",
      colis: {
        ...colis.toJSON(),
        enRetard: colis.estEnRetard,
        estInternational: colis.estInternational,
        transitionsPossibles: colis.transitionsPossibles,
      },
    };
  };

  /** Recherche par numéro de suivi, y compris par numéro de pièce. */
  static rechercherParNumero = async (numero) => {
    const propre = String(numero).trim().toUpperCase();
    let colis = await Colis.findOne({
      where: { reference: propre },
      include: ColisService.INCLUDE_DETAIL,
    });

    if (!colis) {
      const piece = await ColisPiece.findOne({ where: { numeroSuivi: propre } });
      if (piece)
        colis = await Colis.findByPk(piece.colisId, { include: ColisService.INCLUDE_DETAIL });
    }
    if (!colis) throw new NotFoundError('Aucune expédition ne correspond à ce numéro');

    return { message: 'Expédition trouvée', colis };
  };

  /* ── Progression de l'acheminement ──────────────────────────────────────── */

  /**
   * Enregistre un événement d'acheminement.
   * C'est l'unique voie de modification du statut : elle garantit le respect de la
   * machine à états, la mise à jour des stocks et la notification du client.
   */
  static enregistrerEvenement = async (id, params, adminId) => {
    const colis = await Colis.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'email', 'prenom', 'notificationsEmail'] },
      ],
    });
    if (!colis) throw new NotFoundError('Expédition introuvable');

    // Le retrait en point suppose que le code remis au destinataire ait été contrôlé
    if (params.codeEvenement === 'RETIRE' && colis.codeRetrait) {
      if (!params.codeRetrait)
        throw new BadRequestError('Le code de retrait du destinataire est requis');
      if (String(params.codeRetrait) !== String(colis.codeRetrait)) {
        throw new BadRequestError('Code de retrait incorrect');
      }
    }

    return suiviService.enregistrerEvenement(colis, params, { auteurId: adminId });
  };

  /** Applique le même événement à une sélection de colis (traitement par lot). */
  static enregistrerEvenementEnLot = (colisIds, params, adminId) =>
    suiviService.enregistrerEvenementsEnLot(colisIds, params, { auteurId: adminId });

  /**
   * Corrige la pesée après contrôle en agence et recalcule le prix.
   *
   * L'écart entre le poids déclaré et le poids constaté est la principale source de
   * litige tarifaire : la correction est donc tracée, la facture régularisée et le
   * client averti dès que le montant change.
   */
  static corrigerPesee = async (id, { poidsVerifieKg, pieces, motif }, adminId) => {
    const colis = await ColisService.chargerColis(id, [
      { model: ServiceExpedition, as: 'service' },
      { model: ColisPiece, as: 'pieces' },
      { model: Facture, as: 'facture' },
      {
        model: User,
        as: 'client',
        attributes: ['id', 'email', 'prenom', 'remiseContractuelle', 'notificationsEmail'],
      },
    ]);
    if (colis.estTermine)
      throw new BadRequestError('Une expédition terminée ne peut plus être repesée');
    // Forfait ou prix sur devis : le poids ne fait pas le prix
    const modeTarification = colis.detailTarification?.modeTarification;
    if (modeTarification && modeTarification !== 'poids') {
      throw new BadRequestError(
        'Le prix de ce colis ne dépend pas du poids : ajustez-le par la validation ou la proposition tarifaire'
      );
    }
    if (colis.facture?.statut === 'payee') {
      throw new BadRequestError(
        'La facture est déjà réglée : passez par un avoir ou une facture complémentaire'
      );
    }

    const [villeDepart, villeArrivee, parametres] = await Promise.all([
      tarificationService.chargerVille(colis.villeDepartId, 'de départ'),
      tarificationService.chargerVille(colis.villeArriveeId, "d'arrivée"),
      parametreService.chargerTous(),
    ]);

    const piecesRetenues = pieces?.length
      ? pieces
      : (colis.pieces || []).map((p) => ({
          poidsKg: p.poidsKg,
          longueurCm: p.longueurCm,
          largeurCm: p.largeurCm,
          hauteurCm: p.hauteurCm,
        }));
    if (poidsVerifieKg && !pieces?.length && piecesRetenues.length === 1) {
      piecesRetenues[0].poidsKg = poidsVerifieKg;
    }

    const devis = await tarificationService.calculerDevis({
      service: colis.service,
      villeDepart,
      villeArrivee,
      categorie: colis.categorie,
      pieces: piecesRetenues,
      typeContenu: colis.typeContenu,
      valeurDeclaree: colis.valeurDeclaree,
      deviseValeur: colis.deviseValeur,
      assuranceSouscrite: colis.assuranceSouscrite,
      modeDepot: colis.modeDepot,
      modeLivraison: colis.modeLivraison,
      incoterm: colis.incoterm,
      payeur: colis.payeur,
      fragile: colis.fragile,
      marchandiseDangereuse: colis.marchandiseDangereuse,
      remiseContractuelle: Number(colis.client?.remiseContractuelle || 0),
      parametres,
    });

    const ancienMontant = Number(colis.montantTotal);

    await sequelize.transaction(async (t) => {
      if (pieces?.length) {
        const coefficient = Number(colis.service.coefficientVolumetrique);
        await ColisPiece.destroy({ where: { colisId: colis.id }, transaction: t });
        await ColisPiece.bulkCreate(
          pieces.map((p, i) => ({
            colisId: colis.id,
            numeroSuivi: `${colis.reference}-${String(i + 1).padStart(2, '0')}`,
            ordre: i + 1,
            designation: p.designation || null,
            typeEmballage: p.typeEmballage || 'carton',
            poidsKg: p.poidsKg,
            longueurCm: p.longueurCm || null,
            largeurCm: p.largeurCm || null,
            hauteurCm: p.hauteurCm || null,
            poidsVolumetriqueKg: tarificationService.poidsVolumetriquePiece(p, coefficient),
          })),
          { transaction: t }
        );
      }

      await colis.update(
        {
          nbPieces: piecesRetenues.length,
          poidsReelKg: devis.poids.poidsReelKg,
          poidsVolumetriqueKg: devis.poids.poidsVolumetriqueKg,
          poidsFactureKg: devis.poids.poidsFactureKg,
          poidsVerifieKg: poidsVerifieKg || devis.poids.poidsReelKg,
          montantFret: devis.montants.fret,
          montantSurcharges: devis.montants.surcharges,
          montantAssurance: devis.montants.assurance,
          montantTva: devis.montants.tva,
          montantDroitsDouane: devis.montants.droitsDouane,
          montantTotal: devis.montants.total,
          detailTarification: {
            ...colis.detailTarification,
            revision: {
              motif: motif || 'Correction après pesée en agence',
              ancienMontant,
              nouveauMontant: devis.montants.total,
              revisePar: adminId,
              revisele: new Date().toISOString(),
            },
            tarifApplique: devis.tarifApplique,
            surcharges: devis.detailSurcharges,
            montants: devis.montants,
          },
        },
        { transaction: t }
      );

      if (colis.facture && colis.facture.statut !== 'annulee') {
        await colis.facture.update(
          {
            montantFret: devis.montants.fret,
            montantSurcharges: devis.montants.surcharges,
            montantAssurance: devis.montants.assurance,
            montantDroitsDouane: devis.montants.droitsDouane,
            montantHt: devis.montants.totalHt,
            montantTva: devis.montants.tva,
            montantTotal: devis.montants.total,
            lignes: [
              {
                libelle: `Transport ${colis.service.nom} — ${devis.poids.poidsFactureKg} kg (poids vérifié)`,
                montant: devis.montants.fret,
              },
              ...devis.detailSurcharges.map((s) => ({ libelle: s.libelle, montant: s.montant })),
            ],
          },
          { transaction: t }
        );
      }
    });

    const ecart = Number((devis.montants.total - ancienMontant).toFixed(2));

    await SuiviColis.create({
      colisId: colis.id,
      codeEvenement: 'INFO',
      statut: colis.statut,
      libelle: 'Poids vérifié en agence',
      commentaire:
        `Poids facturé porté à ${devis.poids.poidsFactureKg} kg` +
        (ecart !== 0
          ? ` — montant ${ecart > 0 ? 'majoré' : 'réduit'} de ${Math.abs(ecart)} ${colis.devise}`
          : ''),
      dateEvenement: new Date(),
      visiblePublic: true,
      createdBy: adminId,
    });

    if (ecart !== 0) {
      await notificationService.notifier({
        userId: colis.userId,
        titre: `Colis ${colis.reference} — montant révisé`,
        message: `Après pesée, le montant passe de ${ancienMontant} à ${devis.montants.total} ${colis.devise}.`,
        type: 'paiement',
        niveau: 'alerte',
        entite: 'Colis',
        entiteId: colis.id,
        lienCible: `/colis/${colis.id}`,
      });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.colis.pesee',
      entite: 'Colis',
      entiteId: colis.id,
      details: { ancienMontant, nouveauMontant: devis.montants.total, ecart },
    });

    return { message: 'Pesée corrigée et tarification recalculée.', colis, devis, ecart };
  };

  /* ── Étude des demandes (catégories 2 et 3) ─────────────────────────────── */

  /**
   * Décompose un montant TTC arrêté par l'administrateur (prix ajusté ou
   * proposition tarifaire) en hors taxes et TVA, selon le pays de facturation.
   */
  static montantsDepuisTtc = (colis, montantTotal, parametres, { forfaitGlobal = false } = {}) => {
    const devise = colis.devise;
    const paysFacturation = colis.payeur === 'destinataire' ? colis.paysArrivee : colis.paysDepart;
    const tauxTva = Number(paysFacturation === 'FR' ? parametres.tva_fr : parametres.tva_sn);
    const droits = Number(colis.montantDroitsDouane || 0);
    const total = arrondir(montantTotal, devise);
    const ht = arrondir((total - droits) / (1 + tauxTva / 100), devise);
    const tva = arrondir(total - droits - ht, devise);
    const surcharges = forfaitGlobal ? 0 : Number(colis.montantSurcharges || 0);
    const assurance = forfaitGlobal ? 0 : Number(colis.montantAssurance || 0);
    const fret = arrondir(Math.max(0, ht - surcharges - assurance), devise);
    return {
      colonnes: {
        montantFret: fret,
        montantSurcharges: surcharges,
        montantAssurance: assurance,
        montantTva: tva,
        montantTotal: total,
      },
      montants: {
        fret,
        surcharges,
        assurance,
        totalHt: ht,
        tauxTva,
        tva,
        droitsDouane: droits,
        creditParrainage: 0,
        creditParrainageHt: 0,
        total,
      },
    };
  };

  static chargerDemandeAEtudier = async (id, statutsAutorises = ['en_attente_validation']) => {
    const colis = await Colis.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'email', 'prenom', 'notificationsEmail'] },
        { model: PointCollecte, as: 'pointCollecteDepart', attributes: ['id', 'nom', 'adresse'] },
      ],
    });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (!statutsAutorises.includes(colis.statut)) {
      throw new BadRequestError(`Cette demande n'est pas à l'étude (statut : ${colis.statut})`);
    }
    return colis;
  };

  /** Date prévue d'enlèvement renseignée par l'administrateur avant la tournée. */
  static fixerDatePrevueEnlevement = async (colis, date) => {
    if (!date) return;
    await colis.update({ infosCollecte: { ...(colis.infosCollecte || {}), datePrevue: date } });
    await DemandeEnlevement.update(
      { dateSouhaitee: date },
      { where: { colisId: colis.id, statut: { [Op.in]: ['demande', 'planifie'] } } }
    );
  };

  /**
   * Valide une demande de catégorie 2. Un prix « à partir de » peut être ajusté à
   * cette occasion ; la facture sera émise à la réception du colis.
   */
  static validerDemande = async (
    id,
    { montantTotal, commentaire, datePrevueEnlevement },
    adminId
  ) => {
    const colis = await ColisService.chargerDemandeAEtudier(id);
    if (colis.categorie === 'colis_xxl') {
      throw new BadRequestError('Un colis XXL se valide par une proposition tarifaire');
    }
    const parametres = await parametreService.chargerTous();

    const maj = { valideAt: new Date(), validePar: adminId };
    if (montantTotal) {
      const { colonnes, montants } = ColisService.montantsDepuisTtc(
        colis,
        montantTotal,
        parametres
      );
      Object.assign(maj, colonnes, {
        detailTarification: {
          ...colis.detailTarification,
          montants,
          ajustement: {
            ancienMontant: Number(colis.montantTotal),
            nouveauMontant: montants.total,
            par: adminId,
            le: new Date().toISOString(),
          },
        },
      });
    }
    await colis.update(maj);
    await ColisService.fixerDatePrevueEnlevement(colis, datePrevueEnlevement);

    await suiviService.enregistrerEvenement(
      colis,
      { codeEvenement: 'VALIDE', commentaire: commentaire || null },
      { auteurId: adminId }
    );

    const consigne = ColisService.consigneRemise(colis, parametres, datePrevueEnlevement);
    if (colis.client?.email) {
      await envoyerModele('demande_validee', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        montant: formater(colis.montantTotal, colis.devise),
        instructions: [commentaire, consigne].filter(Boolean).join(' '),
        lien: URL_PUBLIQUE ? `${URL_PUBLIQUE}/suivi/${colis.reference}` : null,
      });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.colis.valider',
      entite: 'Colis',
      entiteId: colis.id,
      details: { montant: colis.montantTotal },
    });
    return { message: 'Demande validée, le client est prévenu.', colis };
  };

  /** Consigne de remise du colis communiquée au client après validation. */
  static consigneRemise = (colis, parametres, datePrevue = null) => {
    if (colis.modeDepot === 'enlevement_domicile') {
      const date = datePrevue || colis.infosCollecte?.datePrevue;
      return date
        ? `Collecte à domicile prévue le ${date}.`
        : 'Nous vous communiquerons la date de collecte.';
    }
    if (colis.modeDepot === 'point_collecte' && colis.pointCollecteDepart) {
      return `Déposez votre colis au point « ${colis.pointCollecteDepart.nom} » (${colis.pointCollecteDepart.adresse}).`;
    }
    const adresse =
      colis.paysDepart === 'SN' ? parametres.adresse_reception_sn : parametres.adresse_reception_fr;
    const ligne = [adresse?.nom, adresse?.adresse, adresse?.codePostal, adresse?.ville]
      .filter(Boolean)
      .join(', ');
    return ligne ? `Adresse de réception : ${ligne}.` : '';
  };

  /** Refus d'une demande à l'étude (ou retrait d'une proposition non acceptée). */
  static refuserDemande = async (id, { motif }, adminId) => {
    const colis = await ColisService.chargerDemandeAEtudier(id, [
      'en_attente_validation',
      'devis_propose',
    ]);
    await colis.update({ motifRefus: motif, validePar: adminId });
    await suiviService.enregistrerEvenement(
      colis,
      { codeEvenement: 'DEMANDE_REFUSEE', commentaire: motif, motif },
      { auteurId: adminId }
    );
    await require('../client/colis.service').liberRessources(colis);

    if (colis.client?.email) {
      await envoyerModele('demande_refusee', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        motif,
      });
    }
    await logActivity({
      userId: adminId,
      action: 'admin.colis.refuser',
      entite: 'Colis',
      entiteId: colis.id,
      details: { motif },
    });
    return { message: 'Demande refusée, le client est prévenu.', colis };
  };

  /**
   * Proposition tarifaire d'un colis XXL, envoyée par email et notification avec
   * le tarif, les conditions et le lien pour l'accepter. Une nouvelle proposition
   * remplace la précédente tant que le client n'a pas répondu.
   */
  static proposerTarif = async (
    id,
    { montantTotal, commentaire, validiteJours, datePrevueEnlevement },
    adminId
  ) => {
    const colis = await ColisService.chargerDemandeAEtudier(id, [
      'en_attente_validation',
      'devis_propose',
    ]);
    const parametres = await parametreService.chargerTous();
    const { colonnes, montants } = ColisService.montantsDepuisTtc(colis, montantTotal, parametres, {
      forfaitGlobal: true,
    });
    const duree = Number(validiteJours || parametres.delai_validite_proposition_jours || 7);
    const expireAt = new Date(Date.now() + duree * 24 * 3600 * 1000);

    await colis.update({
      ...colonnes,
      montantPropose: montants.total,
      propositionCommentaire: commentaire || null,
      propositionAt: new Date(),
      propositionExpireAt: expireAt,
      propositionRepondueAt: null,
      validePar: adminId,
      valideAt: new Date(),
      detailTarification: {
        ...colis.detailTarification,
        modeTarification: 'sur_devis',
        montants,
        proposition: { montant: montants.total, commentaire, par: adminId, le: new Date() },
      },
    });
    await ColisService.fixerDatePrevueEnlevement(colis, datePrevueEnlevement);

    await suiviService.enregistrerEvenement(
      colis,
      {
        codeEvenement: 'DEVIS_PROPOSE',
        commentaire: `Proposition : ${formater(montants.total, colis.devise)}`,
      },
      { auteurId: adminId }
    );

    if (colis.client?.email) {
      await envoyerModele('proposition_tarifaire', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        montant: formater(montants.total, colis.devise),
        commentaire: commentaire || '',
        conditions: [
          ColisService.consigneRemise(colis, parametres, datePrevueEnlevement),
          parametres.lien_cgv ? `Conditions générales : ${parametres.lien_cgv}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        dateExpiration: expireAt.toISOString().slice(0, 10),
        lien: URL_PUBLIQUE ? `${URL_PUBLIQUE}/colis/${colis.id}` : null,
      });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.colis.proposition',
      entite: 'Colis',
      entiteId: colis.id,
      details: { montant: montants.total, validiteJours: duree },
    });
    return { message: 'Proposition tarifaire envoyée au client.', colis };
  };

  /** Met à jour les données descriptives d'une expédition, hors statut et montants. */
  static updateColis = async (id, data, adminId) => {
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.estTermine)
      throw new BadRequestError('Une expédition terminée ne peut plus être modifiée');

    await colis.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.colis.update',
      entite: 'Colis',
      entiteId: colis.id,
      details: { champs: Object.keys(data) },
    });
    return { message: 'Expédition mise à jour.', colis };
  };

  /**
   * Réaffecte le point de retrait d'une expédition.
   * Utile quand le point initial est saturé, fermé, ou à la demande du destinataire.
   */
  static changerPointRetrait = async (id, pointRetraitId, adminId, motif = null) => {
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.estTermine)
      throw new BadRequestError('Une expédition terminée ne peut plus être réaffectée');

    const point = await PointCollecte.findByPk(pointRetraitId);
    if (!point) throw new BadRequestError('Point de retrait introuvable');
    if (!point.isActive) throw new BadRequestError('Ce point de retrait est désactivé');
    if (point.pays !== colis.paysArrivee) {
      throw new BadRequestError(
        `Le point de retrait doit se situer en ${PAYS[colis.paysArrivee]?.libelle}`
      );
    }
    if (!point.offreService('retrait'))
      throw new BadRequestError("Ce point n'assure pas le retrait de colis");

    const ancien = colis.pointRetraitId;
    await colis.update({ pointRetraitId, modeLivraison: 'point_retrait' });

    await SuiviColis.create({
      colisId: colis.id,
      codeEvenement: 'INFO',
      statut: colis.statut,
      libelle: 'Point de retrait modifié',
      lieu: point.nom,
      pays: point.pays,
      pointCollecteId: point.id,
      commentaire: motif || `Nouveau point de retrait : ${point.nom}`,
      createdBy: adminId,
    });

    await notificationService.notifier({
      userId: colis.userId,
      titre: `Colis ${colis.reference} — point de retrait modifié`,
      message: `Votre colis sera désormais à retirer au point « ${point.nom} ».`,
      type: 'colis',
      entite: 'Colis',
      entiteId: colis.id,
      lienCible: `/colis/${colis.id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.colis.point_retrait',
      entite: 'Colis',
      entiteId: colis.id,
      details: { ancien, nouveau: pointRetraitId },
    });

    return { message: `Point de retrait remplacé par « ${point.nom} ».`, colis };
  };

  /** Affecte un coursier à l'enlèvement ou à la distribution. */
  static affecterCoursier = async (id, { coursierId, mission }, adminId) => {
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');

    const coursier = await User.findByPk(coursierId);
    if (!coursier) throw new BadRequestError('Coursier introuvable');
    if (coursier.role !== 'coursier')
      throw new BadRequestError("L'utilisateur désigné n'est pas un coursier");
    if (!coursier.isActive) throw new BadRequestError('Ce compte coursier est désactivé');

    const paysMission = mission === 'enlevement' ? colis.paysDepart : colis.paysArrivee;
    if (coursier.pays !== paysMission) {
      throw new BadRequestError(`Le coursier doit opérer en ${PAYS[paysMission]?.libelle}`);
    }

    await colis.update(
      mission === 'enlevement'
        ? { coursierEnlevementId: coursierId }
        : { coursierLivraisonId: coursierId }
    );

    await notificationService.notifier({
      userId: coursierId,
      titre: `Nouvelle mission — ${colis.reference}`,
      message:
        mission === 'enlevement'
          ? `Enlèvement à effectuer : ${colis.adresseDepart || 'adresse au dossier'}`
          : `Livraison à effectuer : ${colis.adresseLivraison || 'adresse au dossier'}`,
      type: 'colis',
      entite: 'Colis',
      entiteId: colis.id,
      lienCible: `/coursier/missions/${colis.id}`,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.colis.affecter_coursier',
      entite: 'Colis',
      entiteId: colis.id,
      details: { coursierId, mission },
    });

    return { message: `Coursier affecté à la mission de ${mission}.`, colis };
  };

  /** Régénère le code de retrait, par exemple lorsque le destinataire l'a perdu. */
  static regenererCodeRetrait = async (id, adminId) => {
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.estTermine) throw new BadRequestError('Cette expédition est déjà clôturée');

    const code = genererCodeRetrait();
    await colis.update({ codeRetrait: code });

    await notificationService.notifier({
      userId: colis.userId,
      titre: `Colis ${colis.reference} — nouveau code de retrait`,
      message: `Votre nouveau code de retrait est ${code}.`,
      type: 'colis',
      niveau: 'alerte',
      entite: 'Colis',
      entiteId: colis.id,
    });

    await logActivity({
      userId: adminId,
      action: 'admin.colis.code_retrait',
      entite: 'Colis',
      entiteId: colis.id,
    });
    return {
      message: 'Nouveau code de retrait généré et communiqué au client.',
      codeRetrait: code,
    };
  };

  static ajouterNoteInterne = async (id, note, adminId) => {
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');

    await SuiviColis.create({
      colisId: colis.id,
      codeEvenement: 'INFO',
      statut: colis.statut,
      libelle: 'Note interne',
      commentaire: note,
      visiblePublic: false,
      createdBy: adminId,
    });

    return { message: 'Note interne ajoutée au dossier.' };
  };

  static ajouterPhotos = async (id, files = [], adminId) => {
    if (!files.length) throw new BadRequestError('Aucune photo fournie');
    const colis = await Colis.findByPk(id);
    if (!colis) throw new NotFoundError('Expédition introuvable');

    const televerses = await Promise.all(
      files.map((f) => uploadToCloudinary(f.buffer, { folder: 'yobnate-express/colis' }))
    );
    await colis.update({ photos: [...colis.photos, ...televerses] });
    await logActivity({
      userId: adminId,
      action: 'admin.colis.photos',
      entite: 'Colis',
      entiteId: colis.id,
    });

    return { message: `${televerses.length} photo(s) ajoutée(s).`, colis };
  };

  /* ── Documents ──────────────────────────────────────────────────────────── */

  static getEtiquettes = async (id) => {
    const colis = await ColisService.chargerColis(id, [
      ...ColisService.INCLUDE_LISTE,
      { model: ColisPiece, as: 'pieces' },
      { model: PointCollecte, as: 'pointRetrait' },
    ]);
    return {
      html: documents.genererEtiquettes(colis, colis.pieces || [], colis.pointRetrait),
      nomFichier: `etiquettes-${colis.reference}.html`,
    };
  };

  static getBordereau = async (id) => {
    const colis = await ColisService.chargerColis(id, [
      ...ColisService.INCLUDE_LISTE,
      { model: PointCollecte, as: 'pointCollecteDepart' },
    ]);
    const parametres = await parametreService.chargerTous();
    return {
      html: documents.genererBordereauDepot(colis, colis.pointCollecteDepart, parametres),
      nomFichier: `bordereau-${colis.reference}.html`,
    };
  };

  /* ── Statistiques et export ─────────────────────────────────────────────── */

  /**
   * Un seul parcours de la table (GROUPING SETS) au lieu de quatre agrégats lancés en
   * parallèle, qui lisaient chacun toute la sélection et occupaient quatre connexions
   * du pool pour une seule requête HTTP. Résultat mis en cache 30 s par jeu de filtres.
   */
  static getStatistiques = (filters = {}) =>
    cache.memoiser(`colis:stats:${JSON.stringify(filters)}`, 30 * 1000, () =>
      ColisService.calculerStatistiques(filters)
    );

  static calculerStatistiques = async (filters) => {
    const where = ColisService.construireFiltres(filters);
    const col = (nom) => sequelize.col(`Colis.${nom}`);
    const lignes = await Colis.findAll({
      where,
      attributes: [
        'statut',
        'serviceId',
        'paysDepart',
        'paysArrivee',
        [sequelize.literal('GROUPING("Colis"."statut")'), 'gStatut'],
        [sequelize.literal('GROUPING("Colis"."serviceId")'), 'gService'],
        [sequelize.literal('GROUPING("Colis"."paysDepart", "Colis"."paysArrivee")'), 'gCorridor'],
        [sequelize.fn('COUNT', col('id')), 'total'],
        [sequelize.fn('SUM', col('montantTotal')), 'chiffreAffaires'],
        [sequelize.fn('SUM', col('poidsFactureKg')), 'poids'],
        [sequelize.fn('AVG', col('montantTotal')), 'panierMoyen'],
      ],
      group: [
        sequelize.literal(
          'GROUPING SETS (("Colis"."statut"), ("Colis"."serviceId"), ' +
            '("Colis"."paysDepart", "Colis"."paysArrivee"), ())'
        ),
      ],
      raw: true,
    });

    // GROUPING(x) = 0 : la ligne est agrégée par x ; les autres colonnes valent NULL
    const parStatut = lignes.filter((l) => Number(l.gStatut) === 0);
    const parCorridor = lignes.filter((l) => Number(l.gCorridor) === 0);
    const lignesService = lignes.filter((l) => Number(l.gService) === 0);
    // Ligne du total général : agrégée par aucun regroupement (GROUPING ≠ 0 partout)
    const totaux =
      lignes.find((l) => [l.gStatut, l.gService, l.gCorridor].every((g) => Number(g) !== 0)) || {};
    const services = await ServiceExpedition.findAll({
      where: { id: lignesService.map((l) => l.serviceId) },
      attributes: ['id', 'nom'],
      raw: true,
    });
    const nomService = Object.fromEntries(services.map((sv) => [sv.id, sv.nom]));
    const comptes = Object.fromEntries(parStatut.map((r) => [r.statut, Number(r.total)]));

    return {
      message: 'Statistiques des expéditions',
      statistiques: {
        total: Number(totaux?.total || 0),
        chiffreAffaires: Number(totaux?.chiffreAffaires || 0),
        poidsTotalKg: Number(totaux?.poids || 0),
        panierMoyen: Number(Number(totaux?.panierMoyen || 0).toFixed(2)),
        parStatut: STATUTS_COLIS.map((statut) => ({ statut, total: comptes[statut] || 0 })),
        parService: lignesService.map((r) => ({
          service: nomService[r.serviceId] || 'Inconnu',
          total: Number(r.total),
        })),
        parCorridor: parCorridor.map((r) => ({
          corridor: `${r.paysDepart} vers ${r.paysArrivee}`,
          total: Number(r.total),
          poidsKg: Number(r.poids || 0),
        })),
      },
    };
  };

  static COLONNES_EXPORT = [
    { cle: 'reference', libelle: 'N° de suivi' },
    { cle: 'createdAt', libelle: 'Date de création', transforme: (v) => documents.dateHeureFr(v) },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'categorie', libelle: 'Catégorie' },
    { cle: 'etatMarchandise', libelle: 'État' },
    { cle: 'description', libelle: 'Contenu' },
    { cle: 'service.nom', libelle: 'Service' },
    { cle: 'expediteurNom', libelle: 'Expéditeur' },
    { cle: 'villeDepart.nom', libelle: 'Ville de départ' },
    { cle: 'paysDepart', libelle: 'Pays de départ' },
    { cle: 'destinataireNom', libelle: 'Destinataire' },
    { cle: 'villeArrivee.nom', libelle: "Ville d'arrivée" },
    { cle: 'paysArrivee', libelle: "Pays d'arrivée" },
    { cle: 'nbPieces', libelle: 'Pièces' },
    { cle: 'poidsFactureKg', libelle: 'Poids facturé (kg)' },
    { cle: 'montantTotal', libelle: 'Montant' },
    { cle: 'devise', libelle: 'Devise' },
    { cle: 'dateLivraisonEstimee', libelle: 'Livraison estimée' },
    {
      cle: 'dateLivraisonEffective',
      libelle: 'Livraison effective',
      transforme: (v) => (v ? documents.dateHeureFr(v) : ''),
    },
  ];

  /** Export CSV de la sélection courante, plafonné pour rester exploitable. */
  static exporterCsv = async (filters = {}) => {
    const colis = await Colis.findAll({
      where: ColisService.construireFiltres(filters),
      include: ColisService.INCLUDE_LISTE,
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    return {
      contenu: versCsv(
        colis.map((c) => c.toJSON()),
        ColisService.COLONNES_EXPORT
      ),
      nomFichier: `expeditions-${new Date().toISOString().slice(0, 10)}.csv`,
      total: colis.length,
    };
  };

  /** Codes d'événements disponibles, pour alimenter les listes du back-office. */
  static getCodesEvenements = () => ({
    message: "Codes d'événements de suivi",
    evenements: Object.entries(EVENEMENTS_SUIVI).map(([code, def]) => ({
      code,
      libelle: def.libelle,
      statutInduit: def.statut,
    })),
  });
}

module.exports = ColisService;
