const { Op } = require('sequelize');
const {
  sequelize,
  Colis,
  ColisPiece,
  SuiviColis,
  Facture,
  Ville,
  ServiceExpedition,
  PointCollecte,
  DeclarationDouane,
  ArticleDouane,
  User,
  Paiement,
  PreuveLivraison,
  Emballage,
  TourneeCollecte,
  DemandeEnlevement,
} = require('../../../models');
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../../errors/AppError');
const { paginate, paginateResult, listerPagine } = require('../../../utils/paginate');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../../../infrastructure/uploadService');
const { formater } = require('../../../utils/devise');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const suiviService = require('./suivi.service');
const ColisDeclarationService = require('./colisDeclaration.service');
const notificationService = require('../../notification/service/notification.service');
const parametreService = require('../../parametre/service/parametre.service');
const facturationService = require('../../facture/service/facturation.service');
const documents = require('../../../templates/documents');

/**
 * Espace client : consultation et suivi des expéditions, actions du client
 * (annulation, réponse à une proposition, modifications) et documents.
 * La déclaration et le devis sont dans colisDeclaration.service.js.
 */

class ColisService {
  static INCLUDE_LISTE = [
    { model: Ville, as: 'villeDepart', attributes: ['id', 'nom', 'pays'] },
    { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom', 'pays'] },
    {
      model: ServiceExpedition,
      as: 'service',
      attributes: ['id', 'code', 'nom', 'modeTransport'],
    },
  ];

  /**
   * Relations « 1-N » chargées séparément (separate) : jointes, elles multipliaient les
   * lignes (pièces × paiements × articles) — 1 686 ms → 32 ms pour un colis de 10 pièces.
   */
  static INCLUDE_DETAIL = [
    ...ColisService.INCLUDE_LISTE,
    { model: ColisPiece, as: 'pieces', separate: true, order: [['ordre', 'ASC']] },
    {
      model: PointCollecte,
      as: 'pointCollecteDepart',
      attributes: ['id', 'code', 'nom', 'adresse', 'telephone', 'horaires'],
    },
    {
      model: PointCollecte,
      as: 'pointRetrait',
      attributes: ['id', 'code', 'nom', 'adresse', 'telephone', 'horaires'],
    },
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
      attributes: ['id', 'reference', 'titre', 'dateCollecte', 'heureDebut', 'heureFin'],
    },
    {
      model: DemandeEnlevement,
      as: 'enlevement',
      attributes: ['id', 'reference', 'statut', 'dateSouhaitee', 'creneau', 'datePlanifiee'],
    },
  ];

  /* ── Consultation ───────────────────────────────────────────────────────── */

  static getMesExpeditions = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.categorie) where.categorie = filters.categorie;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
    if (filters.enCours === 'true' || filters.enCours === true) {
      where.statut = { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule', 'refuse'] };
    }
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await listerPagine(Colis, {
      where,
      include: ColisService.INCLUDE_LISTE,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      message: 'Vos expéditions',
      colis: rows.map((c) => ({ ...c.toJSON(), enRetard: c.estEnRetard })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  /**
   * Champs d'un colis reçu visibles du destinataire. Le rapprochement se fait
   * par numéro de téléphone, que le compte peut déclarer sans le prouver : le
   * code de retrait, les adresses, les montants et les pièces jointes de
   * l'expéditeur ne sont donc pas exposés ici.
   */
  static ATTRIBUTS_RECEPTION = [
    'id',
    'reference',
    'statut',
    'categorie',
    'expediteurNom',
    'destinataireNom',
    'paysDepart',
    'paysArrivee',
    'modeLivraison',
    'nbPieces',
    'dateLivraisonEstimee',
    'createdAt',
    'updatedAt',
  ];

  /**
   * Expéditions dont l'utilisateur connecté est le destinataire (rapprochement
   * par numéro de téléphone, aucun lien `userId` n'existe côté destinataire).
   */
  static getMesReceptions = async (userId, filters = {}, pagination = {}) => {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'telephone', 'telephoneVerifie'],
    });
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    const { verification_telephone_obligatoire: verificationExigee } =
      await parametreService.chargerTous();
    if (verificationExigee && !user.telephoneVerifie) {
      throw new ForbiddenError(
        'Vérifiez votre numéro de téléphone pour consulter les colis qui vous sont adressés'
      );
    }
    const where = { destinataireTelephone: user.telephone };
    if (filters.statut) where.statut = filters.statut;
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await listerPagine(Colis, {
      where,
      attributes: ColisService.ATTRIBUTS_RECEPTION,
      include: ColisService.INCLUDE_LISTE,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      message: 'Colis reçus',
      colis: rows.map((c) => ({ ...c.toJSON(), enRetard: c.estEnRetard })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static chargerExpeditionDuClient = async (
    userId,
    colisId,
    include = ColisService.INCLUDE_DETAIL
  ) => {
    const colis = await Colis.findOne({
      where: { id: colisId, userId },
      include,
      // Simple contrôle de propriété : inutile de rapatrier la ligne complète
      ...(include.length ? {} : { attributes: ['id'] }),
    });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    return colis;
  };

  static getExpeditionById = async (userId, colisId) => {
    const colis = await ColisService.chargerExpeditionDuClient(userId, colisId);
    const parametres = await parametreService.chargerTous();
    return {
      message: "Détail de l'expédition",
      colis: {
        ...colis.toJSON(),
        regles: colis.regles,
        enRetard: colis.estEnRetard,
        estInternational: colis.estInternational,
        modifiable: colis.modifiableParClient,
        transitionsPossibles: colis.transitionsPossibles,
        lienPaiement:
          colis.facture && !['payee', 'annulee'].includes(colis.facture.statut)
            ? facturationService.lienPaiement(colis.facture, parametres)
            : null,
        adresseReception: ['envoi_postal', 'point_collecte'].includes(colis.modeDepot)
          ? ColisDeclarationService.adresseReception(colis.paysDepart, parametres)
          : null,
      },
    };
  };

  static getSuivi = async (userId, colisId) => {
    await ColisService.chargerExpeditionDuClient(userId, colisId, []);
    return suiviService.getHistorique(colisId, { inclureInternes: false });
  };

  /* ── Actions du client ──────────────────────────────────────────────────── */

  /**
   * Charge l'expédition sous verrou de ligne (SELECT … FOR UPDATE) dans la
   * transaction : les actions concurrentes sur un même colis (double clic,
   * annulation client pendant un refus admin) s'exécutent l'une après l'autre
   * et la seconde constate l'état laissé par la première.
   */
  static verrouiller = async (colisId, transaction, where = {}) => {
    const colis = await Colis.findOne({
      where: { id: colisId, ...where },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    return colis;
  };

  /**
   * Restitue ce qu'une demande avait réservé : crédit de parrainage, place dans
   * la tournée de collecte, stock d'emballages.
   */
  static liberRessources = async (colis, transaction = null) => {
    // Première expédition d'un filleul annulée : bonus et récompense du parrain sont repris
    if (Number(colis.detailTarification?.montants?.remiseParrainage || 0) > 0) {
      const [filleul, parametres] = await Promise.all([
        User.findByPk(colis.userId, { attributes: ['id', 'parrainId'], transaction }),
        parametreService.chargerTous(),
      ]);
      if (filleul?.parrainId) {
        // Reprise atomique (et non lecture puis écriture) : un crédit concurrent n'est pas perdu
        const gain = Number(parametres.parrainage_gain_parrain_eur || 0);
        await User.update(
          { creditParrainage: sequelize.literal(`GREATEST(0, "creditParrainage" - ${gain})`) },
          { where: { id: filleul.parrainId }, transaction }
        );
        await filleul.update({ parrainageRecompense: false }, { transaction });
      }
    }
    if (Number(colis.creditParrainageUtilise) > 0) {
      await User.increment('creditParrainage', {
        by: Number(colis.creditParrainageUtilise),
        where: { id: colis.userId },
        transaction,
      });
      await colis.update({ creditParrainageUtilise: 0 }, { transaction });
    }
    if (colis.tourneeCollecteId) {
      await TourneeCollecte.decrement('nbInscrits', {
        by: 1,
        where: { id: colis.tourneeCollecteId, nbInscrits: { [Op.gt]: 0 } },
        transaction,
      });
    }
    for (const achat of colis.emballages || []) {
      await Emballage.increment('stock', {
        by: achat.quantite,
        where: { id: achat.emballageId, stock: { [Op.ne]: null } },
        transaction,
      });
    }
    await DemandeEnlevement.update(
      { statut: 'annule', motifEchec: 'Expédition annulée' },
      {
        where: { colisId: colis.id, statut: { [Op.in]: ['demande', 'planifie'] } },
        transaction,
      }
    );
  };

  /**
   * Annule une expédition.
   * L'annulation n'est possible que tant que le colis n'a pas été confié au réseau ;
   * au-delà, elle relève d'une demande de retour traitée par le service client.
   */
  static STATUTS_ANNULABLES = [
    'brouillon',
    'en_attente_validation',
    'devis_propose',
    'en_attente',
    'enlevement_planifie',
  ];

  /**
   * Annulation atomique : statut, restitution des ressources et annulation de
   * la facture réussissent ou échouent ensemble.
   *
   * Une expédition déjà (partiellement) réglée n'est pas annulable en libre
   * service : passer une facture payée à « annulée » effacerait la trace du
   * règlement sans remboursement. Le service client annule alors et rembourse
   * (avoir / remboursement du back-office). Les factures sont lues sous verrou,
   * ce qui ordonne l'annulation avec un encaissement simultané.
   */
  static annulerExpedition = async (userId, colisId, motif) => {
    const colis = await sequelize.transaction(async (t) => {
      const verrouille = await ColisService.verrouiller(colisId, t, { userId });
      if (!ColisService.STATUTS_ANNULABLES.includes(verrouille.statut)) {
        throw new BadRequestError(
          'Cette expédition est déjà prise en charge : contactez le service client pour demander un retour'
        );
      }

      const factures = await Facture.findAll({
        where: { colisId: verrouille.id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (factures.some((f) => Number(f.montantPaye) > 0)) {
        throw new ConflictError(
          'Un règlement a déjà été reçu pour cette expédition : contactez le service client, qui procédera à l’annulation et au remboursement'
        );
      }

      await ColisService.liberRessources(verrouille, t);
      await Facture.update(
        { statut: 'annulee' },
        { where: { colisId: verrouille.id }, transaction: t }
      );
      await suiviService.enregistrerEvenement(
        verrouille,
        { codeEvenement: 'ANNULE', commentaire: motif || 'Annulée par le client', motif },
        { auteurId: userId, transaction: t }
      );
      return verrouille;
    });

    return {
      message: 'Expédition annulée. La facture associée, le cas échéant, est annulée.',
      colis,
    };
  };

  /**
   * Catégorie 3 : le client accepte la proposition tarifaire. La demande passe en
   * attente de remise du colis, et la facture est émise avec son lien de paiement.
   */
  static accepterProposition = async (userId, colisId) => {
    // Acceptation et facture sont indissociables : une seule facture, même en cas de double envoi
    const { colis, facture } = await sequelize.transaction(async (t) => {
      const verrouille = await ColisService.verrouiller(colisId, t, { userId });
      if (verrouille.statut !== 'devis_propose') {
        throw new BadRequestError(
          "Aucune proposition tarifaire n'est en attente pour cette demande"
        );
      }
      if (verrouille.propositionExpireAt && new Date(verrouille.propositionExpireAt) < new Date()) {
        throw new BadRequestError(
          'Cette proposition a expiré : contactez-nous pour en obtenir une nouvelle'
        );
      }

      await verrouille.update({ propositionRepondueAt: new Date() }, { transaction: t });
      await suiviService.enregistrerEvenement(
        verrouille,
        {
          codeEvenement: 'DEVIS_ACCEPTE',
          commentaire: `Montant accepté : ${formater(verrouille.montantTotal, verrouille.devise)}`,
        },
        { auteurId: userId, transaction: t }
      );
      const emission = await facturationService.emettreFactureColis(verrouille, {
        auteurId: userId,
        transaction: t,
      });
      return { colis: verrouille, facture: emission.facture };
    });

    const lienPaiement = await facturationService.envoyerLienPaiement(colis, facture);

    await logActivity({
      userId,
      action: 'colis.proposition.accepter',
      entite: 'Colis',
      entiteId: colis.id,
      details: { montant: colis.montantTotal },
    });
    return {
      message: 'Proposition acceptée. Vous pouvez procéder au paiement.',
      colis,
      facture,
      lienPaiement,
    };
  };

  static refuserProposition = async (userId, colisId, motif = null) => {
    const colis = await sequelize.transaction(async (t) => {
      const verrouille = await ColisService.verrouiller(colisId, t, { userId });
      if (verrouille.statut !== 'devis_propose') {
        throw new BadRequestError(
          "Aucune proposition tarifaire n'est en attente pour cette demande"
        );
      }

      await verrouille.update(
        { propositionRepondueAt: new Date(), motifRefus: motif || null },
        { transaction: t }
      );
      await ColisService.liberRessources(verrouille, t);
      await suiviService.enregistrerEvenement(
        verrouille,
        {
          codeEvenement: 'DEVIS_REFUSE',
          commentaire: motif || 'Proposition déclinée par le client',
        },
        { auteurId: userId, transaction: t }
      );
      return verrouille;
    });

    await notificationService.notifierAdmins({
      titre: `Proposition déclinée — ${colis.reference}`,
      message: motif || 'Le client a décliné la proposition tarifaire.',
      type: 'colis',
      entite: 'Colis',
      entiteId: colis.id,
      lienCible: `/admin/colis/${colis.id}`,
    });
    return { message: 'Proposition déclinée. Votre demande est clôturée.', colis };
  };

  /** Champs que le client peut corriger tant que le colis n'est pas arrivé au Sénégal. */
  static CHAMPS_MODIFIABLES = [
    'description',
    'destinataireNom',
    'destinataireTelephone',
    'destinataireEmail',
    'adresseLivraison',
    'codePostalArrivee',
    'instructionsLivraison',
    'destinataireQuartier',
    'destinataireArrondissement',
    'destinataireDepartement',
    'destinatairePointRepere',
  ];

  /**
   * Modification de la demande par le client (également possible par WhatsApp,
   * via le back-office) avant l'arrivée de la marchandise au Sénégal.
   */
  static modifierExpedition = async (userId, colisId, data) => {
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (!colis.modifiableParClient) {
      throw new BadRequestError(
        'Votre colis est déjà arrivé au Sénégal : contactez le service client pour toute modification'
      );
    }

    const maj = Object.fromEntries(
      Object.entries(data).filter(([cle]) => ColisService.CHAMPS_MODIFIABLES.includes(cle))
    );
    if (!Object.keys(maj).length) throw new BadRequestError('Aucune modification fournie');

    // L'adresse sénégalaise détaillée reste obligatoire après modification
    if (colis.regles.adresseSenegalDetaillee && colis.paysArrivee === 'SN') {
      const vides = [
        'destinataireQuartier',
        'destinataireArrondissement',
        'destinataireDepartement',
        'destinatairePointRepere',
      ].filter((c) => c in maj && !String(maj[c] || '').trim());
      if (vides.length) {
        throw new BadRequestError(
          "Le quartier, l'arrondissement, le département et le point de repère restent obligatoires"
        );
      }
    }

    await colis.update(maj);
    await SuiviColis.create({
      colisId: colis.id,
      codeEvenement: 'INFO',
      statut: colis.statut,
      libelle: 'Demande modifiée par le client',
      commentaire: `Champs modifiés : ${Object.keys(maj).join(', ')}`,
      visiblePublic: false,
      createdBy: userId,
    });
    await logActivity({
      userId,
      action: 'colis.update',
      entite: 'Colis',
      entiteId: colis.id,
      details: { champs: Object.keys(maj) },
    });
    return { message: 'Votre demande a été mise à jour.', colis };
  };

  static ajouterPhotos = async (userId, colisId, files = []) => {
    if (!files.length) throw new BadRequestError('Aucune photo fournie');
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.photos.length + files.length > 10) {
      throw new BadRequestError('Une expédition ne peut pas porter plus de 10 photos');
    }

    const televerses = await Promise.all(
      files.map((f) => uploadToCloudinary(f.buffer, { folder: 'yobnate-express/colis' }))
    );
    await colis.update({ photos: [...colis.photos, ...televerses] });
    return { message: `${televerses.length} photo(s) ajoutée(s).`, colis };
  };

  /** Dépose (ou remplace) le message vocal descriptif de la demande. */
  static deposerVocal = async (userId, colisId, fichier) => {
    if (!fichier) throw new BadRequestError('Aucun message vocal fourni');
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.estTermine) throw new BadRequestError('Cette expédition est clôturée');

    const vocal = await uploadToCloudinary(fichier.buffer, {
      folder: 'yobnate-express/vocaux',
      resourceType: 'video',
    });
    const ancien = colis.vocalPublicId;
    await colis.update({ vocalUrl: vocal.url, vocalPublicId: vocal.publicId });
    if (ancien) await deleteFromCloudinary(ancien, 'video').catch(() => {});
    return { message: 'Message vocal enregistré.', colis };
  };

  /** Inscrit une adresse aux alertes de suivi de l'expédition. */
  static abonnerAuSuivi = async (userId, colisId, { canal, destination, profil }) => {
    await ColisService.chargerExpeditionDuClient(userId, colisId, []);
    const abonnement = await notificationService.abonner({ colisId, canal, destination, profil });
    return {
      message: `Les alertes de suivi seront envoyées à ${destination}.`,
      abonnement: {
        id: abonnement.id,
        canal: abonnement.canal,
        destination: abonnement.destination,
      },
    };
  };

  /* ── Documents ──────────────────────────────────────────────────────────── */

  /** Planche d'étiquettes à imprimer et à coller sur chaque pièce. */
  static getEtiquettes = async (userId, colisId) => {
    const colis = await ColisService.chargerExpeditionDuClient(userId, colisId);
    if (['annule', 'refuse', 'en_attente_validation', 'devis_propose'].includes(colis.statut)) {
      throw new BadRequestError('Les étiquettes sont disponibles une fois la demande validée');
    }

    const html = documents.genererEtiquettes(colis, colis.pieces || [], colis.pointRetrait);
    return { html, nomFichier: `etiquettes-${colis.reference}.html` };
  };

  /** Récépissé de dépôt, également remis au comptoir du point de collecte. */
  static getBordereau = async (userId, colisId) => {
    const colis = await ColisService.chargerExpeditionDuClient(userId, colisId);
    const parametres = await parametreService.chargerTous();
    const html = documents.genererBordereauDepot(colis, colis.pointCollecteDepart, parametres);
    return { html, nomFichier: `bordereau-${colis.reference}.html` };
  };

  /** Facture commerciale exigée au dédouanement. */
  static getFactureCommerciale = async (userId, colisId) => {
    const colis = await ColisService.chargerExpeditionDuClient(userId, colisId);
    if (!colis.declarationDouane) {
      throw new BadRequestError('Cette expédition ne requiert pas de facture commerciale');
    }
    const parametres = await parametreService.chargerTous();
    const html = documents.genererFactureCommerciale(
      colis,
      colis.declarationDouane,
      colis.declarationDouane.articles || [],
      parametres
    );
    return { html, nomFichier: `facture-commerciale-${colis.reference}.html` };
  };
}

module.exports = ColisService;
