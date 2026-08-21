/**
 * Cycle de vie d'une expédition et codes d'événements de suivi.
 * Le vocabulaire suit la logique d'un intégrateur express : chaque changement de
 * statut produit un événement horodaté et localisé, visible dans le suivi public.
 */

const STATUTS_COLIS = [
  'brouillon', // expédition préparée mais non confirmée
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
const STATUTS_TERMINAUX = ['livre', 'recupere', 'retourne', 'annule'];

/** Machine à états : transitions autorisées depuis chaque statut. */
const TRANSITIONS_AUTORISEES = {
  brouillon: ['en_attente', 'annule'],
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
};

/**
 * Codes d'événements de suivi.
 * `statut` = statut d'expédition induit (null = événement informatif sans changement d'état).
 */
const EVENEMENTS_SUIVI = {
  CRE: { libelle: 'Expédition enregistrée', statut: 'en_attente' },
  ENL_PROG: { libelle: 'Enlèvement programmé', statut: 'enlevement_planifie' },
  ENL_OK: { libelle: "Colis enlevé chez l'expéditeur", statut: 'enleve' },
  ENL_ECHEC: { libelle: 'Enlèvement infructueux', statut: null },
  DEPOT: { libelle: 'Colis déposé au point de collecte', statut: 'receptionne' },
  RECEPTION: { libelle: 'Colis réceptionné par nos équipes', statut: 'receptionne' },
  TRI: { libelle: 'Traité au centre de tri', statut: 'en_preparation' },
  MANIFESTE: { libelle: 'Affecté à une rotation', statut: 'en_preparation' },
  DOUANE_EXP: { libelle: 'Formalités douanières export en cours', statut: 'en_douane' },
  DEPART_HUB: { libelle: "Départ du hub d'expédition", statut: 'en_transit' },
  EN_TRANSIT: { libelle: 'En transit international', statut: 'en_transit' },
  ARR_PAYS: { libelle: 'Arrivé dans le pays de destination', statut: 'arrive' },
  DOUANE_IMP: { libelle: 'Dédouanement import en cours', statut: 'en_douane' },
  DOUANE_OK: { libelle: 'Dédouanement terminé', statut: 'arrive' },
  DOUANE_BLOC: { libelle: 'Retenu par les autorités douanières', statut: 'incident' },
  ARR_AGENCE: { libelle: "Arrivé à l'agence de distribution", statut: 'arrive' },
  DISPO: { libelle: 'Disponible au point de retrait', statut: 'disponible_retrait' },
  EN_LIVRAISON: { libelle: 'En cours de livraison', statut: 'en_livraison' },
  LIV_ECHEC: { libelle: 'Tentative de livraison infructueuse', statut: null },
  LIVRE: { libelle: 'Livré au destinataire', statut: 'livre' },
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

/** Nature de la marchandise transportée — détermine les obligations douanières. */
const TYPES_CONTENU = [
  'document',
  'marchandise',
  'cadeau',
  'echantillon',
  'effets_personnels',
  'retour',
];

/** Comment le colis entre dans le réseau. */
const MODES_DEPOT = ['point_collecte', 'enlevement_domicile'];

/** Comment le colis quitte le réseau. */
const MODES_LIVRAISON = ['point_retrait', 'livraison_domicile'];

/** Incoterms retenus pour l'express : qui paie les droits et taxes à l'import. */
const INCOTERMS = ['DAP', 'DDP'];

/** Qui règle la prestation de transport. */
const PAYEURS = ['expediteur', 'destinataire'];

/** Types d'emballage proposés au dépôt. */
const TYPES_EMBALLAGE = ['carton', 'enveloppe', 'sac', 'palette', 'fut', 'valise', 'autre'];

const statutEstTerminal = (statut) => STATUTS_TERMINAUX.includes(statut);

const transitionAutorisee = (depuis, vers) => (TRANSITIONS_AUTORISEES[depuis] || []).includes(vers);

module.exports = {
  STATUTS_COLIS,
  STATUTS_TERMINAUX,
  TRANSITIONS_AUTORISEES,
  EVENEMENTS_SUIVI,
  CODES_EVENEMENTS,
  TYPES_CONTENU,
  MODES_DEPOT,
  MODES_LIVRAISON,
  INCOTERMS,
  PAYEURS,
  TYPES_EMBALLAGE,
  statutEstTerminal,
  transitionAutorisee,
};
