const { ParametreSysteme } = require('../models');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');
const cache = require('../config/cache');
const { logActivity } = require('./activityLog.service');

class ParametreService {
  static CLE_CACHE = 'parametres:tous';
  static TTL_CACHE = 5 * 60 * 1000;

  /**
   * Catalogue des paramètres de réglage du moteur métier.
   *
   * Chaque entrée est créée en base au premier démarrage puis pilotée depuis le
   * back-office. La valeur de repli déclarée ici garantit qu'un paramètre absent
   * ou vidé n'interrompt jamais un calcul en production.
   */
  static CATALOGUE = {
    // ── Change et devises ──────────────────────────────────────────────────
    taux_change_eur_xof: {
      valeur: '655.957',
      type: 'nombre',
      categorie: 'devise',
      libelle: 'Taux de change EUR vers XOF',
      description: 'Parité fixe du franc CFA, ajustable pour intégrer des frais de change',
    },
    devise_facturation_fr: {
      valeur: 'EUR',
      type: 'texte',
      categorie: 'devise',
      libelle: 'Devise de facturation en France',
    },
    devise_facturation_sn: {
      valeur: 'XOF',
      type: 'texte',
      categorie: 'devise',
      libelle: 'Devise de facturation au Sénégal',
    },

    // ── Tarification ───────────────────────────────────────────────────────
    coefficient_volumetrique_defaut: {
      valeur: '5000',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Diviseur du poids volumétrique par défaut',
      description: 'Appliqué lorsque le service ne définit pas son propre coefficient',
    },
    surcharge_carburant_pourcent: {
      valeur: '12',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Surcharge carburant (% du fret)',
      description: 'Révisée périodiquement selon le cours du carburant',
    },
    taux_assurance_pourcent: {
      valeur: '1.5',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Prime d assurance ad valorem (% de la valeur déclarée)',
    },
    assurance_prime_minimum_xof: {
      valeur: '1500',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Prime d assurance minimale (XOF)',
    },
    plafond_valeur_declaree_xof: {
      valeur: '3000000',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Valeur déclarée maximale acceptée (XOF)',
    },
    arrondi_poids_kg: {
      valeur: '0.5',
      type: 'nombre',
      categorie: 'tarification',
      libelle: 'Pas d arrondi du poids facturé (kg)',
      description: 'Le poids facturé est arrondi au multiple supérieur de ce pas',
    },

    // ── Taxes et douane ────────────────────────────────────────────────────
    tva_fr: { valeur: '20', type: 'nombre', categorie: 'taxes', libelle: 'Taux de TVA France (%)' },
    tva_sn: {
      valeur: '18',
      type: 'nombre',
      categorie: 'taxes',
      libelle: 'Taux de TVA Sénégal (%)',
    },
    taux_droits_douane_defaut: {
      valeur: '20',
      type: 'nombre',
      categorie: 'taxes',
      libelle: 'Taux de droits de douane par défaut (%)',
      description: 'Utilisé quand aucun code SH n est renseigné sur les articles',
    },
    franchise_douaniere_xof: {
      valeur: '30000',
      type: 'nombre',
      categorie: 'taxes',
      libelle: 'Seuil de franchise douanière (XOF)',
      description: 'En deçà de cette valeur déclarée, aucun droit n est estimé',
    },

    // ── Exploitation ───────────────────────────────────────────────────────
    delai_garde_defaut_jours: {
      valeur: '15',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Délai de garde en point de retrait (jours)',
    },
    delai_paiement_jours: {
      valeur: '7',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Délai de règlement d une facture (jours)',
    },
    nb_tentatives_livraison_max: {
      valeur: '3',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Nombre de tentatives de livraison avant mise en point relais',
    },
    frais_enlevement_domicile_xof: {
      valeur: '2000',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Frais d enlèvement à domicile (XOF)',
    },
    delai_reclamation_jours: {
      valeur: '30',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Délai de dépôt d une réclamation après livraison (jours)',
    },

    // ── Identité de l entreprise (documents) ───────────────────────────────
    entreprise_nom: {
      valeur: 'Yobnate Express',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Raison sociale',
    },
    entreprise_adresse: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Adresse du siège',
    },
    entreprise_telephone: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Téléphone',
    },
    entreprise_email: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Email de contact',
    },
    entreprise_ninea: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'NINEA (Sénégal)',
    },
    entreprise_siret: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'SIRET (France)',
    },
    entreprise_site_web: {
      valeur: '',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Site web',
    },
    mentions_facture: {
      valeur: 'Paiement à réception. Tout retard de règlement entraîne des pénalités.',
      type: 'texte',
      categorie: 'entreprise',
      libelle: 'Mentions légales des factures',
    },
  };

  static convertirValeur = (valeur, type) => {
    if (valeur === null || valeur === undefined || valeur === '') {
      return type === 'nombre' ? 0 : type === 'booleen' ? false : type === 'json' ? null : '';
    }
    if (type === 'nombre') return Number(valeur);
    if (type === 'booleen') return valeur === 'true' || valeur === '1';
    if (type === 'json') {
      try {
        return JSON.parse(valeur);
      } catch {
        return null;
      }
    }
    return String(valeur);
  };

  /** Valeurs de repli issues du catalogue, utilisées si la base est muette. */
  static valeursParDefaut = () =>
    Object.fromEntries(
      Object.entries(ParametreService.CATALOGUE).map(([cle, def]) => [
        cle,
        ParametreService.convertirValeur(def.valeur, def.type),
      ])
    );

  /**
   * Charge l'ensemble des paramètres typés, avec un cache mémoire de cinq minutes.
   * Toute écriture invalide le cache.
   */
  static chargerTous = async () => {
    const enCache = cache.get(ParametreService.CLE_CACHE);
    if (enCache) return enCache;

    const parDefaut = ParametreService.valeursParDefaut();
    let valeurs;
    try {
      const lignes = await ParametreSysteme.findAll();
      valeurs = { ...parDefaut };
      for (const ligne of lignes) {
        valeurs[ligne.cle] = ParametreService.convertirValeur(ligne.valeur, ligne.type);
      }
    } catch (_err) {
      // Table absente (première migration) : on fonctionne sur les valeurs de repli
      return parDefaut;
    }

    cache.set(ParametreService.CLE_CACHE, valeurs, ParametreService.TTL_CACHE);
    return valeurs;
  };

  static lire = async (cle) => (await ParametreService.chargerTous())[cle];

  static invaliderCache = () => cache.del(ParametreService.CLE_CACHE);

  /** Crée en base les paramètres du catalogue encore absents. */
  static initialiser = async () => {
    const existants = await ParametreSysteme.findAll({ attributes: ['cle'] });
    const connus = new Set(existants.map((p) => p.cle));
    const manquants = Object.entries(ParametreService.CATALOGUE)
      .filter(([cle]) => !connus.has(cle))
      .map(([cle, def]) => ({ cle, ...def }));

    if (manquants.length) await ParametreSysteme.bulkCreate(manquants);
    ParametreService.invaliderCache();
    return { message: `${manquants.length} paramètre(s) initialisé(s).`, crees: manquants.length };
  };

  static getAllParametres = async (filters = {}) => {
    const where = {};
    if (filters.categorie) where.categorie = filters.categorie;

    const parametres = await ParametreSysteme.findAll({
      where,
      order: [
        ['categorie', 'ASC'],
        ['cle', 'ASC'],
      ],
    });
    return {
      message: 'Paramètres système',
      parametres: parametres.map((p) => ({ ...p.toJSON(), valeurTypee: p.valeurTypee })),
    };
  };

  static getParametre = async (cle) => {
    const parametre = await ParametreSysteme.findOne({ where: { cle } });
    if (!parametre) throw new NotFoundError('Paramètre introuvable');
    return {
      message: 'Détail du paramètre',
      parametre: { ...parametre.toJSON(), valeurTypee: parametre.valeurTypee },
    };
  };

  static updateParametre = async (cle, valeur, adminId) => {
    const parametre = await ParametreSysteme.findOne({ where: { cle } });
    if (!parametre) throw new NotFoundError('Paramètre introuvable');
    if (!parametre.modifiable) throw new ForbiddenError('Ce paramètre est verrouillé');

    if (parametre.type === 'nombre' && Number.isNaN(Number(valeur))) {
      throw new BadRequestError('La valeur doit être numérique');
    }
    if (parametre.type === 'json') {
      try {
        JSON.parse(valeur);
      } catch {
        throw new BadRequestError('La valeur doit être un JSON valide');
      }
    }

    const ancienne = parametre.valeur;
    await parametre.update({ valeur: String(valeur) });
    ParametreService.invaliderCache();

    await logActivity({
      userId: adminId,
      action: 'admin.parametre.update',
      entite: 'ParametreSysteme',
      entiteId: parametre.id,
      details: { cle, ancienne, nouvelle: String(valeur) },
    });

    return {
      message: 'Paramètre mis à jour.',
      parametre: { ...parametre.toJSON(), valeurTypee: parametre.valeurTypee },
    };
  };

  /** Mise à jour groupée : { cle: valeur, … }. */
  static updatePlusieurs = async (valeurs, adminId) => {
    const resultats = [];
    for (const [cle, valeur] of Object.entries(valeurs)) {
      const { parametre } = await ParametreService.updateParametre(cle, valeur, adminId);
      resultats.push(parametre);
    }
    return { message: `${resultats.length} paramètre(s) mis à jour.`, parametres: resultats };
  };
}

module.exports = ParametreService;
