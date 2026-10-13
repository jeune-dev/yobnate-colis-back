/**
 * Devises, moyens de paiement et natures de surcharge.
 */

const DEVISES = ['EUR', 'XOF'];

const SYMBOLES_DEVISE = { EUR: '€', XOF: 'FCFA' };

/** Nombre de décimales à l'affichage et à l'arrondi (le franc CFA n'a pas de subdivision). */
const DECIMALES_DEVISE = { EUR: 2, XOF: 0 };

/** Moyens de paiement acceptés, par pays de règlement. */
const METHODES_PAIEMENT = [
  'wave',
  'orange_money',
  'free_money',
  'carte',
  'virement',
  'especes',
  'paypal',
];

const METHODES_PAR_PAYS = {
  SN: ['wave', 'orange_money', 'free_money', 'carte', 'virement', 'especes'],
  FR: ['carte', 'virement', 'paypal', 'especes'],
};

/**
 * Moyens de paiement acceptés selon la devise de la facture : le mobile money
 * sénégalais ne règle pas une facture en euros, PayPal pas une facture en francs CFA.
 */
const METHODES_PAR_DEVISE = {
  XOF: ['wave', 'orange_money', 'free_money', 'carte', 'virement', 'especes'],
  EUR: ['carte', 'virement', 'paypal', 'especes'],
};

const STATUTS_PAIEMENT = ['en_attente', 'succes', 'echoue', 'rembourse', 'partiel'];

const STATUTS_FACTURE = [
  'brouillon',
  'en_attente',
  'partiellement_payee',
  'payee',
  'annulee',
  'remboursee',
];

/** Natures de surcharge, alignées sur les pratiques du transport express. */
const TYPES_SURCHARGE = [
  'carburant', // indexée sur le prix du kérosène, en % du fret
  'zone_eloignee', // desserte hors zone urbaine
  'manutention', // colis hors gabarit ou non conforme
  'hors_gabarit',
  'marchandise_dangereuse',
  'assurance', // prime ad valorem
  'livraison_domicile',
  'livraison_samedi',
  'securite',
  'formalites_douane',
  'emballage',
  'stockage', // dépassement du délai de garde en point de retrait
];

/** Mode de calcul d'une surcharge. */
const MODES_SURCHARGE = ['pourcentage', 'montant_fixe', 'par_kg'];

/** Assiette sur laquelle s'applique une surcharge en pourcentage. */
const ASSIETTES_SURCHARGE = ['fret', 'fret_et_surcharges', 'valeur_declaree'];

module.exports = {
  DEVISES,
  SYMBOLES_DEVISE,
  DECIMALES_DEVISE,
  METHODES_PAIEMENT,
  METHODES_PAR_PAYS,
  METHODES_PAR_DEVISE,
  STATUTS_PAIEMENT,
  STATUTS_FACTURE,
  TYPES_SURCHARGE,
  MODES_SURCHARGE,
  ASSIETTES_SURCHARGE,
};
