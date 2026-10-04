const { Op, UniqueConstraintError } = require('sequelize');
const {
  sequelize,
  Colis,
  ColisPiece,
  SuiviColis,
  ServiceExpedition,
  PointCollecte,
  DeclarationDouane,
  ArticleDouane,
  User,
  Rotation,
  Emballage,
  TourneeCollecte,
  DemandeEnlevement,
} = require('../../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../../errors/AppError');
const {
  genererNumeroSuiviYobnate,
  genererNumeroPiece,
  genererNumeroFactureCommerciale,
  genererCodeRetrait,
  genererRefEnlevement,
} = require('../../../utils/referenceGenerator');
const { uploadFile, deleteFile } = require('../../../infrastructure/r2.service');
const { envoyerModele, URL_PUBLIQUE } = require('../../../infrastructure/mailer');
const logger = require('../../../utils/logger');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const tarificationService = require('../../tarification/service/tarification.service');
const notificationService = require('../../notification/service/notification.service');
const parametreService = require('../../parametre/service/parametre.service');
const facturationService = require('../../facture/service/facturation.service');
const { estCorridorAutorise, PAYS } = require('../../../config/pays');
const { REGLES_CATEGORIE, NUMEROS_CATEGORIE } = require('../../../config/colis');
const simulationService = require('../../mesure/service/simulation.service');

/**
 * Déclaration d'une expédition et devis.
 *
 * La déclaration est l'opération la plus sensible du système. Elle enchaîne un
 * devis, la création de la lettre de transport et de ses pièces, la déclaration
 * douanière lorsque le corridor est international, puis — selon la catégorie —
 * la facture, le tout dans une transaction unique. Les téléversements sont
 * effectués avant la transaction et nettoyés si celle-ci échoue, afin de ne
 * jamais laisser de fichier orphelin. Les réservations (stock d'emballages,
 * crédit de parrainage) sont prises sous verrou dans cette transaction.
 *
 * Le parcours dépend de la catégorie du colis :
 * - 1 (documents) : prix fixe, pas de validation, facture et paiement immédiats ;
 * - 2 (colis moyen) : validation par l'administrateur, facture à la réception ;
 * - 3 (colis XXL) : étude sous 24 h, proposition tarifaire à accepter, puis paiement.
 */

class ColisDeclarationService {
  /* ── Contrôles préalables ───────────────────────────────────────────────── */

  static chargerService = async (serviceId) => {
    const service = await ServiceExpedition.findByPk(serviceId);
    if (!service) throw new BadRequestError("Service d'expédition introuvable");
    if (!service.isActive)
      throw new BadRequestError(`Le service « ${service.nom} » n'est plus proposé`);
    return service;
  };

  /** Le point choisi doit exister, être ouvert au public et rendre la prestation attendue. */
  static validerPoint = async (pointId, pays, service, libelle) => {
    const point = await PointCollecte.findByPk(pointId);
    if (!point) throw new BadRequestError(`Point ${libelle} introuvable`);
    if (!point.isActive || !point.visiblePublic) {
      throw new BadRequestError(`Le point ${libelle} « ${point.nom} » n'est pas disponible`);
    }
    if (point.enMaintenance) {
      throw new BadRequestError(
        `Le point ${libelle} « ${point.nom} » est temporairement fermé${point.motifMaintenance ? ` : ${point.motifMaintenance}` : ''}`
      );
    }
    if (point.pays !== pays) {
      throw new BadRequestError(`Le point ${libelle} doit se situer en ${PAYS[pays]?.libelle}`);
    }
    if (!point.offreService(service)) {
      throw new BadRequestError(
        `Le point « ${point.nom} » n'assure pas la prestation de ${service}`
      );
    }
    if (service === 'depot' && point.estSature()) {
      throw new BadRequestError(`Le point « ${point.nom} » a atteint sa capacité de stockage`);
    }
    return point;
  };

  /**
   * Vérifie la cohérence d'ensemble de la demande : corridor desservi, points
   * choisis conformes au mode retenu, disponibilité des prestations à domicile.
   */
  static validerDemande = async ({ villeDepart, villeArrivee, service, data, parametres }) => {
    if (!estCorridorAutorise(villeDepart.pays, villeArrivee.pays)) {
      throw new BadRequestError('Seul le corridor France ⇄ Sénégal est desservi');
    }

    const points = {};

    if (data.modeDepot === 'point_collecte') {
      if (!data.pointCollecteDepartId) {
        throw new BadRequestError('Un point de collecte de dépôt doit être choisi');
      }
      points.depart = await ColisDeclarationService.validerPoint(
        data.pointCollecteDepartId,
        villeDepart.pays,
        'depot',
        'de dépôt'
      );
    } else if (data.modeDepot === 'enlevement_domicile') {
      if (!parametres.collecte_domicile_active) {
        throw new BadRequestError("La collecte à domicile n'est pas proposée actuellement");
      }
      if (!villeDepart.enlevementDomicileDisponible) {
        throw new BadRequestError(`L'enlèvement à domicile n'est pas assuré à ${villeDepart.nom}`);
      }
      if (!data.adresseDepart) {
        throw new BadRequestError(
          'Si vous optez pour une collecte, veuillez indiquer les informations nécessaires : adresse de collecte manquante'
        );
      }
    } else if (data.modeDepot === 'boite_aux_lettres' && !data.adresseDepart) {
      throw new BadRequestError("L'adresse de la boîte aux lettres est requise");
    }
    // envoi_postal : le colis est adressé à l'adresse de réception paramétrée

    if (data.modeLivraison === 'point_retrait') {
      if (!data.pointRetraitId) {
        throw new BadRequestError('Un point de retrait doit être choisi');
      }
      points.retrait = await ColisDeclarationService.validerPoint(
        data.pointRetraitId,
        villeArrivee.pays,
        'retrait',
        'de retrait'
      );
    } else {
      if (!villeArrivee.livraisonDomicileDisponible) {
        throw new BadRequestError(
          `La livraison à domicile n'est pas assurée à ${villeArrivee.nom}`
        );
      }
      if (!data.adresseLivraison) {
        throw new BadRequestError('Une adresse de livraison est requise');
      }
    }

    // Le gabarit d'une pièce ne doit pas dépasser ce que le point de dépôt accepte
    if (points.depart?.poidsMaxColisKg && data.pieces?.length) {
      const trop = data.pieces.find(
        (p) => Number(p.poidsKg) > Number(points.depart.poidsMaxColisKg)
      );
      if (trop) {
        throw new BadRequestError(
          `Le point « ${points.depart.nom} » n'accepte pas les colis de plus de ${points.depart.poidsMaxColisKg} kg`
        );
      }
    }

    if (data.marchandiseDangereuse && !service.typesContenuAutorises?.includes('marchandise')) {
      throw new BadRequestError("Ce service n'accepte pas les marchandises réglementées");
    }

    return points;
  };

  /**
   * Exigences propres à la catégorie : adresse sénégalaise détaillée (bloquante),
   * photos du colis, dimensions des colis XXL.
   */
  static validerExigencesCategorie = ({ regles, data, villeArrivee, nbPhotos, source }) => {
    if (regles.adresseSenegalDetaillee && villeArrivee.pays === 'SN') {
      const manquants = [
        ['destinataireQuartier', 'quartier'],
        ['destinataireArrondissement', 'arrondissement'],
        ['destinataireDepartement', 'département'],
        ['destinatairePointRepere', 'point de repère'],
      ]
        .filter(([champ]) => !String(data[champ] || '').trim())
        .map(([, libelle]) => libelle);
      if (manquants.length) {
        throw new BadRequestError(
          `Adresse au Sénégal incomplète : ${manquants.join(', ')} obligatoire(s)`
        );
      }
    }

    // Les pièces justificatives sont exigées du client ; le back-office peut compléter après coup
    if (source === 'client' && nbPhotos < regles.photosMin) {
      throw new BadRequestError(
        regles.photosMin > 1
          ? `Merci de joindre ${regles.photosMin} photos du colis (sous trois angles différents)`
          : 'Merci de joindre une photo du colis'
      );
    }

    if (data.categorie === 'colis_xxl') {
      const sansDimensions = (data.pieces || []).some(
        (p) => !p.longueurCm || !p.largeurCm || !p.hauteurCm
      );
      if (!data.pieces?.length || sansDimensions) {
        throw new BadRequestError(
          'Pour un colis XXL, indiquez les dimensions (longueur, largeur, hauteur) et le poids estimé de chaque colis'
        );
      }
    }
  };

  /** Tournée de collecte choisie : ouverte, dans la zone, et non complète. */
  static validerTournee = async (tourneeId, { pays, codePostal, villeId }) => {
    const tournee = await TourneeCollecte.findByPk(tourneeId);
    if (!tournee) throw new BadRequestError('Tournée de collecte introuvable');
    if (tournee.pays !== pays) {
      throw new BadRequestError(`Cette tournée se déroule en ${PAYS[tournee.pays]?.libelle}`);
    }
    if (!tournee.accepteInscriptions) {
      throw new BadRequestError("Cette tournée de collecte n'accepte plus d'inscription");
    }
    if (!tournee.couvre({ codePostal, villeId })) {
      throw new BadRequestError("Votre adresse n'est pas desservie par cette tournée de collecte");
    }
    return tournee;
  };

  /**
   * Avantages commerciaux du compte : remise contractuelle ou tarif professionnel
   * (NINEA / Kbis validé), bonus de bienvenue du filleul et crédit de parrainage.
   */
  static calculerAvantages = async (user, parametres) => {
    if (!user) return { remiseContractuelle: 0, remiseParrainagePourcent: 0, creditParrainage: 0 };

    const remisePro = user.justificatifProValide
      ? Number(parametres.remise_professionnelle_pourcent || 0)
      : 0;
    let remiseParrainagePourcent = 0;
    if (parametres.parrainage_actif && user.parrainId && !user.parrainageRecompense) {
      const dejaExpedie = await Colis.count({
        where: { userId: user.id, statut: { [Op.notIn]: ['annule', 'refuse'] } },
      });
      if (!dejaExpedie) {
        remiseParrainagePourcent = Number(parametres.parrainage_remise_filleul_pourcent || 0);
      }
    }
    return {
      remiseContractuelle: Math.max(Number(user.remiseContractuelle || 0), remisePro),
      remiseParrainagePourcent,
      creditParrainage: Number(user.creditParrainage || 0),
    };
  };

  /**
   * Numéro du conteneur repris dans le numéro de suivi : le conteneur ouvert au
   * chargement sur ce trajet, ou à défaut le prochain à ouvrir.
   */
  static numeroConteneurCourant = async ({ paysDepart, paysArrivee, modeTransport }) => {
    const ouvert = await Rotation.findOne({
      where: {
        paysDepart,
        paysArrivee,
        modeTransport,
        statut: { [Op.in]: ['planifiee', 'ouverte'] },
        numeroOrdre: { [Op.ne]: null },
      },
      order: [['dateDepartPrevue', 'ASC']],
      attributes: ['numeroOrdre'],
    });
    if (ouvert) return ouvert.numeroOrdre;
    const dernier = await Rotation.max('numeroOrdre');
    return Number(dernier || 0) + 1;
  };

  /** Créneau d'enlèvement correspondant à une heure souhaitée (HH:MM). */
  static creneauPourHeure = (heure) => {
    const h = Number(String(heure || '').slice(0, 2));
    if (!heure || Number.isNaN(h)) return '08:00-12:00';
    if (h < 12) return '08:00-12:00';
    if (h < 16) return '12:00-16:00';
    return '16:00-20:00';
  };

  /** Normalise les fichiers reçus (champs multiples ou tableau simple). */
  static fichiersDe = (files) => {
    if (Array.isArray(files)) return { photos: files, vocal: null };
    return { photos: files?.photos || [], vocal: files?.vocal?.[0] || null };
  };

  /* ── Réservations à la commande ─────────────────────────────────────────── */

  /**
   * Décrémente le stock des emballages achetés, sous verrou de ligne : deux
   * commandes simultanées de la dernière unité ne peuvent pas aboutir toutes
   * les deux. Un emballage sans suivi de stock (stock nul) n'est pas limité.
   * Les verrous sont pris dans l'ordre des identifiants (pas d'interblocage).
   */
  static reserverEmballages = async (achats = [], transaction) => {
    const tries = [...achats].sort((a, b) => String(a.emballageId).localeCompare(b.emballageId));
    for (const achat of tries) {
      const emballage = await Emballage.findByPk(achat.emballageId, {
        attributes: ['id', 'libelle', 'stock'],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!emballage || emballage.stock === null) continue;
      if (emballage.stock < Number(achat.quantite)) {
        throw new ConflictError(
          `Stock insuffisant pour « ${emballage.libelle} » (${emballage.stock} disponible(s))`
        );
      }
      await emballage.decrement('stock', { by: Number(achat.quantite), transaction });
    }
  };

  /**
   * Consomme le crédit de parrainage, sous verrou : deux commandes simultanées
   * ne peuvent pas dépenser deux fois le même crédit.
   */
  static consommerCreditParrainage = async (userId, montant, transaction) => {
    if (!(Number(montant) > 0)) return;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'creditParrainage'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user || Number(user.creditParrainage) < Number(montant)) {
      throw new ConflictError(
        'Votre crédit de parrainage a évolué entre-temps : relancez la simulation'
      );
    }
    await user.decrement('creditParrainage', { by: Number(montant), transaction });
  };

  /* ── Devis ──────────────────────────────────────────────────────────────── */

  /**
   * Compare les offres disponibles pour un besoin d'expédition — accessible sans
   * compte. Pour un client identifié, les remises et crédits du compte sont pris
   * en compte.
   */
  /**
   * @param {object} contexte  Mesure de conversion : `visiteurId` (en-tête X-Visiteur-Id)
   *   et `suiviUserId`, compte à qui rattacher la simulation sans modifier le tarif
   *   (le devis public reste calculé sans avantages de compte).
   */
  static simulerDevis = async (params, userId = null, contexte = {}) => {
    const parametres = await parametreService.chargerTous();
    const user = userId ? await User.findByPk(userId) : null;
    const avantages = await ColisDeclarationService.calculerAvantages(user, parametres);

    const { offres, indisponibles, villeDepart, villeArrivee } =
      await tarificationService.comparerServices({ ...params, ...avantages });

    const regles = REGLES_CATEGORIE[params.categorie] || REGLES_CATEGORIE.colis_moyen;

    const devis = {
      origine: { id: villeDepart.id, nom: villeDepart.nom, pays: villeDepart.pays },
      destination: { id: villeArrivee.id, nom: villeArrivee.nom, pays: villeArrivee.pays },
      international: villeDepart.pays !== villeArrivee.pays,
      categorie: { code: params.categorie || 'colis_moyen', ...regles },
      remiseContractuelle: avantages.remiseContractuelle,
      remiseParrainagePourcent: avantages.remiseParrainagePourcent,
      offres,
      servicesIndisponibles: indisponibles,
      // La simulation se fait sans compte : l'inscription n'est demandée qu'à la commande
      compteRequisPourCommander: !userId,
    };
    // Conservée pour le taux de conversion ; à renvoyer à la commande (`simulationId`)
    devis.simulationId = await simulationService.enregistrer({
      userId: userId || contexte.suiviUserId || null,
      visiteurId: contexte.visiteurId || null,
      params,
      devis,
    });

    return {
      message: offres.length
        ? `${offres.length} offre(s) disponible(s) pour ${villeDepart.nom} vers ${villeArrivee.nom}`
        : 'Aucune offre disponible pour ce trajet',
      devis,
    };
  };

  /* ── Déclaration d'une expédition ───────────────────────────────────────── */

  static creerAvecReference = async (
    model,
    construire,
    fabriqueReference,
    transaction,
    tentatives = 3
  ) => {
    for (let i = 0; i < tentatives; i += 1) {
      const reference = await fabriqueReference();
      try {
        // Point de sauvegarde : dans PostgreSQL, une violation d'unicité annule toute la
        // transaction englobante ; sans SAVEPOINT, la nouvelle tentative échouait
        // toujours (« current transaction is aborted »).
        return transaction
          ? await sequelize.transaction({ transaction }, (sp) =>
              model.create(construire(reference), { transaction: sp })
            )
          : await model.create(construire(reference));
      } catch (err) {
        if (err instanceof UniqueConstraintError && i < tentatives - 1) continue;
        throw err;
      }
    }
    throw new BadRequestError('Impossible de générer une référence unique, veuillez réessayer');
  };

  /**
   * Enregistre une demande d'expédition complète.
   *
   * @param {string} userId Compte à l'origine de la demande.
   * @param {object} data   Données validées de l'expédition.
   * @param {Array|object} files Photos du contenu et message vocal, téléversés avant la transaction.
   * @param {object} contexte Origine de la saisie (client, back-office, point de collecte).
   */
  static declarerExpedition = async (userId, data, files = [], contexte = {}) => {
    const source = contexte.source || 'client';
    const categorie = data.categorie || 'colis_moyen';
    const regles = REGLES_CATEGORIE[categorie];
    const { photos: fichiersPhotos, vocal: fichierVocal } =
      ColisDeclarationService.fichiersDe(files);

    const [service, villeDepart, villeArrivee, client, parametres] = await Promise.all([
      ColisDeclarationService.chargerService(data.serviceId),
      tarificationService.chargerVille(data.villeDepartId, 'de départ'),
      tarificationService.chargerVille(data.villeArriveeId, "d'arrivée"),
      User.findByPk(userId),
      parametreService.chargerTous(),
    ]);
    if (!client) throw new NotFoundError('Client introuvable');

    ColisDeclarationService.validerExigencesCategorie({
      regles,
      data: { ...data, categorie },
      villeArrivee,
      nbPhotos: fichiersPhotos.length,
      source,
    });
    const points = await ColisDeclarationService.validerDemande({
      villeDepart,
      villeArrivee,
      service,
      data,
      parametres,
    });

    const tournee =
      data.modeDepot === 'enlevement_domicile' && data.tourneeCollecteId
        ? await ColisDeclarationService.validerTournee(data.tourneeCollecteId, {
            pays: villeDepart.pays,
            codePostal: data.codePostalDepart,
            villeId: villeDepart.id,
          })
        : null;

    const avantages = await ColisDeclarationService.calculerAvantages(client, parametres);
    const typeContenu = categorie === 'documents' ? 'document' : data.typeContenu;

    // Devis figé : c'est ce calcul, et non la grille du jour, qui fera foi
    const devis = await tarificationService.calculerDevis({
      service,
      villeDepart,
      villeArrivee,
      categorie,
      articles: data.articles || [],
      emballages: data.emballages || [],
      optionColissimo: Boolean(data.optionColissimo),
      pieces: data.pieces || [],
      poidsReelKg: data.pieces?.length ? null : data.poidsKg || null,
      typeContenu,
      valeurDeclaree: data.valeurDeclaree,
      deviseValeur: data.deviseValeur,
      assuranceSouscrite: data.assuranceSouscrite,
      modeDepot: data.modeDepot,
      modeLivraison: data.modeLivraison,
      incoterm: data.incoterm,
      payeur: data.payeur,
      fragile: data.fragile,
      marchandiseDangereuse: data.marchandiseDangereuse,
      articlesDouane: data.articlesDouane || [],
      ...avantages,
      parametres,
    });

    const pieces = devis.piecesRetenues?.length
      ? devis.piecesRetenues
      : [{ poidsKg: data.poidsKg, ordre: 1, typeEmballage: data.typeEmballage || 'carton' }];

    const plafond = Number(parametres.plafond_valeur_declaree_xof);
    if (plafond > 0 && Number(data.valeurDeclaree || 0) > 0) {
      const valeurXof =
        (data.deviseValeur || devis.devise) === 'XOF'
          ? Number(data.valeurDeclaree)
          : Number(data.valeurDeclaree) * Number(parametres.taux_change_eur_xof);
      if (valeurXof > plafond) {
        throw new BadRequestError(
          `La valeur déclarée dépasse le plafond autorisé (${plafond} XOF)`
        );
      }
    }

    // Numéro du conteneur repris dans le numéro de suivi
    const numeroConteneur = await ColisDeclarationService.numeroConteneurCourant({
      paysDepart: villeDepart.pays,
      paysArrivee: villeArrivee.pays,
      modeTransport: service.modeTransport,
    });

    // Téléversement hors transaction : la connexion base ne reste pas ouverte pendant l'I/O réseau
    // Fichier invalide (erreur levée tout de suite) ou refus de R2 : même traitement
    const televerser = (buffer, options) =>
      Promise.resolve().then(() => uploadFile(buffer, options));
    const envois = await Promise.allSettled([
      ...fichiersPhotos.map((f) => televerser(f.buffer, { folder: 'yobnate-express/colis' })),
      ...(fichierVocal
        ? [
            televerser(fichierVocal.buffer, {
              folder: 'yobnate-express/vocaux',
            }),
          ]
        : []),
    ]);
    const photos = envois.slice(0, fichiersPhotos.length).map((e) => e.value);
    const vocal = fichierVocal ? envois[fichiersPhotos.length].value : null;
    const echec = envois.find((e) => e.status === 'rejected');
    if (echec) {
      // Un fichier refusé : ceux déjà envoyés ne doivent pas rester orphelins
      await Promise.allSettled([
        ...photos.filter(Boolean).map((p) => deleteFile(p.publicId)),
        ...(vocal ? [deleteFile(vocal.publicId)] : []),
      ]);
      throw echec.reason;
    }

    const international = villeDepart.pays !== villeArrivee.pays;
    const douaneRequise = international && typeContenu !== 'document';
    const statutInitial = regles.validationAdmin ? 'en_attente_validation' : 'en_attente';
    const montantsFiges = devis.surDevis
      ? { fret: 0, surcharges: 0, assurance: 0, tva: 0, droitsDouane: 0, total: 0 }
      : devis.montants;
    const creditUtilise = devis.surDevis ? 0 : Number(devis.creditParrainageUtiliseEur || 0);
    const dateLimiteEtude = regles.validationAdmin
      ? new Date(Date.now() + Number(parametres.delai_etude_demande_heures || 24) * 3600 * 1000)
      : null;
    const infosCollecte = data.infosCollecte || {};

    let resultat;
    try {
      resultat = await sequelize.transaction(async (t) => {
        const colis = await ColisDeclarationService.creerAvecReference(
          Colis,
          (reference) => ({
            reference,
            referenceClient: data.referenceClient || null,
            userId,
            serviceId: service.id,
            categorie,
            typeDocument: data.typeDocument || null,
            etatMarchandise: data.etatMarchandise || null,
            typeContenu,
            description: data.description || null,
            fragile: Boolean(data.fragile),
            marchandiseDangereuse: Boolean(data.marchandiseDangereuse),

            expediteurNom: data.expediteurNom,
            expediteurEntreprise: data.expediteurEntreprise || null,
            expediteurTelephone: data.expediteurTelephone,
            expediteurEmail: data.expediteurEmail || client.email,
            paysDepart: villeDepart.pays,
            villeDepartId: villeDepart.id,
            adresseDepart: data.adresseDepart || null,
            codePostalDepart: data.codePostalDepart || null,

            destinataireNom: data.destinataireNom,
            destinataireEntreprise: data.destinataireEntreprise || null,
            destinataireTelephone: data.destinataireTelephone,
            destinataireEmail: data.destinataireEmail || null,
            paysArrivee: villeArrivee.pays,
            villeArriveeId: villeArrivee.id,
            adresseLivraison: data.adresseLivraison || null,
            codePostalArrivee: data.codePostalArrivee || null,
            instructionsLivraison: data.instructionsLivraison || null,
            destinataireQuartier: data.destinataireQuartier || null,
            destinataireArrondissement: data.destinataireArrondissement || null,
            destinataireDepartement: data.destinataireDepartement || null,
            destinatairePointRepere: data.destinatairePointRepere || null,

            modeDepot: data.modeDepot,
            pointCollecteDepartId: points.depart?.id || null,
            modeLivraison: data.modeLivraison,
            pointRetraitId: points.retrait?.id || null,
            tourneeCollecteId: tournee?.id || null,
            infosCollecte,
            optionColissimo: Boolean(data.optionColissimo),

            nbPieces: pieces.length,
            poidsReelKg: devis.poids.poidsReelKg,
            poidsVolumetriqueKg: devis.poids.poidsVolumetriqueKg,
            poidsFactureKg: devis.poids.poidsFactureKg,

            valeurDeclaree: data.valeurDeclaree || 0,
            deviseValeur: data.deviseValeur || devis.devise,
            assuranceSouscrite: Boolean(data.assuranceSouscrite),

            incoterm: data.incoterm,
            payeur: data.payeur,

            devise: devis.devise,
            montantFret: montantsFiges.fret,
            montantSurcharges: montantsFiges.surcharges,
            montantAssurance: montantsFiges.assurance,
            montantTva: montantsFiges.tva,
            montantDroitsDouane: montantsFiges.droitsDouane,
            montantTotal: montantsFiges.total,
            lignesForfait: devis.lignesForfait,
            emballages: devis.detailAnnexes
              .filter((a) => a.emballageId)
              .map((a) => ({
                emballageId: a.emballageId,
                libelle: a.libelle,
                quantite: a.quantite,
                montant: a.montant,
              })),
            creditParrainageUtilise: creditUtilise,
            detailTarification: {
              modeTarification: devis.modeTarification,
              tarifApplique: devis.tarifApplique,
              surcharges: devis.detailSurcharges,
              annexes: devis.detailAnnexes,
              assurance: devis.detailAssurance,
              douane: devis.detailDouane,
              montants: devis.surDevis ? {} : devis.montants,
              estimation: devis.surDevis ? devis.montants : undefined,
              zoneTarifaire: devis.corridor.zoneTarifaire,
              calculeLe: new Date().toISOString(),
            },

            statut: statutInitial,
            dateLimiteEtude,
            conditionsAccepteesAt: data.conditionsAcceptees ? new Date() : null,
            dateLivraisonEstimee: devis.delai.dateLivraisonEstimee,
            codeRetrait: data.modeLivraison === 'point_retrait' ? genererCodeRetrait() : null,
            photos,
            vocalUrl: vocal?.url || null,
            vocalPublicId: vocal?.publicId || null,
            sourceCreation: source,
            creePar: contexte.auteurId || userId,
          }),
          () =>
            genererNumeroSuiviYobnate({
              prefixe: parametres.prefixe_numero_suivi || 'PN',
              codeConteneur: parametres.code_conteneur_numero_suivi || 'CO',
              numeroConteneur,
              nomClient: `${client.prenom} ${client.nom}`,
              categorie: NUMEROS_CATEGORIE[categorie],
              transaction: t,
            }),
          t
        );

        // Une pièce = un contenant physique, avec son propre numéro scannable
        const coefficient = Number(service.coefficientVolumetrique);
        await ColisPiece.bulkCreate(
          pieces.map((piece, index) => ({
            colisId: colis.id,
            numeroSuivi: genererNumeroPiece(colis.reference, index + 1),
            ordre: index + 1,
            designation: piece.designation || null,
            typeEmballage: piece.typeEmballage || 'carton',
            poidsKg: piece.poidsKg,
            longueurCm: piece.longueurCm || null,
            largeurCm: piece.largeurCm || null,
            hauteurCm: piece.hauteurCm || null,
            poidsVolumetriqueKg: tarificationService.poidsVolumetriquePiece(piece, coefficient),
          })),
          { transaction: t }
        );

        // Déclaration douanière : obligatoire pour toute marchandise franchissant la frontière
        let declaration = null;
        if (douaneRequise) {
          declaration = await DeclarationDouane.create(
            {
              colisId: colis.id,
              motifExport: typeContenu,
              incoterm: data.incoterm,
              paysExport: villeDepart.pays,
              paysImport: villeArrivee.pays,
              valeurTotale: data.valeurDeclaree || 0,
              devise: data.deviseValeur || devis.devise,
              fraisTransport: montantsFiges.fret,
              fraisAssurance: montantsFiges.assurance,
              poidsBrutKg: devis.poids.poidsReelKg,
              numeroEori: data.numeroEori || null,
              numeroNinea: data.numeroNinea || client.numeroIdentificationFiscale || null,
              factureCommercialeNumero: await genererNumeroFactureCommerciale(t),
              droitsEstimes: devis.detailDouane.droits,
              taxesEstimees: devis.detailDouane.taxes,
              statut: 'brouillon',
            },
            { transaction: t }
          );

          if (data.articlesDouane?.length) {
            await ArticleDouane.bulkCreate(
              data.articlesDouane.map((a, i) => ({
                ...a,
                etat: a.etat || data.etatMarchandise || null,
                declarationId: declaration.id,
                ordre: i + 1,
              })),
              { transaction: t }
            );
          }
        }

        // Catégorie 1 : facture émise d'emblée, le client règle après la simulation
        let facture = null;
        if (regles.paiement === 'a_la_commande' && Number(colis.montantTotal) > 0) {
          ({ facture } = await facturationService.emettreFactureColis(colis, {
            transaction: t,
            auteurId: contexte.auteurId || null,
          }));
        }

        // Collecte à domicile : la demande d'enlèvement est ouverte dans la foulée
        let enlevement = null;
        const dateCollecte = infosCollecte.dateSouhaitee || tournee?.dateCollecte || null;
        if (data.modeDepot === 'enlevement_domicile' && dateCollecte) {
          const heure = infosCollecte.heureSouhaitee || tournee?.heureDebut || null;
          enlevement = await DemandeEnlevement.create(
            {
              reference: await genererRefEnlevement(t),
              userId,
              colisId: colis.id,
              contactNom: data.expediteurNom,
              contactTelephone: data.expediteurTelephone,
              pays: villeDepart.pays,
              villeId: villeDepart.id,
              adresse: data.adresseDepart,
              codePostal: data.codePostalDepart || null,
              dateSouhaitee: dateCollecte,
              creneau: infosCollecte.creneau || ColisDeclarationService.creneauPourHeure(heure),
              heureSouhaitee: heure,
              tourneeCollecteId: tournee?.id || null,
              nbColis: pieces.length,
              poidsEstimeKg: devis.poids.poidsReelKg,
              etage: infosCollecte.etage ?? null,
              ascenseur: infosCollecte.ascenseur ?? null,
              emballageRequis: Boolean(infosCollecte.emballageRequis),
              instructions: infosCollecte.instructions || null,
              fraisEnlevement: devis.detailAnnexes.find((a) => a.code === 'COLLECTE')?.montant || 0,
              statut: 'demande',
            },
            { transaction: t }
          );
        }
        // Réservations atomiques : chaque mise à jour porte sa propre condition, vérifiée
        // par PostgreSQL au moment de l'écriture. Deux déclarations simultanées ne
        // peuvent donc ni dépasser la capacité d'une tournée, ni rendre un stock
        // négatif, ni dépenser deux fois le même crédit (la transaction est annulée).
        if (tournee) {
          const [reserve] = await TourneeCollecte.update(
            { nbInscrits: sequelize.literal('"nbInscrits" + 1') },
            {
              where: {
                id: tournee.id,
                [Op.or]: [
                  { capaciteMax: null },
                  { nbInscrits: { [Op.lt]: sequelize.col('capaciteMax') } },
                ],
              },
              transaction: t,
            }
          );
          if (!reserve) throw new ConflictError('Cette tournée de collecte vient d’être complète');
        }

        // Emballages achetés : le stock suivi est décrémenté (refus si épuisé entre-temps)
        await ColisDeclarationService.reserverEmballages(colis.emballages || [], t);

        // Crédit de parrainage consommé et récompense du parrain à la première expédition du filleul
        await ColisDeclarationService.consommerCreditParrainage(userId, creditUtilise, t);
        if (avantages.remiseParrainagePourcent > 0 && !devis.surDevis) {
          // Une seule « première expédition » par filleul, même en cas de double envoi
          const [premiere] = await User.update(
            { parrainageRecompense: true },
            { where: { id: userId, parrainageRecompense: false }, transaction: t }
          );
          if (!premiere) {
            throw new ConflictError(
              'La remise de première expédition a déjà été utilisée : relancez la déclaration'
            );
          }
          await User.increment('creditParrainage', {
            by: Number(parametres.parrainage_gain_parrain_eur || 0),
            where: { id: client.parrainId },
            transaction: t,
          });
        }

        await SuiviColis.create(
          {
            colisId: colis.id,
            codeEvenement: regles.validationAdmin ? 'SOUMIS' : 'CRE',
            statut: statutInitial,
            libelle: regles.validationAdmin
              ? 'Demande reçue, en cours d’étude'
              : 'Expédition enregistrée',
            lieu: villeDepart.nom,
            pays: villeDepart.pays,
            commentaire: ColisDeclarationService.consigneDepot(data.modeDepot, points, parametres),
            createdBy: userId,
          },
          { transaction: t }
        );

        return { colis, facture, declaration, enlevement };
      });
    } catch (err) {
      const aNettoyer = [
        ...photos.map((p) => deleteFile(p.publicId)),
        ...(vocal ? [deleteFile(vocal.publicId)] : []),
      ];
      if (aNettoyer.length) await Promise.allSettled(aNettoyer);
      throw err;
    }

    const { colis, facture } = resultat;
    await ColisDeclarationService.notifierNouvelleDemande({
      colis,
      facture,
      client,
      regles,
      villeArrivee,
      parametres,
      destinataireEmail: data.destinataireEmail,
    });

    // Taux de conversion : la simulation à l'origine de cette commande est marquée convertie
    await simulationService.rattacher({
      colisId: colis.id,
      userId,
      visiteurId: contexte.visiteurId || null,
      simulationId: data.simulationId || null,
    });

    await logActivity({
      userId,
      action: 'colis.create',
      entite: 'Colis',
      entiteId: colis.id,
      details: {
        reference: colis.reference,
        categorie,
        montant: colis.montantTotal,
        devise: colis.devise,
      },
    });

    return {
      message: regles.validationAdmin
        ? `Demande enregistrée sous le numéro ${colis.reference}. Nos équipes l'étudient et reviennent vers vous sous ${parametres.delai_etude_demande_heures} h.`
        : 'Expédition enregistrée avec succès.',
      colis,
      facture,
      declarationDouane: resultat.declaration,
      enlevement: resultat.enlevement,
      devis,
      lienPaiement: facture ? facturationService.lienPaiement(facture, parametres) : null,
      adresseReception: ['envoi_postal', 'point_collecte'].includes(data.modeDepot)
        ? ColisDeclarationService.adresseReception(villeDepart.pays, parametres)
        : null,
    };
  };

  /** Adresse de réception paramétrée par l'administrateur, selon le pays de départ. */
  static adresseReception = (pays, parametres) =>
    pays === 'SN' ? parametres.adresse_reception_sn : parametres.adresse_reception_fr;

  /** Consigne affichée au client selon la façon dont il remet son colis. */
  static consigneDepot = (modeDepot, points, parametres) => {
    switch (modeDepot) {
      case 'point_collecte':
        return `À déposer au point « ${points.depart?.nom} »`;
      case 'envoi_postal': {
        const adresse = parametres.adresse_reception_fr || {};
        return `À envoyer par la poste à : ${[adresse.nom, adresse.adresse, adresse.codePostal, adresse.ville].filter(Boolean).join(', ')}`;
      }
      case 'boite_aux_lettres':
        return 'Collecte en boîte aux lettres à programmer';
      default:
        return 'Collecte à domicile à programmer';
    }
  };

  /** Accusé de réception au client, alerte aux administrateurs, abonnement du destinataire. */
  static notifierNouvelleDemande = async ({
    colis,
    facture,
    client,
    regles,
    villeArrivee,
    parametres,
    destinataireEmail,
  }) => {
    const lienSuivi = URL_PUBLIQUE ? `${URL_PUBLIQUE}/suivi/${colis.reference}` : null;
    try {
      // Le destinataire est tenu informé s'il a laissé une adresse électronique
      if (destinataireEmail) {
        await notificationService
          .abonner({
            colisId: colis.id,
            canal: 'email',
            destination: destinataireEmail,
            profil: 'destinataire',
          })
          .catch(() => {});
      }

      await notificationService.notifier({
        userId: colis.userId,
        titre: regles.validationAdmin
          ? `Demande ${colis.reference} reçue`
          : `Expédition ${colis.reference} enregistrée`,
        message: regles.validationAdmin
          ? `Votre demande vers ${villeArrivee.nom} est en cours d'étude (réponse sous ${parametres.delai_etude_demande_heures} h).`
          : `Votre expédition vers ${villeArrivee.nom} est enregistrée.${facture ? ` Facture ${facture.reference}.` : ''}`,
        type: 'colis',
        niveau: 'succes',
        entite: 'Colis',
        entiteId: colis.id,
        lienCible: `/colis/${colis.id}`,
      });

      if (regles.validationAdmin) {
        await envoyerModele('accuse_reception_demande', client.email, {
          prenom: client.prenom,
          reference: colis.reference,
          categorie: `catégorie ${regles.numero} — ${regles.libelle}`,
          delaiEtude: parametres.delai_etude_demande_heures,
          lien: lienSuivi,
        });
        await notificationService.notifierAdmins({
          titre: `Nouvelle demande à étudier — ${colis.reference}`,
          message: `Catégorie ${regles.numero} (${regles.libelle}) vers ${villeArrivee.nom}.`,
          type: 'colis',
          niveau: 'alerte',
          entite: 'Colis',
          entiteId: colis.id,
          lienCible: `/admin/colis/${colis.id}`,
        });
      } else if (facture) {
        await facturationService.envoyerLienPaiement(colis, facture);
      }
    } catch (err) {
      logger.error('Notifications de nouvelle demande non délivrées', {
        message: err.message,
        colisId: colis.id,
      });
    }
  };
}

module.exports = ColisDeclarationService;
