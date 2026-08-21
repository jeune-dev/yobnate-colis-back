/**
 * Typologie du réseau physique : points de collecte, hubs et rotations.
 */

/** Nature d'un point du réseau. */
const TYPES_POINT = ['agence', 'point_relais', 'casier', 'hub', 'entrepot'];

const LIBELLES_TYPES_POINT = {
  agence: 'Agence Yobnate',
  point_relais: 'Point relais partenaire',
  casier: 'Consigne automatique',
  hub: 'Hub de tri',
  entrepot: 'Entrepôt',
};

/** Prestations disponibles dans un point — activables individuellement par l'administrateur. */
const SERVICES_POINT = [
  'depot', // dépôt d'un colis par l'expéditeur
  'retrait', // retrait d'un colis par le destinataire
  'paiement', // encaissement sur place
  'emballage', // fourniture et service d'emballage
  'pesee', // pesée et mesure officielles
  'declaration_douane', // assistance aux formalités douanières
];

/** Jours de la semaine utilisés dans la grille d'horaires (JSONB). */
const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Grille d'horaires par défaut : ouvert du lundi au vendredi, 9h-18h. */
const HORAIRES_PAR_DEFAUT = JOURS_SEMAINE.reduce((acc, jour) => {
  const ouvre = !['samedi', 'dimanche'].includes(jour);
  acc[jour] = ouvre ? [{ debut: '09:00', fin: '18:00' }] : [];
  return acc;
}, {});

/** Cycle de vie d'une rotation (groupage aérien ou maritime). */
const STATUTS_ROTATION = [
  'planifiee',
  'ouverte',
  'cloturee',
  'en_transit',
  'arrivee',
  'dechargee',
  'annulee',
];

/** Mode d'acheminement entre les deux pays. */
const MODES_TRANSPORT = ['aerien', 'maritime', 'routier'];

/** Cycle de vie d'une demande d'enlèvement à domicile. */
const STATUTS_ENLEVEMENT = ['demande', 'planifie', 'en_cours', 'effectue', 'echoue', 'annule'];

/** Créneaux d'enlèvement proposés au client. */
const CRENEAUX_ENLEVEMENT = ['08:00-12:00', '12:00-16:00', '16:00-20:00'];

module.exports = {
  TYPES_POINT,
  LIBELLES_TYPES_POINT,
  SERVICES_POINT,
  JOURS_SEMAINE,
  HORAIRES_PAR_DEFAUT,
  STATUTS_ROTATION,
  MODES_TRANSPORT,
  STATUTS_ENLEVEMENT,
  CRENEAUX_ENLEVEMENT,
};
