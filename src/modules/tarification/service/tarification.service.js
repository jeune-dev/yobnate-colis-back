const { Op } = require('sequelize');
const {
  Tarif,
  Surcharge,
  ServiceExpedition,
  Ville,
  Zone,
  ArticleTarif,
  Emballage,
} = require('../../../models');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const { PAYS, estInternational } = require('../../../config/pays');
const { REGLES_CATEGORIE } = require('../../../config/colis');
const { arrondir, convertir } = require('../../../utils/devise');
const { calculerDateLivraisonEstimee } = require('../../../utils/delais');
const parametreService = require('../../parametre/service/parametre.service');

/**
 * Moteur de tarification.
 *
 * La chaîne de calcul est volontairement explicite et traçable : poids facturé,
 * fret de la tranche, surcharges ligne à ligne, prime d'assurance, droits de
 * douane puis TVA. Chaque devis renvoie le détail complet, qui est figé sur
 * l'expédition afin qu'une révision ultérieure de la grille ne réécrive pas un
 * prix déjà accepté par le client.
 */

/* ── Poids ──────────────────────────────────────────────────────────────── */

/** Poids volumétrique d'une pièce : (L × l × h) / coefficient du service. */

class TarificationService {
  static poidsVolumetriquePiece = (piece, coefficient) => {
    const l = Number(piece.longueurCm || 0);
    const w = Number(piece.largeurCm || 0);
    const h = Number(piece.hauteurCm || 0);
    if (!l || !w || !h) return 0;
    return Number(((l * w * h) / coefficient).toFixed(3));
  };

  /**
   * Détermine l'assiette de facturation : le plus élevé du poids réel et du poids
   * volumétrique cumulés, arrondi au pas commercial supérieur (0,5 kg par défaut).
   */
  static calculerPoids = ({
    pieces = [],
    poidsReelKg = null,
    coefficient = 5000,
    pasArrondi = 0.5,
  }) => {
    const reel = pieces.length
      ? pieces.reduce((acc, p) => acc + Number(p.poidsKg || 0), 0)
      : Number(poidsReelKg || 0);

    const volumetrique = pieces.reduce(
      (acc, p) => acc + TarificationService.poidsVolumetriquePiece(p, coefficient),
      0
    );

    const brut = Math.max(reel, volumetrique);
    const pas = Number(pasArrondi) > 0 ? Number(pasArrondi) : 0.5;
    const facture = Math.max(pas, Math.ceil(brut / pas) * pas);

    return {
      poidsReelKg: Number(reel.toFixed(3)),
      poidsVolumetriqueKg: Number(volumetrique.toFixed(3)),
      poidsFactureKg: Number(facture.toFixed(3)),
      poidsRetenu: volumetrique > reel ? 'volumetrique' : 'reel',
    };
  };

  /* ── Recherche de la ligne tarifaire ────────────────────────────────────── */

  static dansLaValidite = (tarif, date) => {
    const jour = date.toISOString().slice(0, 10);
    if (tarif.dateDebutValidite && String(tarif.dateDebutValidite) > jour) return false;
    if (tarif.dateFinValidite && String(tarif.dateFinValidite) < jour) return false;
    return true;
  };

  /**
   * Sélectionne la ligne applicable : parmi les tranches couvrant le poids, la plus
   * spécifique l'emporte (zones de départ et d'arrivée renseignées avant un tarif
   * national), puis, à spécificité égale, la moins chère.
   */
  static trouverTarif = async ({
    serviceId,
    paysDepart,
    paysArrivee,
    zoneDepartId = null,
    zoneArriveeId = null,
    poidsFactureKg,
    date = new Date(),
  }) => {
    const candidats = await Tarif.findAll({
      where: {
        serviceId,
        paysDepart,
        paysArrivee,
        isActive: true,
        zoneDepartId: { [Op.or]: [null, zoneDepartId].filter((v) => v !== undefined) },
        zoneArriveeId: { [Op.or]: [null, zoneArriveeId].filter((v) => v !== undefined) },
      },
      include: [
        {
          model: Zone,
          as: 'zoneDepart',
          attributes: ['id', 'code', 'nom', 'majorationPourcent', 'delaiSupplementaireJours'],
        },
        {
          model: Zone,
          as: 'zoneArrivee',
          attributes: ['id', 'code', 'nom', 'majorationPourcent', 'delaiSupplementaireJours'],
        },
      ],
    });

    const applicables = candidats.filter(
      (t) => t.couvrePoids(poidsFactureKg) && TarificationService.dansLaValidite(t, date)
    );
    if (!applicables.length) return null;

    const specificite = (t) => (t.zoneDepartId ? 1 : 0) + (t.zoneArriveeId ? 1 : 0);
    applicables.sort((a, b) => {
      const ecart = specificite(b) - specificite(a);
      if (ecart !== 0) return ecart;
      return a.calculerFret(poidsFactureKg) - b.calculerFret(poidsFactureKg);
    });

    return applicables[0];
  };

  /* ── Surcharges ─────────────────────────────────────────────────────────── */

  /**
   * Détermine si une surcharge automatique s'applique au contexte de l'expédition.
   * Les natures non déductibles du contexte (dangereux, hors gabarit…) restent
   * pilotées par les indicateurs portés par l'expédition.
   */
  static surchargeApplicable = (surcharge, contexte) => {
    if (!surcharge.isActive || !surcharge.automatique) return false;
    // Un prix forfaitaire s'entend tout compris, livraison incluse
    if (contexte.forfait) return false;
    if (surcharge.serviceId && surcharge.serviceId !== contexte.serviceId) return false;
    if (surcharge.internationalUniquement && !contexte.international) return false;
    if (
      surcharge.paysApplication &&
      ![contexte.paysDepart, contexte.paysArrivee].includes(surcharge.paysApplication)
    )
      return false;

    switch (surcharge.type) {
      case 'zone_eloignee':
        return Boolean(contexte.zoneEloignee);
      case 'marchandise_dangereuse':
        return Boolean(contexte.marchandiseDangereuse);
      case 'hors_gabarit':
        return Boolean(contexte.horsGabarit);
      case 'manutention':
        return Boolean(contexte.fragile || contexte.horsGabarit);
      case 'livraison_domicile':
        return contexte.modeLivraison === 'livraison_domicile';
      case 'formalites_douane':
        return Boolean(contexte.international) && contexte.typeContenu !== 'document';
      case 'assurance':
        return false; // la prime est calculée séparément, sur la valeur déclarée
      case 'stockage':
        return false; // facturée a posteriori, au dépassement du délai de garde
      default:
        return true; // carburant, sécurité et autres surcharges systématiques
    }
  };

  /**
   * Applique les surcharges automatiques au fret. Les surcharges en pourcentage
   * sont calculées séquentiellement selon leur ordre d'application, ce qui permet
   * d'asseoir une surcharge sur le cumul des précédentes.
   */
  static calculerSurcharges = async ({
    contexte,
    fret,
    poidsFactureKg,
    deviseCible,
    tauxChange,
  }) => {
    const surcharges = await Surcharge.findAll({
      where: { isActive: true, automatique: true },
      order: [
        ['ordreApplication', 'ASC'],
        ['type', 'ASC'],
      ],
    });

    const lignes = [];
    let cumul = 0;

    for (const surcharge of surcharges) {
      if (!TarificationService.surchargeApplicable(surcharge, contexte)) continue;

      const assiette =
        surcharge.assiette === 'fret_et_surcharges'
          ? fret + cumul
          : surcharge.assiette === 'valeur_declaree'
            ? Number(contexte.valeurDeclaree || 0)
            : fret;

      let montant = surcharge.calculer({ assiette, poidsKg: poidsFactureKg });
      // Un montant fixe ou un tarif au kilo est libellé dans la devise de la surcharge
      if (surcharge.mode !== 'pourcentage' && surcharge.devise !== deviseCible) {
        montant = convertir(montant, surcharge.devise, deviseCible, tauxChange);
      }
      montant = arrondir(montant, deviseCible);
      if (montant <= 0) continue;

      cumul += montant;
      lignes.push({
        code: surcharge.code,
        libelle: surcharge.libelle,
        type: surcharge.type,
        mode: surcharge.mode,
        valeur: Number(surcharge.valeur),
        assiette: arrondir(assiette, deviseCible),
        montant,
        soumiseTva: surcharge.soumiseTva,
      });
    }

    return { lignes, total: arrondir(cumul, deviseCible) };
  };

  /* ── Assurance ──────────────────────────────────────────────────────────── */

  /**
   * Prime ad valorem : pourcentage de la valeur déclarée, avec un plancher.
   * La franchise incluse dans le service est déduite de l'assiette.
   */
  static calculerAssurance = ({
    valeurDeclaree,
    deviseValeur,
    service,
    parametres,
    deviseCible,
    tauxChange,
  }) => {
    const valeur = Number(valeurDeclaree || 0);
    if (valeur <= 0) return { montant: 0, assiette: 0, taux: 0 };

    const valeurCible =
      deviseValeur === deviseCible
        ? valeur
        : convertir(valeur, deviseValeur, deviseCible, tauxChange);

    const franchise = Number(service?.assuranceIncluse || 0);
    const assiette = Math.max(0, valeurCible - franchise);
    if (assiette <= 0)
      return { montant: 0, assiette: 0, taux: Number(parametres.taux_assurance_pourcent) };

    const taux = Number(parametres.taux_assurance_pourcent);
    const minimum = convertir(
      Number(parametres.assurance_prime_minimum_xof),
      'XOF',
      deviseCible,
      tauxChange
    );
    const brut = (assiette * taux) / 100;

    return {
      montant: arrondir(Math.max(brut, minimum), deviseCible),
      assiette: arrondir(assiette, deviseCible),
      taux,
    };
  };

  /* ── Douane ─────────────────────────────────────────────────────────────── */

  /**
   * Estime les droits et taxes à l'import.
   *
   * Le détail par article prime lorsqu'il est disponible : chaque ligne porte son
   * propre taux issu de son code SH. À défaut, le taux général du paramétrage
   * s'applique à la valeur déclarée. Les documents et les envois sous le seuil de
   * franchise ne sont pas taxés.
   */
  static calculerDroitsDouane = ({
    international,
    typeContenu,
    incoterm,
    valeurDeclaree,
    deviseValeur,
    articles = [],
    parametres,
    deviseCible,
    tauxChange,
  }) => {
    const nul = { droits: 0, taxes: 0, total: 0, assiette: 0, tauxMoyen: 0, applicable: false };
    if (!international || typeContenu === 'document') return nul;

    const valeur = Number(valeurDeclaree || 0);
    if (valeur <= 0) return nul;

    const valeurCible =
      deviseValeur === deviseCible
        ? valeur
        : convertir(valeur, deviseValeur, deviseCible, tauxChange);

    const franchise = convertir(
      Number(parametres.franchise_douaniere_xof),
      'XOF',
      deviseCible,
      tauxChange
    );
    if (valeurCible <= franchise) return { ...nul, assiette: arrondir(valeurCible, deviseCible) };

    let droits;
    if (articles.length) {
      droits = articles.reduce((acc, a) => {
        const ligne = Number(a.quantite || 1) * Number(a.valeurUnitaire || 0);
        const taux = Number(a.tauxDroits ?? parametres.taux_droits_douane_defaut);
        return acc + (ligne * taux) / 100;
      }, 0);
    } else {
      droits = (valeurCible * Number(parametres.taux_droits_douane_defaut)) / 100;
    }

    // La TVA à l'import porte sur la valeur en douane majorée des droits
    const tauxTva = Number(parametres.tva_sn);
    const taxes = ((valeurCible + droits) * tauxTva) / 100;

    return {
      droits: arrondir(droits, deviseCible),
      taxes: arrondir(taxes, deviseCible),
      total: arrondir(droits + taxes, deviseCible),
      assiette: arrondir(valeurCible, deviseCible),
      tauxMoyen: valeurCible ? Number(((droits / valeurCible) * 100).toFixed(2)) : 0,
      // En DAP les droits sont dus par le destinataire à l'arrivée, hors facture de transport
      applicable: incoterm === 'DDP',
    };
  };

  /* ── Grille forfaitaire (catégories 1 et 2) ─────────────────────────────── */

  /**
   * Ville sénégalaise du trajet : c'est elle qui détermine la colonne de la
   * grille forfaitaire (Dakar ou autres régions), dans un sens comme dans l'autre.
   */
  static villeSenegalaise = (villeDepart, villeArrivee) => {
    if (villeArrivee.pays === 'SN') return villeArrivee;
    if (villeDepart.pays === 'SN') return villeDepart;
    return null;
  };

  /**
   * Résout les articles demandés dans la grille forfaitaire et calcule chaque ligne.
   * Pour la catégorie 1, en l'absence d'article explicite, le forfait « documents »
   * du corridor est retenu d'office.
   */
  static resoudreForfait = async ({
    articles = [],
    categorie,
    service,
    paysDepart,
    paysArrivee,
    zoneDakar,
  }) => {
    let demandes = articles;
    if (!demandes.length && categorie === 'documents') {
      const parDefaut = await ArticleTarif.findOne({
        where: {
          categorie: 'documents',
          paysDepart,
          paysArrivee,
          modeTransport: service.modeTransport,
          isActive: true,
        },
        order: [['ordreAffichage', 'ASC']],
      });
      if (!parDefaut) return null;
      demandes = [{ articleTarifId: parDefaut.id, quantite: 1 }];
    }
    if (!demandes.length) return null;

    const ids = [...new Set(demandes.map((a) => a.articleTarifId))];
    const trouves = await ArticleTarif.findAll({ where: { id: ids } });

    const lignes = demandes.map((demande) => {
      const article = trouves.find((a) => a.id === demande.articleTarifId);
      if (!article || !article.isActive) {
        throw new BadRequestError("Un article de la grille tarifaire n'est plus proposé");
      }
      if (article.paysDepart !== paysDepart || article.paysArrivee !== paysArrivee) {
        throw new BadRequestError(`« ${article.libelle} » n'est pas proposé sur ce trajet`);
      }
      if (article.modeTransport !== service.modeTransport) {
        throw new BadRequestError(
          `« ${article.libelle} » n'est pas proposé en fret ${service.modeTransport}`
        );
      }
      const quantite = Number(demande.quantite || 1);
      const prixUnitaire = article.prixPour(zoneDakar);
      return {
        articleTarifId: article.id,
        code: article.code,
        libelle: article.libelle,
        categorie: article.categorie,
        quantite,
        prixUnitaire,
        prixAPartirDe: article.prixAPartirDe,
        montant: prixUnitaire * quantite,
        devise: article.devise,
        poidsUnitaireKg: article.poidsMaxKg === null ? null : Number(article.poidsMaxKg),
      };
    });

    return lignes;
  };

  /**
   * Quand le client choisit des articles sans détailler ses colis, chaque unité
   * devient une pièce physique (avec son propre numéro de suivi), au poids
   * indicatif de l'article.
   */
  static piecesDepuisForfait = (lignes, categorie) =>
    lignes.flatMap((ligne) =>
      Array.from({ length: ligne.quantite }, () => ({
        designation: ligne.libelle,
        typeEmballage: categorie === 'documents' ? 'enveloppe' : 'autre',
        poidsKg: ligne.poidsUnitaireKg || (categorie === 'documents' ? 0.5 : 1),
      }))
    );

  /* ── Prestations annexes ────────────────────────────────────────────────── */

  /** Prix HT d'une grille « par palier » : le premier palier qui couvre la valeur. */
  static prixPalier = (grille = [], cle, valeur) => {
    const paliers = [...(grille || [])].sort((a, b) => Number(a[cle]) - Number(b[cle]));
    const palier = paliers.find((p) => Number(valeur) <= Number(p[cle]));
    return palier ? Number(palier.prixHt) : null;
  };

  /**
   * Frais de collecte à domicile, étiquette Colissimo et emballages achetés.
   * Chaque ligne est exprimée HT dans la devise de facturation.
   */
  static calculerAnnexes = async ({
    modeDepot,
    optionColissimo,
    paysDepart,
    pieces,
    emballages = [],
    categorie,
    devise,
    tauxChange,
    tauxTva,
    prixTtc,
    params,
  }) => {
    const lignes = [];
    const ajouter = (code, libelle, montantHt, deviseSource, extra = {}) => {
      const montant = arrondir(convertir(montantHt, deviseSource, devise, tauxChange), devise);
      if (montant > 0) lignes.push({ code, libelle, montant, soumiseTva: true, ...extra });
    };

    // Collecte à domicile : grille par nombre de colis en France, forfait au Sénégal
    if (modeDepot === 'enlevement_domicile') {
      if (paysDepart === 'FR') {
        const nbColis = Math.max(1, pieces.length);
        const grille = params.grille_enlevement_domicile_fr || [];
        let prix = TarificationService.prixPalier(grille, 'nbColis', nbColis);
        if (prix === null && grille.length) {
          // Au-delà du dernier palier, on prolonge la progression de la grille
          const tries = [...grille].sort((a, b) => a.nbColis - b.nbColis);
          const dernier = tries[tries.length - 1];
          const pas = tries.length > 1 ? dernier.prixHt - tries[tries.length - 2].prixHt : 0;
          prix = Number(dernier.prixHt) + pas * (nbColis - dernier.nbColis);
        }
        ajouter('COLLECTE', `Collecte à domicile (${nbColis} colis)`, prix || 0, 'EUR');
      } else {
        ajouter(
          'COLLECTE',
          'Collecte à domicile',
          Number(params.frais_enlevement_domicile_xof || 0),
          'XOF'
        );
      }
    }

    // Étiquette Colissimo achetée par notre intermédiaire, tarif par colis selon son poids
    if (modeDepot === 'envoi_postal' && optionColissimo) {
      if (!params.option_colissimo_active) {
        throw new BadRequestError("L'achat d'étiquette Colissimo n'est pas proposé actuellement");
      }
      if (paysDepart !== 'FR') {
        throw new BadRequestError("L'option Colissimo n'est disponible qu'au départ de la France");
      }
      let total = 0;
      for (const piece of pieces) {
        const prix = TarificationService.prixPalier(
          params.grille_colissimo,
          'poidsMaxKg',
          Number(piece.poidsKg)
        );
        if (prix === null) {
          throw new BadRequestError(
            `Colissimo n'accepte pas les colis de ${piece.poidsKg} kg : choisissez un dépôt`
          );
        }
        total += prix;
      }
      ajouter('COLISSIMO', `Étiquette Colissimo (${pieces.length} colis)`, total, 'EUR');
    }

    // Emballages : barigots, cartons ou prestation d'emballage sur site
    if (emballages.length) {
      const trouves = await Emballage.findAll({
        where: { id: [...new Set(emballages.map((e) => e.emballageId))] },
      });
      for (const demande of emballages) {
        const emballage = trouves.find((e) => e.id === demande.emballageId);
        if (!emballage || !emballage.isActive) {
          throw new BadRequestError("Un emballage demandé n'est plus proposé");
        }
        if (!(emballage.categoriesEligibles || []).includes(categorie)) {
          throw new BadRequestError(`« ${emballage.libelle} » n'est pas proposé pour ce colis`);
        }
        const quantite = Number(demande.quantite || 1);
        if (emballage.stock !== null && emballage.stock < quantite) {
          throw new BadRequestError(`Stock insuffisant pour « ${emballage.libelle} »`);
        }
        // Les prix d'emballage sont affichés comme ceux de la grille (TTC si paramétré)
        const unitaire = prixTtc
          ? Number(emballage.prix) / (1 + tauxTva / 100)
          : Number(emballage.prix);
        ajouter(
          `EMB-${emballage.code}`,
          `${emballage.libelle}${quantite > 1 ? ` × ${quantite}` : ''}`,
          unitaire * quantite,
          emballage.devise,
          { emballageId: emballage.id, quantite }
        );
      }
    }

    return {
      lignes,
      total: arrondir(
        lignes.reduce((a, l) => a + l.montant, 0),
        devise
      ),
    };
  };

  /* ── Devis complet ──────────────────────────────────────────────────────── */

  /** Devise de facturation : celle du pays de celui qui règle la prestation. */
  static deviseDeFacturation = (paysDepart, paysArrivee, payeur) =>
    PAYS[payeur === 'destinataire' ? paysArrivee : paysDepart].devise;

  static chargerVille = async (villeId, role) => {
    const ville = await Ville.findByPk(villeId, {
      include: [
        {
          model: Zone,
          as: 'zone',
          attributes: ['id', 'code', 'nom', 'majorationPourcent', 'delaiSupplementaireJours'],
        },
      ],
    });
    if (!ville) throw new BadRequestError(`Ville ${role} introuvable`);
    if (!ville.isActive)
      throw new BadRequestError(`La ville ${role} « ${ville.nom} » n'est plus desservie`);
    return ville;
  };

  /**
   * Établit le devis d'une expédition pour un service donné.
   * Renvoie le montant total, sa décomposition complète et la date de livraison estimée.
   *
   * Trois modes de calcul coexistent, selon la catégorie du colis :
   * - `forfait` (catégories 1 et 2) : prix fixe par article de la grille, livraison
   *   incluse, selon la colonne Dakar ou autres régions ;
   * - `poids` : grille au kilo du service (fret maritime ou aérien), pour un colis
   *   de catégorie 2 décrit par ses dimensions et son poids ;
   * - `sur_devis` (catégorie 3) : le montant calculé n'est qu'une estimation, le prix
   *   définitif étant proposé par l'administrateur après étude de la demande.
   */
  static calculerDevis = async ({
    service,
    villeDepart,
    villeArrivee,
    categorie = 'colis_moyen',
    articles = [],
    emballages = [],
    optionColissimo = false,
    pieces = [],
    poidsReelKg = null,
    typeContenu = 'marchandise',
    valeurDeclaree = 0,
    deviseValeur = null,
    assuranceSouscrite = false,
    modeDepot = 'point_collecte',
    modeLivraison = 'point_retrait',
    incoterm = 'DAP',
    payeur = 'expediteur',
    fragile = false,
    marchandiseDangereuse = false,
    articlesDouane = [],
    remiseContractuelle = 0,
    remiseParrainagePourcent = 0,
    creditParrainage = 0,
    dateDepot = new Date(),
    parametres = null,
  }) => {
    const params = parametres || (await parametreService.chargerTous());
    const tauxChange = Number(params.taux_change_eur_xof);
    const regles = REGLES_CATEGORIE[categorie] || REGLES_CATEGORIE.colis_moyen;
    const surDevis = regles.tarification === 'sur_devis';
    const contenu = categorie === 'documents' ? 'document' : typeContenu;

    const paysDepart = villeDepart.pays;
    const paysArrivee = villeArrivee.pays;
    const international = estInternational(paysDepart, paysArrivee);
    const devise = TarificationService.deviseDeFacturation(paysDepart, paysArrivee, payeur);
    const deviseValeurRetenue = deviseValeur || devise;
    const paysFacturation = payeur === 'destinataire' ? paysArrivee : paysDepart;
    const tauxTva = Number(paysFacturation === 'FR' ? params.tva_fr : params.tva_sn);
    const prixTtc = Boolean(params.prix_forfaits_ttc);

    if (!regles.modesDepot.includes(modeDepot)) {
      throw new BadRequestError(
        `Ce mode de remise n'est pas proposé pour la catégorie « ${regles.libelle} »`
      );
    }

    const typesAutorises = service.typesContenuAutorises || [];
    if (typesAutorises.length && !typesAutorises.includes(contenu)) {
      throw new BadRequestError(
        `Le service « ${service.nom} » n'accepte pas le contenu de type « ${contenu} »`
      );
    }

    // 1. Grille forfaitaire éventuelle : colonne Dakar ou autres régions
    const villeSn = TarificationService.villeSenegalaise(villeDepart, villeArrivee);
    const zoneDakar = Boolean(villeSn?.zoneTarifDakar);
    const lignesForfait = await TarificationService.resoudreForfait({
      articles,
      categorie,
      service,
      paysDepart,
      paysArrivee,
      zoneDakar,
    });

    // 2. Poids facturé — à défaut de colis détaillés, une pièce par article choisi.
    // Des documents sans forfait sur le trajet sont tarifés au poids : une
    // enveloppe standard, faute de quoi le colis partirait à 0 kg (refusé en base).
    const sansPoids = !pieces.length && !poidsReelKg;
    let piecesRetenues = pieces;
    if (sansPoids && lignesForfait) {
      piecesRetenues = TarificationService.piecesDepuisForfait(lignesForfait, categorie);
    } else if (sansPoids && categorie === 'documents') {
      piecesRetenues = [{ designation: 'Enveloppe', typeEmballage: 'enveloppe', poidsKg: 0.5 }];
    }
    const coefficient = Number(
      service.coefficientVolumetrique || params.coefficient_volumetrique_defaut
    );
    const poids = TarificationService.calculerPoids({
      pieces: piecesRetenues,
      poidsReelKg,
      coefficient,
      pasArrondi: Number(params.arrondi_poids_kg),
    });

    const horsGabarit = service.dimensionsMaxCm
      ? piecesRetenues.some(
          (p) =>
            Number(p.longueurCm || 0) + Number(p.largeurCm || 0) + Number(p.hauteurCm || 0) >
            Number(service.dimensionsMaxCm)
        )
      : false;

    // 3. Fret
    let modeTarification;
    let tarifApplique = null;
    let fret = 0;
    let montantMajorationZone = 0;

    if (lignesForfait) {
      modeTarification = surDevis ? 'sur_devis' : 'forfait';
      const fretTtcOuHt = lignesForfait.reduce(
        (acc, l) => acc + convertir(l.montant, l.devise, devise, tauxChange),
        0
      );
      fret = arrondir(prixTtc ? fretTtcOuHt / (1 + tauxTva / 100) : fretTtcOuHt, devise);
      tarifApplique = {
        type: 'forfait',
        zone: zoneDakar ? 'dakar' : 'autres_regions',
        prixTtc,
      };
    } else {
      modeTarification = surDevis ? 'sur_devis' : 'poids';
      // Le gabarit du service ne s'impose qu'au calcul au poids ; un colis XXL est étudié au cas par cas
      if (!surDevis && poids.poidsReelKg > Number(service.poidsMaxKg)) {
        throw new BadRequestError(
          `Le service « ${service.nom} » est limité à ${service.poidsMaxKg} kg (poids déclaré : ${poids.poidsReelKg} kg)`
        );
      }
      const tarif = await TarificationService.trouverTarif({
        serviceId: service.id,
        paysDepart,
        paysArrivee,
        zoneDepartId: villeDepart.zoneId,
        zoneArriveeId: villeArrivee.zoneId,
        poidsFactureKg: poids.poidsFactureKg,
        date: new Date(dateDepot),
      });
      if (!tarif && !surDevis) {
        throw new NotFoundError(
          `Aucun tarif actif pour ${villeDepart.nom} vers ${villeArrivee.nom} en ${service.nom} ` +
            `(${poids.poidsFactureKg} kg)`
        );
      }
      if (tarif) {
        fret = tarif.calculerFret(poids.poidsFactureKg);
        fret = Math.max(fret, Number(tarif.montantMinimum));
        if (tarif.devise !== devise) fret = convertir(fret, tarif.devise, devise, tauxChange);

        // Majoration de zone d'arrivée (desserte difficile), portée par le référentiel
        const majorationZone = Number(villeArrivee.zone?.majorationPourcent || 0);
        montantMajorationZone = arrondir((fret * majorationZone) / 100, devise);
        fret = arrondir(fret + montantMajorationZone, devise);
        tarifApplique = {
          type: 'poids',
          id: tarif.id,
          trancheMinKg: Number(tarif.poidsMinKg),
          trancheMaxKg: tarif.poidsMaxKg === null ? null : Number(tarif.poidsMaxKg),
          prixBase: Number(tarif.prixBase),
          prixParKgSupplementaire: Number(tarif.prixParKgSupplementaire),
          deviseTarif: tarif.devise,
        };
      }
    }

    // Remises : contrat ou tarif professionnel, puis bonus de bienvenue du filleul
    const tauxRemise = Math.min(
      100,
      Number(remiseContractuelle || 0) + Number(remiseParrainagePourcent || 0)
    );
    const montantRemise = arrondir((fret * tauxRemise) / 100, devise);
    const montantRemiseParrainage = arrondir(
      (fret * Number(remiseParrainagePourcent || 0)) / 100,
      devise
    );
    const fretNet = arrondir(fret - montantRemise, devise);

    // 4. Surcharges automatiques (sans objet pour un forfait, tout compris)
    const contexte = {
      serviceId: service.id,
      paysDepart,
      paysArrivee,
      international,
      typeContenu: contenu,
      modeDepot,
      modeLivraison,
      fragile,
      marchandiseDangereuse,
      horsGabarit,
      zoneEloignee: Boolean(villeArrivee.isZoneEloignee || villeDepart.isZoneEloignee),
      valeurDeclaree,
      forfait: modeTarification === 'forfait',
    };
    const surcharges = await TarificationService.calculerSurcharges({
      contexte,
      fret: fretNet,
      poidsFactureKg: poids.poidsFactureKg,
      deviseCible: devise,
      tauxChange,
    });

    // 5. Prestations annexes : collecte, Colissimo, emballages
    const annexes = await TarificationService.calculerAnnexes({
      modeDepot,
      optionColissimo,
      paysDepart,
      pieces: piecesRetenues.length ? piecesRetenues : [{ poidsKg: poids.poidsReelKg }],
      emballages,
      categorie,
      devise,
      tauxChange,
      tauxTva,
      prixTtc,
      params,
    });

    // 6. Assurance
    const assurance = assuranceSouscrite
      ? TarificationService.calculerAssurance({
          valeurDeclaree,
          deviseValeur: deviseValeurRetenue,
          service,
          parametres: params,
          deviseCible: devise,
          tauxChange,
        })
      : { montant: 0, assiette: 0, taux: 0 };

    // 7. Douane
    const douane = TarificationService.calculerDroitsDouane({
      international,
      typeContenu: contenu,
      incoterm,
      valeurDeclaree,
      deviseValeur: deviseValeurRetenue,
      articles: articlesDouane,
      parametres: params,
      deviseCible: devise,
      tauxChange,
    });

    // 8. Crédit de parrainage : imputé TTC, donc converti en remise hors taxes
    const surchargesTotal = arrondir(surcharges.total + annexes.total, devise);
    const htAvantCredit = arrondir(fretNet + surchargesTotal + assurance.montant, devise);
    const creditDisponible = convertir(Number(creditParrainage || 0), 'EUR', devise, tauxChange);
    const creditHt = surDevis
      ? 0
      : arrondir(Math.min(creditDisponible / (1 + tauxTva / 100), htAvantCredit), devise);

    // 9. TVA sur la prestation (pays de facturation)
    const baseSurchargesTaxables = [...surcharges.lignes, ...annexes.lignes]
      .filter((l) => l.soumiseTva)
      .reduce((acc, l) => acc + l.montant, 0);
    const baseTva = Math.max(0, fretNet + baseSurchargesTaxables + assurance.montant - creditHt);
    const montantTva = arrondir((baseTva * tauxTva) / 100, devise);

    // 10. Total : les droits ne sont intégrés qu'en DDP, où nous les avançons
    const droitsFactures = douane.applicable ? douane.total : 0;
    const montantHt = arrondir(htAvantCredit - creditHt, devise);
    const montantTotal = arrondir(montantHt + montantTva + droitsFactures, devise);
    const creditTtc = arrondir(creditHt * (1 + tauxTva / 100), devise);

    // 11. Délai
    const delai = await calculerDateLivraisonEstimee({
      service,
      paysDepart,
      paysArrivee,
      delaiSupplementaireJours:
        Number(villeArrivee.zone?.delaiSupplementaireJours || 0) +
        (villeArrivee.isZoneEloignee ? 1 : 0),
      dateDepot,
    });

    return {
      service: {
        id: service.id,
        code: service.code,
        nom: service.nom,
        modeTransport: service.modeTransport,
      },
      categorie: {
        code: categorie,
        numero: regles.numero,
        libelle: regles.libelle,
        validationAdmin: regles.validationAdmin,
        paiement: regles.paiement,
      },
      modeTarification,
      surDevis,
      messageTarification: surDevis
        ? `Estimation indicative : le prix définitif vous sera proposé sous ${params.delai_etude_demande_heures} h après étude de votre demande.`
        : modeTarification === 'forfait'
          ? 'Prix forfaitaire, livraison incluse.'
          : null,
      devise,
      poids,
      tarifApplique,
      lignesForfait: lignesForfait || [],
      piecesRetenues,
      montants: {
        fretBrut: arrondir(fret, devise),
        majorationZone: montantMajorationZone,
        remiseContractuelle: arrondir(montantRemise - montantRemiseParrainage, devise),
        remiseParrainage: montantRemiseParrainage,
        fret: fretNet,
        surcharges: surchargesTotal,
        prestationsAnnexes: annexes.total,
        assurance: assurance.montant,
        creditParrainage: creditTtc,
        creditParrainageHt: creditHt,
        totalHt: montantHt,
        tauxTva,
        tva: montantTva,
        droitsDouane: droitsFactures,
        total: montantTotal,
      },
      creditParrainageUtiliseEur: surDevis
        ? 0
        : arrondir(convertir(creditTtc, devise, 'EUR', tauxChange), 'EUR'),
      detailSurcharges: surcharges.lignes,
      detailAnnexes: annexes.lignes,
      detailAssurance: assurance,
      detailDouane: {
        ...douane,
        commentaire: douane.applicable
          ? 'Droits et taxes avancés par Yobante Colis et refacturés (DDP)'
          : international && contenu !== 'document'
            ? 'Droits et taxes estimés, à régler par le destinataire au dédouanement (DAP)'
            : 'Aucune formalité douanière',
      },
      delai: {
        dateLivraisonEstimee: delai.dateEstimee.toISOString().slice(0, 10),
        dateAuPlusTot: delai.dateAuPlusTot.toISOString().slice(0, 10),
        delaiJours: delai.delaiApplique,
        joursOuvres: service.joursOuvresUniquement,
        departReporte: delai.departReporte,
      },
      corridor: {
        paysDepart,
        paysArrivee,
        international,
        villeDepart: { id: villeDepart.id, nom: villeDepart.nom },
        villeArrivee: { id: villeArrivee.id, nom: villeArrivee.nom },
        zoneTarifaire: villeSn ? (zoneDakar ? 'dakar' : 'autres_regions') : null,
      },
    };
  };

  /**
   * Compare tous les services actifs pour un même besoin d'expédition.
   * Les services inéligibles (gabarit, contenu, absence de tarif) sont écartés avec
   * leur motif, afin que l'interface puisse l'expliquer au client.
   */
  static comparerServices = async (params) => {
    const [villeDepart, villeArrivee, services, parametres] = await Promise.all([
      TarificationService.chargerVille(params.villeDepartId, 'de départ'),
      TarificationService.chargerVille(params.villeArriveeId, "d'arrivée"),
      ServiceExpedition.findAll({ where: { isActive: true }, order: [['ordreAffichage', 'ASC']] }),
      parametreService.chargerTous(),
    ]);

    if (!services.length)
      throw new NotFoundError("Aucun service d'expédition n'est actuellement proposé");

    const offres = [];
    const indisponibles = [];

    for (const service of services) {
      try {
        offres.push(
          await TarificationService.calculerDevis({
            ...params,
            service,
            villeDepart,
            villeArrivee,
            parametres,
          })
        );
      } catch (err) {
        indisponibles.push({
          service: { id: service.id, code: service.code, nom: service.nom },
          motif: err.message,
        });
      }
    }

    offres.sort((a, b) => a.montants.total - b.montants.total);
    return { offres, indisponibles, villeDepart, villeArrivee };
  };
}

module.exports = TarificationService;
