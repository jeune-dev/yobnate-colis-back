/**
 * Cycle de vie d'une expédition et codes d'événements de suivi.
 * Le vocabulaire suit la logique d'un intégrateur express : chaque changement de
 * statut produit un événement horodaté et localisé, visible dans le suivi public.
 */

const STATUTS_COLIS = [
  'brouillon', // expédition préparée mais non confirmée
  'en_attente_validation', // demande soumise, étude par l'administrateur (catégories 2 et 3)
  'devis_propose', // catégorie 3 : proposition tarifaire en attente d'acceptation du client
  'refuse', // demande refusée par l'administrateur ou proposition déclinée par le client
  'en_attente', // confirmée, en attente de dépôt ou d'enlèvement
  'enlevement_planifie', // enlèvement à domicile programmé
  'enleve', // récupérée chez l'expéditeur par un coursier
  'receptionne', // déposée / réceptionnée au point de collecte
  'en_preparation', // tri, pesée, mise en rotation
  'en_transit', // acheminement international
  'en_douane', // formalités douanières en cours
  'arrive', // arrivée dans le pays de destination
  'disponible_retrait', // à disposition au point de retrait
  'en_livraison', // confiée au coursier de distribution
  'livre', // livrée à l'adresse du destinataire
  'recupere', // retirée par le destinataire au point de retrait
  'retourne', // retournée à l'expéditeur
  'incident', // perdu, endommagé, refusé, bloqué
  'annule',
];

/** États terminaux : plus aucune transition possible. */
const STATUTS_TERMINAUX = ['livre', 'recupere', 'retourne', 'annule', 'refuse'];

/** Machine à états : transitions autorisées depuis chaque statut. */
const TRANSITIONS_AUTORISEES = {
  brouillon: ['en_attente', 'en_attente_validation', 'annule'],
  en_attente_validation: ['en_attente', 'devis_propose', 'refuse', 'annule'],
  devis_propose: ['en_attente', 'refuse', 'annule'],
  en_attente: ['enlevement_planifie', 'enleve', 'receptionne', 'annule'],
  enlevement_planifie: ['enleve', 'en_attente', 'annule'],
  enleve: ['receptionne', 'incident', 'annule'],
  receptionne: ['en_preparation', 'incident', 'annule'],
  en_preparation: ['en_transit', 'en_douane', 'incident', 'annule'],
  en_transit: ['en_douane', 'arrive', 'incident'],
  en_douane: ['en_transit', 'arrive', 'incident', 'retourne'],
  arrive: ['disponible_retrait', 'en_livraison', 'en_douane', 'incident'],
  disponible_retrait: ['recupere', 'en_livraison', 'retourne', 'incident'],
  en_livraison: ['livre', 'disponible_retrait', 'incident'],
  incident: ['en_transit', 'en_livraison', 'disponible_retrait', 'retourne', 'annule'],
  livre: [],
  recupere: [],
  retourne: [],
  annule: [],
  refuse: [],
};

/**
 * Codes d'événements de suivi.
 * `statut` = statut d'expédition induit (null = événement informatif sans changement d'état).
 */
const EVENEMENTS_SUIVI = {
  CRE: { libelle: 'Expédition enregistrée', statut: 'en_attente' },
  SOUMIS: { libelle: 'Demande reçue, en cours d’étude', statut: 'en_attente_validation' },
  VALIDE: { libelle: 'Demande validée par nos équipes', statut: 'en_attente' },
  DEVIS_PROPOSE: { libelle: 'Proposition tarifaire envoyée', statut: 'devis_propose' },
  DEVIS_ACCEPTE: { libelle: 'Proposition tarifaire acceptée', statut: 'en_attente' },
  DEVIS_REFUSE: { libelle: 'Proposition tarifaire déclinée', statut: 'refuse' },
  DEMANDE_REFUSEE: { libelle: 'Demande refusée', statut: 'refuse' },
  ENL_PROG: { libelle: 'Enlèvement programmé', statut: 'enlevement_planifie' },
  ENL_OK: { libelle: "Colis enlevé chez l'expéditeur", statut: 'enleve' },
  ENL_ECHEC: { libelle: 'Enlèvement infructueux', statut: null },
  DEPOT: { libelle: 'Colis déposé au point de collecte', statut: 'receptionne' },
  RECEPTION: { libelle: 'Colis pris en charge par nos équipes', statut: 'receptionne' },
  TRI: { libelle: 'Traité au centre de tri', statut: 'en_preparation' },
  MANIFESTE: { libelle: 'Affecté à une rotation', statut: 'en_preparation' },
  DOUANE_EXP: { libelle: 'Formalités douanières export en cours', statut: 'en_douane' },
  DEPART_HUB: { libelle: 'Expédié vers le port de destination', statut: 'en_transit' },
  EN_TRANSIT: { libelle: 'En transit international', statut: 'en_transit' },
  ARR_PAYS: { libelle: 'Arrivé au port de destination', statut: 'arrive' },
  DOUANE_IMP: { libelle: 'En cours de dédouanement', statut: 'en_douane' },
  DOUANE_OK: { libelle: 'Dédouanement terminé', statut: 'arrive' },
  DOUANE_BLOC: { libelle: 'Retenu par les autorités douanières', statut: 'incident' },
  ARR_AGENCE: { libelle: 'Arrivé à notre plateforme', statut: 'arrive' },
  DISPO: { libelle: 'Disponible au point de retrait', statut: 'disponible_retrait' },
  EN_LIVRAISON: { libelle: 'En cours de livraison', statut: 'en_livraison' },
  LIV_ECHEC: { libelle: 'Tentative de livraison infructueuse', statut: null },
  LIVRE: { libelle: 'Remis au destinataire', statut: 'livre' },
  RETIRE: { libelle: 'Retiré par le destinataire', statut: 'recupere' },
  REFUSE: { libelle: 'Colis refusé par le destinataire', statut: 'incident' },
  RETOUR: { libelle: 'Retour expéditeur', statut: 'retourne' },
  PERDU: { libelle: 'Colis déclaré perdu', statut: 'incident' },
  AVARIE: { libelle: 'Colis endommagé', statut: 'incident' },
  RETARD: { libelle: "Retard d'acheminement", statut: null },
  INFO: { libelle: 'Information', statut: null },
  ANNULE: { libelle: 'Expédition annulée', statut: 'annule' },
};

const CODES_EVENEMENTS = Object.keys(EVENEMENTS_SUIVI);

/**
 * Événements que le personnel de terrain peut enregistrer, selon sa mission :
 * - coursier : ramassage chez l'expéditeur, dépôt au point, livraison à domicile ;
 * - agent_point : réception au comptoir, mise à disposition, retrait par le destinataire.
 * Les étapes de transit, de douane et d'étude restent réservées aux administrateurs.
 */
const EVENEMENTS_PAR_ROLE = {
  coursier: [
    'ENL_OK',
    'ENL_ECHEC',
    'DEPOT',
    'EN_LIVRAISON',
    'LIV_ECHEC',
    'LIVRE',
    'REFUSE',
    'AVARIE',
    'RETARD',
    'INFO',
  ],
  agent_point: [
    'DEPOT',
    'RECEPTION',
    'ARR_AGENCE',
    'DISPO',
    'EN_LIVRAISON',
    'RETIRE',
    'REFUSE',
    'AVARIE',
    'RETARD',
    'INFO',
  ],
};

/** Codes d'événements permis pour un rôle ; `null` = aucune restriction (administrateurs). */
const evenementsAutorises = (role) =>
  ['admin', 'super_admin'].includes(role) ? null : EVENEMENTS_PAR_ROLE[role] || [];

/** Nature de la marchandise transportée — détermine les obligations douanières. */
const TYPES_CONTENU = [
  'document',
  'marchandise',
  'cadeau',
  'echantillon',
  'effets_personnels',
  'retour',
];

/**
 * Comment le colis entre dans le réseau :
 * - dépôt au point de collecte (ou à l'adresse de réception définie par l'administrateur) ;
 * - collecte à domicile lors d'une tournée ;
 * - envoi postal (La Poste, Colissimo, Chronopost) vers l'adresse de réception ;
 * - collecte en boîte aux lettres (catégories 1 et 2 uniquement).
 */
const MODES_DEPOT = ['point_collecte', 'enlevement_domicile', 'envoi_postal', 'boite_aux_lettres'];

/** Comment le colis quitte le réseau. */
const MODES_LIVRAISON = ['point_retrait', 'livraison_domicile'];

/** Incoterms retenus pour l'express : qui paie les droits et taxes à l'import. */
const INCOTERMS = ['DAP', 'DDP'];

/** Qui règle la prestation de transport. */
const PAYEURS = ['expediteur', 'destinataire'];

/** Types d'emballage proposés au dépôt. */
const TYPES_EMBALLAGE = [
  'carton',
  'enveloppe',
  'sac',
  'palette',
  'fut',
  'valise',
  'barigot',
  'malle',
  'autre',
];

/* ── Catégories de colis ────────────────────────────────────────────────── */

/**
 * Les trois catégories du cahier des charges. Chacune porte son propre parcours :
 * mode de tarification, validation par l'administrateur, moment du paiement et
 * pièces justificatives exigées du client.
 */
const CATEGORIES_COLIS = ['documents', 'colis_moyen', 'colis_xxl'];

/** Numéro affiché (et porté par le numéro de suivi) de chaque catégorie. */
const NUMEROS_CATEGORIE = { documents: 1, colis_moyen: 2, colis_xxl: 3 };

const REGLES_CATEGORIE = {
  documents: {
    numero: 1,
    libelle: 'Documents',
    description: 'Documents administratifs, sous enveloppe',
    // Prix fixe défini par l'administrateur, livraison à Dakar incluse
    tarification: 'forfait',
    validationAdmin: false,
    // Le client règle dès la fin de la simulation
    paiement: 'a_la_commande',
    photosMin: 1, // photo de l'enveloppe
    modesDepot: ['point_collecte', 'envoi_postal', 'boite_aux_lettres'],
    adresseSenegalDetaillee: false,
  },
  colis_moyen: {
    numero: 2,
    libelle: 'Colis moyen',
    description: 'Smartphones, ordinateurs, petit électroménager, valises, sacs, barigots',
    tarification: 'forfait',
    validationAdmin: true,
    // Facture et lien de paiement émis à la réception du colis
    paiement: 'a_la_reception',
    photosMin: 3, // trois angles
    modesDepot: ['point_collecte', 'enlevement_domicile', 'envoi_postal', 'boite_aux_lettres'],
    adresseSenegalDetaillee: true,
  },
  colis_xxl: {
    numero: 3,
    libelle: 'Colis XXL',
    description: 'Réfrigérateurs, machines, gros cartons de plus de 30 kg',
    // Prix défini par l'administrateur après étude, sous 24 heures
    tarification: 'sur_devis',
    validationAdmin: true,
    // Le client accepte la proposition, puis règle
    paiement: 'apres_acceptation',
    photosMin: 1,
    modesDepot: ['point_collecte', 'enlevement_domicile'],
    adresseSenegalDetaillee: true,
  },
};

/** État de la marchandise, repris à l'inventaire des chargements. */
const ETATS_MARCHANDISE = ['neuf', 'occasion'];

/** Statuts dans lesquels le client peut encore modifier sa demande (avant arrivée au Sénégal). */
const STATUTS_MODIFIABLES_CLIENT = [
  'brouillon',
  'en_attente_validation',
  'devis_propose',
  'en_attente',
  'enlevement_planifie',
  'enleve',
  'receptionne',
  'en_preparation',
  'en_transit',
];

const statutEstTerminal = (statut) => STATUTS_TERMINAUX.includes(statut);

const transitionAutorisee = (depuis, vers) => (TRANSITIONS_AUTORISEES[depuis] || []).includes(vers);

module.exports = {
  STATUTS_COLIS,
  STATUTS_TERMINAUX,
  TRANSITIONS_AUTORISEES,
  EVENEMENTS_SUIVI,
  CODES_EVENEMENTS,
  EVENEMENTS_PAR_ROLE,
  evenementsAutorises,
  TYPES_CONTENU,
  MODES_DEPOT,
  MODES_LIVRAISON,
  INCOTERMS,
  PAYEURS,
  TYPES_EMBALLAGE,
  CATEGORIES_COLIS,
  NUMEROS_CATEGORIE,
  REGLES_CATEGORIE,
  ETATS_MARCHANDISE,
  STATUTS_MODIFIABLES_CLIENT,
  statutEstTerminal,
  transitionAutorisee,
};
