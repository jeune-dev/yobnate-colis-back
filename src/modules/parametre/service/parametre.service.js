const { ParametreSysteme } = require('../../../models');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../../errors/AppError');
const cache = require('../../../utils/cache');
const { logActivity } = require('../../activityLog/service/activityLog.service');

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
    seuil_alerte_stock_emballages: {
      valeur: '5',
      type: 'nombre',
      categorie: 'exploitation',
      libelle: 'Seuil d alerte de stock des emballages (tableau de bord)',
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

    // ── Catégories et étude des demandes ───────────────────────────────────
    delai_etude_demande_heures: {
      valeur: '24',
      type: 'nombre',
      categorie: 'expedition',
      libelle: 'Délai d étude d une demande (heures)',
      description: 'Engagement de réponse pour les catégories 2 et 3',
    },
    delai_validite_proposition_jours: {
      valeur: '7',
      type: 'nombre',
      categorie: 'expedition',
      libelle: 'Durée de validité d une proposition tarifaire (jours)',
    },
    prix_forfaits_ttc: {
      valeur: 'true',
      type: 'booleen',
      categorie: 'expedition',
      libelle: 'Les prix de la grille forfaitaire sont exprimés TTC',
      description: 'Si vrai, la TVA est incluse dans le prix affiché au lieu d être ajoutée',
    },
    prefixe_numero_suivi: {
      valeur: 'PN',
      type: 'texte',
      categorie: 'expedition',
      libelle: 'Préfixe des numéros de suivi',
      description: 'Ex. PN pour PNCO0126032026MDT03',
    },
    code_conteneur_numero_suivi: {
      valeur: 'CO',
      type: 'texte',
      categorie: 'expedition',
      libelle: 'Code « conteneur » des numéros de suivi',
    },
    adresse_reception_fr: {
      valeur:
        '{"nom": "Yobnate Express — Réception France", "adresse": "", "codePostal": "", "ville": "Clermont-Ferrand", "telephone": "", "instructions": "Indiquez votre nom et votre numéro de suivi sur le colis."}',
      type: 'json',
      categorie: 'expedition',
      libelle: 'Adresse de réception des colis en France',
      description: 'Communiquée au client pour un dépôt ou un envoi postal',
    },
    adresse_reception_sn: {
      valeur:
        '{"nom": "Yobnate Express — Plateforme Dakar", "adresse": "", "quartier": "", "arrondissement": "", "departement": "Dakar", "pointRepere": "", "telephone": ""}',
      type: 'json',
      categorie: 'expedition',
      libelle: 'Adresse de réception des colis au Sénégal (flux inverse)',
    },
    produits_interdits: {
      valeur:
        '["Produits inflammables, explosifs ou gaz sous pression", "Batteries lithium seules", "Armes et munitions", "Stupéfiants", "Denrées périssables", "Liquides de plus de 1 litre", "Espèces, bijoux et objets de valeur non déclarés", "Contrefaçons"]',
      type: 'json',
      categorie: 'expedition',
      libelle: 'Produits interdits (information fret aérien)',
    },

    // ── Collecte et envois postaux ─────────────────────────────────────────
    collecte_domicile_active: {
      valeur: 'true',
      type: 'booleen',
      categorie: 'collecte',
      libelle: 'Collecte à domicile activée',
    },
    grille_enlevement_domicile_fr: {
      valeur:
        '[{"nbColis":1,"prixHt":3.6},{"nbColis":2,"prixHt":4.7},{"nbColis":3,"prixHt":5.8},{"nbColis":4,"prixHt":6.9},{"nbColis":5,"prixHt":8.0},{"nbColis":6,"prixHt":9.1},{"nbColis":7,"prixHt":10.2},{"nbColis":8,"prixHt":11.3},{"nbColis":9,"prixHt":12.4},{"nbColis":10,"prixHt":13.5},{"nbColis":11,"prixHt":14.6},{"nbColis":12,"prixHt":15.7},{"nbColis":13,"prixHt":16.8},{"nbColis":14,"prixHt":17.9},{"nbColis":15,"prixHt":19.0}]',
      type: 'json',
      categorie: 'collecte',
      libelle: 'Tarif HT de l enlèvement à domicile en France, par nombre de colis',
    },
    option_colissimo_active: {
      valeur: 'true',
      type: 'booleen',
      categorie: 'collecte',
      libelle: 'Achat d une étiquette Colissimo proposé au client',
    },
    grille_colissimo: {
      valeur:
        '[{"poidsMaxKg":0.25,"prixHt":7.89},{"poidsMaxKg":0.5,"prixHt":8.76},{"poidsMaxKg":0.75,"prixHt":9.65},{"poidsMaxKg":1,"prixHt":10.39},{"poidsMaxKg":2,"prixHt":11.53},{"poidsMaxKg":3,"prixHt":12.54},{"poidsMaxKg":4,"prixHt":13.59},{"poidsMaxKg":5,"prixHt":14.59},{"poidsMaxKg":6,"prixHt":15.22},{"poidsMaxKg":7,"prixHt":16.21},{"poidsMaxKg":8,"prixHt":17.2},{"poidsMaxKg":9,"prixHt":18.22},{"poidsMaxKg":10,"prixHt":19.22},{"poidsMaxKg":11,"prixHt":19.84},{"poidsMaxKg":12,"prixHt":20.82},{"poidsMaxKg":13,"prixHt":21.79},{"poidsMaxKg":14,"prixHt":22.8},{"poidsMaxKg":15,"prixHt":23.78},{"poidsMaxKg":16,"prixHt":24.75},{"poidsMaxKg":17,"prixHt":25.73},{"poidsMaxKg":18,"prixHt":26.71},{"poidsMaxKg":19,"prixHt":27.7},{"poidsMaxKg":20,"prixHt":28.67},{"poidsMaxKg":21,"prixHt":29.38},{"poidsMaxKg":22,"prixHt":30.34},{"poidsMaxKg":23,"prixHt":31.33},{"poidsMaxKg":24,"prixHt":32.3},{"poidsMaxKg":25,"prixHt":33.24},{"poidsMaxKg":26,"prixHt":34.24},{"poidsMaxKg":27,"prixHt":35.18},{"poidsMaxKg":28,"prixHt":36.16},{"poidsMaxKg":29,"prixHt":37.17},{"poidsMaxKg":30,"prixHt":38.1}]',
      type: 'json',
      categorie: 'collecte',
      libelle: 'Tarif HT Colissimo par tranche de poids',
    },

    // ── Tarif préférentiel et parrainage ───────────────────────────────────
    remise_professionnelle_pourcent: {
      valeur: '10',
      type: 'nombre',
      categorie: 'commercial',
      libelle: 'Remise accordée aux professionnels (NINEA ou Kbis validé) (%)',
    },
    parrainage_actif: {
      valeur: 'true',
      type: 'booleen',
      categorie: 'commercial',
      libelle: 'Programme de parrainage actif',
    },
    parrainage_remise_filleul_pourcent: {
      valeur: '10',
      type: 'nombre',
      categorie: 'commercial',
      libelle: 'Remise du filleul sur sa première expédition (%)',
    },
    parrainage_gain_parrain_eur: {
      valeur: '5',
      type: 'nombre',
      categorie: 'commercial',
      libelle: 'Crédit offert au parrain à la première expédition du filleul (EUR)',
    },

    // ── Comptes et notifications ───────────────────────────────────────────
    verification_email_obligatoire: {
      valeur: 'true',
      type: 'booleen',
      categorie: 'comptes',
      libelle: 'Connexion soumise à la vérification de l adresse email',
    },
    verification_telephone_obligatoire: {
      valeur: 'false',
      type: 'booleen',
      categorie: 'comptes',
      libelle:
        'Accès aux colis reçus soumis à la vérification du numéro de téléphone (code envoyé par WhatsApp)',
    },
    whatsapp_notifications_actives: {
      valeur: 'false',
      type: 'booleen',
      categorie: 'notifications',
      libelle: 'Notifications WhatsApp activées',
      description: 'Nécessite WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID',
    },
    evenements_whatsapp: {
      valeur: '["RECEPTION", "DEPART_HUB", "ARR_PAYS", "ARR_AGENCE", "DISPO", "LIVRE"]',
      type: 'json',
      categorie: 'notifications',
      libelle: 'Événements de suivi notifiés par WhatsApp',
    },

    // ── Liens publics (site vitrine et applications) ───────────────────────
    lien_app_boutique: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Lien vers l application Boutique',
    },
    lien_app_android: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Lien Google Play',
    },
    lien_app_ios: { valeur: '', type: 'texte', categorie: 'liens', libelle: 'Lien App Store' },
    lien_chronopost: {
      valeur: 'https://www.chronopost.fr/fr/envoyer-un-colis',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Module Chronopost pour imprimer un bon d envoi',
    },
    lien_application_mesure: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Application gratuite de mesure recommandée',
    },
    lien_cgv: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Conditions générales de vente',
    },
    whatsapp_contact: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Numéro WhatsApp du service client (format international)',
    },
    url_paiement_banque: {
      valeur: '',
      type: 'texte',
      categorie: 'liens',
      libelle: 'Modèle d URL du paiement en ligne',
      description:
        'Variables : {{reference}}, {{montant}}, {{devise}}. Vide = page de paiement de l application',
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
