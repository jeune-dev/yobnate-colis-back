const { DECIMALES_DEVISE, SYMBOLES_DEVISE } = require('../constants/facturation');

/**
 * Arrondit un montant selon la précision de sa devise.
 * Le franc CFA n'ayant pas de subdivision, ses montants sont entiers.
 */
const arrondir = (montant, devise = 'XOF') => {
  const decimales = DECIMALES_DEVISE[devise] ?? 2;
  const facteur = 10 ** decimales;
  return Math.round(Number(montant) * facteur) / facteur;
};

/**
 * Convertit un montant d'une devise vers une autre à partir du taux EUR -> XOF.
 * Le franc CFA est arrimé à l'euro à parité fixe (1 EUR = 655,957 XOF) ; le taux
 * reste néanmoins paramétrable pour absorber d'éventuels frais de change.
 */
const convertir = (montant, deviseSource, deviseCible, tauxEurXof) => {
  const valeur = Number(montant);
  if (deviseSource === deviseCible) return arrondir(valeur, deviseCible);
  const taux = Number(tauxEurXof);
  if (!taux || taux <= 0) throw new Error('Taux de change EUR/XOF invalide');

  if (deviseSource === 'EUR' && deviseCible === 'XOF') return arrondir(valeur * taux, 'XOF');
  if (deviseSource === 'XOF' && deviseCible === 'EUR') return arrondir(valeur / taux, 'EUR');
  throw new Error(`Conversion non prise en charge : ${deviseSource} vers ${deviseCible}`);
};

/** Formate un montant pour affichage (« 12 500 FCFA », « 24,90 € »). */
const formater = (montant, devise = 'XOF') => {
  const decimales = DECIMALES_DEVISE[devise] ?? 2;
  const valeur = arrondir(montant, devise).toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${valeur} ${SYMBOLES_DEVISE[devise] || devise}`;
};

module.exports = { arrondir, convertir, formater };
