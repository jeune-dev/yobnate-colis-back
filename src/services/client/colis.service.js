const { Op, UniqueConstraintError } = require('sequelize');
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
  Rotation,
  Emballage,
  TourneeCollecte,
  DemandeEnlevement,
} = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const {
  genererNumeroSuiviYobnate,
  genererNumeroPiece,
  genererNumeroFactureCommerciale,
  genererCodeRetrait,
  genererRefEnlevement,
} = require('../../utils/referenceGenerator');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');
const { envoyerModele, URL_PUBLIQUE } = require('../../utils/mailer');
const { formater } = require('../../utils/devise');
const logger = require('../../config/logger');
const { logActivity } = require('../activityLog.service');
const tarificationService = require('../tarification.service');
const suiviService = require('../suivi.service');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const facturationService = require('../facturation.service');
const documents = require('../../utils/documents');
const { estCorridorAutorise, PAYS } = require('../../constants/pays');
const { REGLES_CATEGORIE, NUMEROS_CATEGORIE } = require('../../constants/colis');

/**
 * Espace client : déclaration et suivi des expéditions.
 *
 * La déclaration est l'opération la plus sensible du système. Elle enchaîne un
 * devis, la création de la lettre de transport et de ses pièces, la déclaration
 * douanière lorsque le corridor est international, puis — selon la catégorie —
 * la facture, le tout dans une transaction unique. Les téléversements sont
 * effectués avant la transaction et nettoyés si celle-ci échoue, afin de ne
 * jamais laisser de fichier orphelin.
 *
 * Le parcours dépend de la catégorie du colis :
 * - 1 (documents) : prix fixe, pas de validation, facture et paiement immédiats ;
 * - 2 (colis moyen) : validation par l'administrateur, facture à la réception ;
 * - 3 (colis XXL) : étude sous 24 h, proposition tarifaire à accepter, puis paiement.
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

  static INCLUDE_DETAIL = [
    ...ColisService.INCLUDE_LISTE,
    { model: ColisPiece, as: 'pieces' },
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
    { model: Facture, as: 'facture', include: [{ model: Paiement, as: 'paiements' }] },
    {
      model: DeclarationDouane,
      as: 'declarationDouane',
      include: [{ model: ArticleDouane, as: 'articles' }],
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
      points.depart = await ColisService.validerPoint(
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
      points.retrait = await ColisService.validerPoint(
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

  /* ── Devis ──────────────────────────────────────────────────────────────── */

  /**
   * Compare les offres disponibles pour un besoin d'expédition — accessible sans
   * compte. Pour un client identifié, les remises et crédits du compte sont pris
   * en compte.
   */
  static simulerDevis = async (params, userId = null) => {
    const parametres = await parametreService.chargerTous();
    const user = userId ? await User.findByPk(userId) : null;
    const avantages = await ColisService.calculerAvantages(user, parametres);

    const { offres, indisponibles, villeDepart, villeArrivee } =
      await tarificationService.comparerServices({ ...params, ...avantages });

    const regles = REGLES_CATEGORIE[params.categorie] || REGLES_CATEGORIE.colis_moyen;

    return {
      message: offres.length
        ? `${offres.length} offre(s) disponible(s) pour ${villeDepart.nom} vers ${villeArrivee.nom}`
        : 'Aucune offre disponible pour ce trajet',
      devis: {
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
      },
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
        return await model.create(construire(reference), { transaction });
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
    const { photos: fichiersPhotos, vocal: fichierVocal } = ColisService.fichiersDe(files);

    const [service, villeDepart, villeArrivee, client, parametres] = await Promise.all([
      ColisService.chargerService(data.serviceId),
      tarificationService.chargerVille(data.villeDepartId, 'de départ'),
      tarificationService.chargerVille(data.villeArriveeId, "d'arrivée"),
      User.findByPk(userId),
      parametreService.chargerTous(),
    ]);
    if (!client) throw new NotFoundError('Client introuvable');

    ColisService.validerExigencesCategorie({
      regles,
      data: { ...data, categorie },
      villeArrivee,
      nbPhotos: fichiersPhotos.length,
      source,
    });
    const points = await ColisService.validerDemande({
      villeDepart,
      villeArrivee,
      service,
      data,
      parametres,
    });

    const tournee =
      data.modeDepot === 'enlevement_domicile' && data.tourneeCollecteId
        ? await ColisService.validerTournee(data.tourneeCollecteId, {
            pays: villeDepart.pays,
            codePostal: data.codePostalDepart,
            villeId: villeDepart.id,
          })
        : null;

    const avantages = await ColisService.calculerAvantages(client, parametres);
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
    const numeroConteneur = await ColisService.numeroConteneurCourant({
      paysDepart: villeDepart.pays,
      paysArrivee: villeArrivee.pays,
      modeTransport: service.modeTransport,
    });

    // Téléversement hors transaction : la connexion base ne reste pas ouverte pendant l'I/O réseau
    const photos = fichiersPhotos.length
      ? await Promise.all(
          fichiersPhotos.map((f) =>
            uploadToCloudinary(f.buffer, { folder: 'yobnate-express/colis' })
          )
        )
      : [];
    const vocal = fichierVocal
      ? await uploadToCloudinary(fichierVocal.buffer, {
          folder: 'yobnate-express/vocaux',
          resourceType: 'video',
        })
      : null;

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
        const colis = await ColisService.creerAvecReference(
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
              creneau: infosCollecte.creneau || ColisService.creneauPourHeure(heure),
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
        if (tournee) {
          await TourneeCollecte.increment('nbInscrits', {
            by: 1,
            where: { id: tournee.id },
            transaction: t,
          });
        }

        // Emballages achetés : le stock suivi est décrémenté
        for (const achat of colis.emballages || []) {
          await Emballage.decrement('stock', {
            by: achat.quantite,
            where: { id: achat.emballageId, stock: { [Op.ne]: null } },
            transaction: t,
          });
        }

        // Crédit de parrainage consommé et récompense du parrain à la première expédition du filleul
        if (creditUtilise > 0) {
          await User.decrement('creditParrainage', {
            by: creditUtilise,
            where: { id: userId },
            transaction: t,
          });
        }
        if (avantages.remiseParrainagePourcent > 0 && !devis.surDevis) {
          await User.update(
            { parrainageRecompense: true },
            { where: { id: userId }, transaction: t }
          );
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
            commentaire: ColisService.consigneDepot(data.modeDepot, points, parametres),
            createdBy: userId,
          },
          { transaction: t }
        );

        return { colis, facture, declaration, enlevement };
      });
    } catch (err) {
      const aNettoyer = [
        ...photos.map((p) => deleteFromCloudinary(p.publicId)),
        ...(vocal ? [deleteFromCloudinary(vocal.publicId, 'video')] : []),
      ];
      if (aNettoyer.length) await Promise.allSettled(aNettoyer);
      throw err;
    }

    const { colis, facture } = resultat;
    await ColisService.notifierNouvelleDemande({
      colis,
      facture,
      client,
      regles,
      villeArrivee,
      parametres,
      destinataireEmail: data.destinataireEmail,
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
        ? ColisService.adresseReception(villeDepart.pays, parametres)
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
    const { rows, count } = await Colis.findAndCountAll({
      where,
      include: ColisService.INCLUDE_LISTE,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Vos expéditions',
      colis: rows.map((c) => ({ ...c.toJSON(), enRetard: c.estEnRetard })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  /**
   * Expéditions dont l'utilisateur connecté est le destinataire (rapprochement
   * par numéro de téléphone, aucun lien `userId` n'existe côté destinataire).
   */
  static getMesReceptions = async (telephone, filters = {}, pagination = {}) => {
    const where = { destinataireTelephone: telephone };
    if (filters.statut) where.statut = filters.statut;
    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {};
      if (filters.dateDebut) where.createdAt[Op.gte] = new Date(filters.dateDebut);
      if (filters.dateFin) where.createdAt[Op.lte] = new Date(filters.dateFin);
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Colis.findAndCountAll({
      where,
      include: ColisService.INCLUDE_LISTE,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Colis reçus',
      colis: rows.map((c) => ({ ...c.toJSON(), enRetard: c.estEnRetard })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static chargerExpeditionDuClient = async (userId, colisId) => {
    const colis = await Colis.findOne({
      where: { id: colisId, userId },
      include: ColisService.INCLUDE_DETAIL,
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
          ? ColisService.adresseReception(colis.paysDepart, parametres)
          : null,
      },
    };
  };

  static getSuivi = async (userId, colisId) => {
    await ColisService.chargerExpeditionDuClient(userId, colisId);
    return suiviService.getHistorique(colisId, { inclureInternes: false });
  };

  /* ── Actions du client ──────────────────────────────────────────────────── */

  /**
   * Restitue ce qu'une demande avait réservé : crédit de parrainage, place dans
   * la tournée de collecte, stock d'emballages.
   */
  static liberRessources = async (colis, transaction = null) => {
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
  static annulerExpedition = async (userId, colisId, motif) => {
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');

    const annulables = [
      'brouillon',
      'en_attente_validation',
      'devis_propose',
      'en_attente',
      'enlevement_planifie',
    ];
    if (!annulables.includes(colis.statut)) {
      throw new BadRequestError(
        'Cette expédition est déjà prise en charge : contactez le service client pour demander un retour'
      );
    }

    await suiviService.enregistrerEvenement(
      colis,
      { codeEvenement: 'ANNULE', commentaire: motif || 'Annulée par le client', motif },
      { auteurId: userId }
    );
    await ColisService.liberRessources(colis);
    await Facture.update({ statut: 'annulee' }, { where: { colisId: colis.id } });

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
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.statut !== 'devis_propose') {
      throw new BadRequestError("Aucune proposition tarifaire n'est en attente pour cette demande");
    }
    if (colis.propositionExpireAt && new Date(colis.propositionExpireAt) < new Date()) {
      throw new BadRequestError(
        'Cette proposition a expiré : contactez-nous pour en obtenir une nouvelle'
      );
    }

    await colis.update({ propositionRepondueAt: new Date() });
    await suiviService.enregistrerEvenement(
      colis,
      {
        codeEvenement: 'DEVIS_ACCEPTE',
        commentaire: `Montant accepté : ${formater(colis.montantTotal, colis.devise)}`,
      },
      { auteurId: userId }
    );

    const { facture } = await facturationService.emettreFactureColis(colis, { auteurId: userId });
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
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (colis.statut !== 'devis_propose') {
      throw new BadRequestError("Aucune proposition tarifaire n'est en attente pour cette demande");
    }

    await colis.update({ propositionRepondueAt: new Date(), motifRefus: motif || null });
    await suiviService.enregistrerEvenement(
      colis,
      { codeEvenement: 'DEVIS_REFUSE', commentaire: motif || 'Proposition déclinée par le client' },
      { auteurId: userId }
    );
    await ColisService.liberRessources(colis);

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
    await ColisService.chargerExpeditionDuClient(userId, colisId);
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
