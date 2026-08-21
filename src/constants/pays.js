/**
 * Référentiel des pays desservis.
 * Le service Yobnate Express couvre exclusivement le corridor France ⇄ Sénégal.
 */
const PAYS = {
  FR: {
    code: 'FR',
    codeIso3: 'FRA',
    libelle: 'France',
    nationalite: 'française',
    devise: 'EUR',
    indicatif: '+33',
    fuseau: 'Europe/Paris',
    unionDouaniere: 'UE',
    formatCodePostal: /^\d{5}$/,
    tauxTva: 20,
    seuilFranchiseDouaniere: 0,
  },
  SN: {
    code: 'SN',
    codeIso3: 'SEN',
    libelle: 'Sénégal',
    nationalite: 'sénégalaise',
    devise: 'XOF',
    indicatif: '+221',
    fuseau: 'Africa/Dakar',
    unionDouaniere: 'UEMOA',
    formatCodePostal: /^\d{5}$/,
    tauxTva: 18,
    seuilFranchiseDouaniere: 0,
  },
};

const CODES_PAYS = Object.keys(PAYS);

/** Corridors autorisés : uniquement l'international FR⇄SN et le domestique interne. */
const estCorridorAutorise = (paysDepart, paysArrivee) =>
  CODES_PAYS.includes(paysDepart) && CODES_PAYS.includes(paysArrivee);

const estInternational = (paysDepart, paysArrivee) => paysDepart !== paysArrivee;

const getPays = (code) => PAYS[code] || null;

module.exports = { PAYS, CODES_PAYS, estCorridorAutorise, estInternational, getPays };
