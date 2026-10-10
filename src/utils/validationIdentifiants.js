const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Contrôle des identifiants saisis à l'inscription (téléphone, email), repris du
 * moteur de SIGNS : au lieu d'un simple « invalide », chaque refus dit CE QUI
 * cloche (indicatif non desservi, nombre de chiffres, plage non attribuée,
 * espace ou @ manquant dans l'email…).
 *
 * Retour : `{ valide: true, valeur }` (valeur normalisée) ou `{ valide: false, raison }`.
 */

/** Pays desservis : longueur du numéro national, hors indicatif. */
const PAYS_TELEPHONE = [
  { code: 'SN', nom: 'Sénégal', indicatif: '+221', longueur: 9 },
  { code: 'FR', nom: 'France', indicatif: '+33', longueur: 9 },
];

const ok = (valeur) => ({ valide: true, valeur });
const refus = (raison) => ({ valide: false, raison });

/**
 * Téléphone France ou Sénégal, renvoyé au format international (+221771234567).
 *
 * Accepte « +221 77 123 45 67 », « 00221771234567 », « 221771234567 », le format
 * national français « 06 12 34 56 78 » et, sans indicatif, un numéro rattaché à
 * `paysParDefaut` (le pays choisi dans le formulaire).
 */
function validerTelephone(saisie, { paysParDefaut = 'SN' } = {}) {
  let brut = String(saisie ?? '').replace(/[\s.\-()]/g, '');
  if (!brut) return refus('Numéro de téléphone requis');

  if (brut.startsWith('00')) brut = `+${brut.slice(2)}`;
  if (!/^\+?\d+$/.test(brut)) return refus('Le numéro ne doit contenir que des chiffres');

  if (!brut.startsWith('+')) {
    const avecIndicatif = PAYS_TELEPHONE.find(
      (p) =>
        brut.startsWith(p.indicatif.slice(1)) && brut.length === p.indicatif.length - 1 + p.longueur
    );
    if (avecIndicatif) brut = `+${brut}`;
    else if (/^0\d{9}$/.test(brut)) brut = `+33${brut.slice(1)}`;
    else {
      const defaut = PAYS_TELEPHONE.find((p) => p.code === paysParDefaut) || PAYS_TELEPHONE[0];
      brut = `${defaut.indicatif}${brut}`;
    }
  }

  const pays = PAYS_TELEPHONE.find((p) => brut.startsWith(p.indicatif));
  if (!pays) {
    return refus(
      `Cet indicatif n'est pas pris en charge. Pays acceptés : ${PAYS_TELEPHONE.map((p) => `${p.nom} (${p.indicatif})`).join(', ')}.`
    );
  }

  const national = brut.slice(pays.indicatif.length);
  if (national.length !== pays.longueur) {
    const n = national.length;
    return refus(
      `Un numéro ${pays.nom} doit comporter ${pays.longueur} chiffres (hors indicatif ${pays.indicatif}) — ${n} saisi${n > 1 ? 's' : ''}`
    );
  }

  const numero = parsePhoneNumberFromString(brut);
  if (!numero || !numero.isValid() || numero.country !== pays.code) {
    return refus(`Ce numéro ne correspond à aucune plage ${pays.nom} attribuée`);
  }
  return ok(numero.number);
}

/**
 * Contrôle syntaxique d'une adresse email, avec un message par défaut constaté.
 * L'adresse est renvoyée en minuscules.
 */
function validerEmail(saisie) {
  const brut = String(saisie ?? '').trim();
  if (!brut) return refus('Adresse email requise');
  if (brut.length > 150) return refus("L'adresse email ne peut pas dépasser 150 caractères");
  if (/\s/.test(brut)) return refus("L'adresse email ne doit pas contenir d'espace");
  if (!brut.includes('@')) return refus("L'adresse email doit contenir un @");

  const morceaux = brut.split('@');
  if (morceaux.length !== 2) return refus("L'adresse email doit contenir un seul @");

  const [locale, domaine] = morceaux;
  if (!locale) return refus('La partie avant le @ est vide');
  if (!/^[A-Za-z0-9._%+-]+$/.test(locale)) {
    return refus('La partie avant le @ contient un caractère non autorisé');
  }
  if (locale.startsWith('.') || locale.endsWith('.') || locale.includes('..')) {
    return refus('La partie avant le @ ne peut pas commencer, finir ou doubler un point');
  }
  if (!domaine.includes('.')) return refus("Le domaine de l'adresse email est incomplet");
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(domaine)) {
    return refus("Le domaine de l'adresse email est invalide");
  }
  return ok(brut.toLowerCase());
}

module.exports = { PAYS_TELEPHONE, validerTelephone, validerEmail };
