const { Op } = require('sequelize');
const { Tarif, Surcharge, ServiceExpedition, Ville, Zone } = require('../models');
const { BadRequestError, NotFoundError } = require('../errors/AppError');
const { PAYS, estInternational } = require('../constants/pays');
const { arrondir, convertir } = require('../utils/devise');
const { calculerDateLivraisonEstimee } = require('../utils/delais');
const parametreService = require('./parametre.service');

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
   */
  static calculerDevis = async ({
    service,
    villeDepart,
    villeArrivee,
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
    dateDepot = new Date(),
    parametres = null,
  }) => {
    const params = parametres || (await parametreService.chargerTous());
    const tauxChange = Number(params.taux_change_eur_xof);

    const paysDepart = villeDepart.pays;
    const paysArrivee = villeArrivee.pays;
    const international = estInternational(paysDepart, paysArrivee);
    const devise = TarificationService.deviseDeFacturation(paysDepart, paysArrivee, payeur);
    const deviseValeurRetenue = deviseValeur || devise;

    // 1. Poids facturé
    const coefficient = Number(
      service.coefficientVolumetrique || params.coefficient_volumetrique_defaut
    );
    const poids = TarificationService.calculerPoids({
      pieces,
      poidsReelKg,
      coefficient,
      pasArrondi: Number(params.arrondi_poids_kg),
    });

    // 2. Contrôles de gabarit propres au service
    if (poids.poidsReelKg > Number(service.poidsMaxKg)) {
      throw new BadRequestError(
        `Le service « ${service.nom} » est limité à ${service.poidsMaxKg} kg (poids déclaré : ${poids.poidsReelKg} kg)`
      );
    }
    const horsGabarit = service.dimensionsMaxCm
      ? pieces.some(
          (p) =>
            Number(p.longueurCm || 0) + Number(p.largeurCm || 0) + Number(p.hauteurCm || 0) >
            Number(service.dimensionsMaxCm)
        )
      : false;

    const typesAutorises = service.typesContenuAutorises || [];
    if (typesAutorises.length && !typesAutorises.includes(typeContenu)) {
      throw new BadRequestError(
        `Le service « ${service.nom} » n'accepte pas le contenu de type « ${typeContenu} »`
      );
    }

    // 3. Fret de la tranche de poids
    const tarif = await TarificationService.trouverTarif({
      serviceId: service.id,
      paysDepart,
      paysArrivee,
      zoneDepartId: villeDepart.zoneId,
      zoneArriveeId: villeArrivee.zoneId,
      poidsFactureKg: poids.poidsFactureKg,
      date: new Date(dateDepot),
    });
    if (!tarif) {
      throw new NotFoundError(
        `Aucun tarif actif pour ${villeDepart.nom} vers ${villeArrivee.nom} en ${service.nom} ` +
          `(${poids.poidsFactureKg} kg)`
      );
    }

    let fret = tarif.calculerFret(poids.poidsFactureKg);
    fret = Math.max(fret, Number(tarif.montantMinimum));
    if (tarif.devise !== devise) fret = convertir(fret, tarif.devise, devise, tauxChange);

    // Majoration de zone d'arrivée (desserte difficile), portée par le référentiel
    const majorationZone = Number(villeArrivee.zone?.majorationPourcent || 0);
    const montantMajorationZone = arrondir((fret * majorationZone) / 100, devise);
    fret = arrondir(fret + montantMajorationZone, devise);

    // Remise contractuelle négociée du compte professionnel
    const montantRemise = arrondir((fret * Number(remiseContractuelle || 0)) / 100, devise);
    const fretNet = arrondir(fret - montantRemise, devise);

    // 4. Surcharges
    const contexte = {
      serviceId: service.id,
      paysDepart,
      paysArrivee,
      international,
      typeContenu,
      modeDepot,
      modeLivraison,
      fragile,
      marchandiseDangereuse,
      horsGabarit,
      zoneEloignee: Boolean(villeArrivee.isZoneEloignee || villeDepart.isZoneEloignee),
      valeurDeclaree,
    };
    const surcharges = await TarificationService.calculerSurcharges({
      contexte,
      fret: fretNet,
      poidsFactureKg: poids.poidsFactureKg,
      deviseCible: devise,
      tauxChange,
    });

    // 5. Assurance
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

    // 6. Douane
    const douane = TarificationService.calculerDroitsDouane({
      international,
      typeContenu,
      incoterm,
      valeurDeclaree,
      deviseValeur: deviseValeurRetenue,
      articles: articlesDouane,
      parametres: params,
      deviseCible: devise,
      tauxChange,
    });

    // 7. TVA sur la prestation de transport (pays de facturation)
    const paysFacturation = payeur === 'destinataire' ? paysArrivee : paysDepart;
    const tauxTva = Number(paysFacturation === 'FR' ? params.tva_fr : params.tva_sn);
    const baseSurchargesTaxables = surcharges.lignes
      .filter((l) => l.soumiseTva)
      .reduce((acc, l) => acc + l.montant, 0);
    const baseTva = fretNet + baseSurchargesTaxables + assurance.montant;
    const montantTva = arrondir((baseTva * tauxTva) / 100, devise);

    // 8. Total : les droits ne sont intégrés qu'en DDP, où nous les avançons
    const droitsFactures = douane.applicable ? douane.total : 0;
    const montantHt = arrondir(fretNet + surcharges.total + assurance.montant, devise);
    const montantTotal = arrondir(montantHt + montantTva + droitsFactures, devise);

    // 9. Délai
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
      devise,
      poids,
      tarifApplique: {
        id: tarif.id,
        trancheMinKg: Number(tarif.poidsMinKg),
        trancheMaxKg: tarif.poidsMaxKg === null ? null : Number(tarif.poidsMaxKg),
        prixBase: Number(tarif.prixBase),
        prixParKgSupplementaire: Number(tarif.prixParKgSupplementaire),
        deviseTarif: tarif.devise,
      },
      montants: {
        fretBrut: arrondir(fret, devise),
        majorationZone: montantMajorationZone,
        remiseContractuelle: montantRemise,
        fret: fretNet,
        surcharges: surcharges.total,
        assurance: assurance.montant,
        totalHt: montantHt,
        tauxTva,
        tva: montantTva,
        droitsDouane: droitsFactures,
        total: montantTotal,
      },
      detailSurcharges: surcharges.lignes,
      detailAssurance: assurance,
      detailDouane: {
        ...douane,
        commentaire: douane.applicable
          ? 'Droits et taxes avancés par Yobnate Express et refacturés (DDP)'
          : international && typeContenu !== 'document'
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
