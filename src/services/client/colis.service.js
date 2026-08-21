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
} = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const {
  genererNumeroSuivi,
  genererNumeroPiece,
  genererRefFacture,
  genererNumeroFactureCommerciale,
  genererCodeRetrait,
} = require('../../utils/referenceGenerator');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');
const { logActivity } = require('../activityLog.service');
const tarificationService = require('../tarification.service');
const suiviService = require('../suivi.service');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const documents = require('../../utils/documents');
const { estCorridorAutorise, PAYS } = require('../../constants/pays');
const { ajouterJoursCalendaires } = require('../../utils/delais');

/**
 * Espace client : déclaration et suivi des expéditions.
 *
 * La déclaration est l'opération la plus sensible du système. Elle enchaîne un
 * devis, la création de la lettre de transport et de ses pièces, la déclaration
 * douanière lorsque le corridor est international, puis la facture — le tout dans
 * une transaction unique. Les téléversements sont effectués avant la transaction
 * et nettoyés si celle-ci échoue, afin de ne jamais laisser de fichier orphelin.
 */

class ColisService {
  static INCLUDE_LISTE = [
    { model: Ville, as: 'villeDepart', attributes: ['id', 'nom', 'pays'] },
    { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom', 'pays'] },
    { model: ServiceExpedition, as: 'service', attributes: ['id', 'code', 'nom'] },
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
  static validerDemande = async ({ villeDepart, villeArrivee, service, data }) => {
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
    } else {
      if (!villeDepart.enlevementDomicileDisponible) {
        throw new BadRequestError(`L'enlèvement à domicile n'est pas assuré à ${villeDepart.nom}`);
      }
      if (!data.adresseDepart) {
        throw new BadRequestError("Une adresse d'enlèvement est requise");
      }
    }

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

  /* ── Devis ──────────────────────────────────────────────────────────────── */

  /**
   * Compare les offres disponibles pour un besoin d'expédition.
   * Prend en compte la remise contractuelle du compte lorsqu'un client est identifié.
   */
  static simulerDevis = async (params, userId = null) => {
    let remiseContractuelle = 0;
    if (userId) {
      const user = await User.findByPk(userId, { attributes: ['remiseContractuelle'] });
      remiseContractuelle = Number(user?.remiseContractuelle || 0);
    }

    const { offres, indisponibles, villeDepart, villeArrivee } =
      await tarificationService.comparerServices({
        ...params,
        remiseContractuelle,
      });

    return {
      message: offres.length
        ? `${offres.length} offre(s) disponible(s) pour ${villeDepart.nom} vers ${villeArrivee.nom}`
        : 'Aucune offre disponible pour ce trajet',
      devis: {
        origine: { id: villeDepart.id, nom: villeDepart.nom, pays: villeDepart.pays },
        destination: { id: villeArrivee.id, nom: villeArrivee.nom, pays: villeArrivee.pays },
        international: villeDepart.pays !== villeArrivee.pays,
        remiseContractuelle,
        offres,
        servicesIndisponibles: indisponibles,
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
   * Enregistre une expédition complète.
   *
   * @param {string} userId Compte à l'origine de la demande.
   * @param {object} data   Données validées de l'expédition.
   * @param {Array}  files  Photos du contenu, téléversées avant la transaction.
   * @param {object} contexte Origine de la saisie (client, back-office, point de collecte).
   */
  static declarerExpedition = async (userId, data, files = [], contexte = {}) => {
    const [service, villeDepart, villeArrivee, client, parametres] = await Promise.all([
      ColisService.chargerService(data.serviceId),
      tarificationService.chargerVille(data.villeDepartId, 'de départ'),
      tarificationService.chargerVille(data.villeArriveeId, "d'arrivée"),
      User.findByPk(userId),
      parametreService.chargerTous(),
    ]);
    if (!client) throw new NotFoundError('Client introuvable');

    const points = await ColisService.validerDemande({ villeDepart, villeArrivee, service, data });

    const pieces = data.pieces?.length
      ? data.pieces
      : [{ poidsKg: data.poidsKg, ordre: 1, typeEmballage: data.typeEmballage || 'carton' }];

    // Devis figé : c'est ce calcul, et non la grille du jour, qui fera foi
    const devis = await tarificationService.calculerDevis({
      service,
      villeDepart,
      villeArrivee,
      pieces,
      typeContenu: data.typeContenu,
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
      remiseContractuelle: Number(client.remiseContractuelle || 0),
      parametres,
    });

    const plafond = Number(parametres.plafond_valeur_declaree_xof);
    if (plafond > 0 && Number(data.valeurDeclaree || 0) > 0) {
      const valeurXof =
        devis.devise === 'XOF'
          ? Number(data.valeurDeclaree)
          : Number(data.valeurDeclaree) * Number(parametres.taux_change_eur_xof);
      if (valeurXof > plafond) {
        throw new BadRequestError(
          `La valeur déclarée dépasse le plafond autorisé (${plafond} XOF)`
        );
      }
    }

    // Téléversement hors transaction : la connexion base ne reste pas ouverte pendant l'I/O réseau
    const photos = files.length
      ? await Promise.all(
          files.map((f) => uploadToCloudinary(f.buffer, { folder: 'yobnate-express/colis' }))
        )
      : [];

    const international = villeDepart.pays !== villeArrivee.pays;
    const douaneRequise = international && data.typeContenu !== 'document';

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
            typeContenu: data.typeContenu,
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

            modeDepot: data.modeDepot,
            pointCollecteDepartId: points.depart?.id || null,
            modeLivraison: data.modeLivraison,
            pointRetraitId: points.retrait?.id || null,

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
            montantFret: devis.montants.fret,
            montantSurcharges: devis.montants.surcharges,
            montantAssurance: devis.montants.assurance,
            montantTva: devis.montants.tva,
            montantDroitsDouane: devis.montants.droitsDouane,
            montantTotal: devis.montants.total,
            detailTarification: {
              tarifApplique: devis.tarifApplique,
              surcharges: devis.detailSurcharges,
              assurance: devis.detailAssurance,
              douane: devis.detailDouane,
              montants: devis.montants,
              calculeLe: new Date().toISOString(),
            },

            statut: 'en_attente',
            dateLivraisonEstimee: devis.delai.dateLivraisonEstimee,
            codeRetrait: data.modeLivraison === 'point_retrait' ? genererCodeRetrait() : null,
            photos,
            sourceCreation: contexte.source || 'client',
            creePar: contexte.auteurId || userId,
          }),
          () => genererNumeroSuivi(t),
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
              motifExport: data.typeContenu,
              incoterm: data.incoterm,
              paysExport: villeDepart.pays,
              paysImport: villeArrivee.pays,
              valeurTotale: data.valeurDeclaree || 0,
              devise: data.deviseValeur || devis.devise,
              fraisTransport: devis.montants.fret,
              fraisAssurance: devis.montants.assurance,
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
                declarationId: declaration.id,
                ordre: i + 1,
              })),
              { transaction: t }
            );
          }
        }

        // La facture reste rattachée au compte qui a déclaré l'expédition ; en port dû,
        // l'indicateur `payeur` signale au réseau d'encaisser auprès du destinataire.
        const facture = await ColisService.creerAvecReference(
          Facture,
          (reference) => ({
            reference,
            colisId: colis.id,
            userId,
            type: 'expedition',
            payeur: data.payeur,
            devise: devis.devise,
            montantFret: devis.montants.fret,
            montantSurcharges: devis.montants.surcharges,
            montantAssurance: devis.montants.assurance,
            montantDroitsDouane: devis.montants.droitsDouane,
            montantHt: devis.montants.totalHt,
            tauxTva: devis.montants.tauxTva,
            montantTva: devis.montants.tva,
            montantTotal: devis.montants.total,
            lignes: [
              {
                libelle: `Transport ${service.nom} — ${devis.poids.poidsFactureKg} kg`,
                montant: devis.montants.fret,
              },
              ...devis.detailSurcharges.map((s) => ({ libelle: s.libelle, montant: s.montant })),
              ...(devis.montants.assurance > 0
                ? [{ libelle: 'Assurance ad valorem', montant: devis.montants.assurance }]
                : []),
              ...(devis.montants.droitsDouane > 0
                ? [
                    {
                      libelle: "Droits et taxes à l'import (DDP)",
                      montant: devis.montants.droitsDouane,
                    },
                  ]
                : []),
            ],
            statut: 'en_attente',
            dateLimitePaiement: ajouterJoursCalendaires(
              new Date(),
              Number(parametres.delai_paiement_jours)
            )
              .toISOString()
              .slice(0, 10),
            mentions: parametres.mentions_facture,
          }),
          () => genererRefFacture(t),
          t
        );

        await SuiviColis.create(
          {
            colisId: colis.id,
            codeEvenement: 'CRE',
            statut: 'en_attente',
            libelle: 'Expédition enregistrée',
            lieu: villeDepart.nom,
            pays: villeDepart.pays,
            commentaire:
              data.modeDepot === 'point_collecte'
                ? `À déposer au point « ${points.depart.nom} »`
                : 'Enlèvement à domicile à programmer',
            createdBy: userId,
          },
          { transaction: t }
        );

        return { colis, facture, declaration };
      });
    } catch (err) {
      if (photos.length)
        await Promise.allSettled(photos.map((p) => deleteFromCloudinary(p.publicId)));
      throw err;
    }

    const { colis, facture } = resultat;

    // Le destinataire est tenu informé s'il a laissé une adresse électronique
    if (data.destinataireEmail) {
      await notificationService
        .abonner({
          colisId: colis.id,
          canal: 'email',
          destination: data.destinataireEmail,
          profil: 'destinataire',
        })
        .catch(() => {});
    }

    await notificationService.notifier({
      userId,
      titre: `Expédition ${colis.reference} enregistrée`,
      message: `Votre expédition vers ${villeArrivee.nom} est enregistrée. Facture ${facture.reference}.`,
      type: 'colis',
      niveau: 'succes',
      entite: 'Colis',
      entiteId: colis.id,
      lienCible: `/colis/${colis.id}`,
    });

    await logActivity({
      userId,
      action: 'colis.create',
      entite: 'Colis',
      entiteId: colis.id,
      details: { reference: colis.reference, montant: colis.montantTotal, devise: colis.devise },
    });

    return {
      message: 'Expédition enregistrée avec succès.',
      colis,
      facture,
      declarationDouane: resultat.declaration,
      devis,
    };
  };

  /* ── Consultation ───────────────────────────────────────────────────────── */

  static getMesExpeditions = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.reference) where.reference = { [Op.iLike]: `%${filters.reference}%` };
    if (filters.enCours === 'true' || filters.enCours === true) {
      where.statut = { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule'] };
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

  static getSuivi = async (userId, colisId) => {
    await ColisService.chargerExpeditionDuClient(userId, colisId);
    return suiviService.getHistorique(colisId, { inclureInternes: false });
  };

  /* ── Actions du client ──────────────────────────────────────────────────── */

  /**
   * Annule une expédition.
   * L'annulation n'est possible que tant que le colis n'a pas été confié au réseau ;
   * au-delà, elle relève d'une demande de retour traitée par le service client.
   */
  static annulerExpedition = async (userId, colisId, motif) => {
    const colis = await Colis.findOne({ where: { id: colisId, userId } });
    if (!colis) throw new NotFoundError('Expédition introuvable');

    if (!['brouillon', 'en_attente', 'enlevement_planifie'].includes(colis.statut)) {
      throw new BadRequestError(
        'Cette expédition est déjà prise en charge : contactez le service client pour demander un retour'
      );
    }

    await suiviService.enregistrerEvenement(
      colis,
      { codeEvenement: 'ANNULE', commentaire: motif || 'Annulée par le client', motif },
      { auteurId: userId }
    );
    await Facture.update({ statut: 'annulee' }, { where: { colisId: colis.id } });

    return { message: 'Expédition annulée. La facture associée est annulée.', colis };
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
    if (colis.statut === 'annule')
      throw new BadRequestError('Une expédition annulée ne peut pas être étiquetée');

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
