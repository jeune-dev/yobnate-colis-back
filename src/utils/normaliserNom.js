/**
 * normaliserNom.js — Forme d'écriture des noms de personnes.
 *
 * Règle unique, appliquée à l'enregistrement et non à l'affichage :
 *
 *   • le PRÉNOM porte une majuscule initiale à chaque élément — « awa » et
 *     « AWA » deviennent « Awa », « jean-pierre » devient « Jean-Pierre » ;
 *   • le NOM DE FAMILLE s'écrit intégralement en capitales — « diop »
 *     devient « DIOP ».
 *
 * C'est la convention administrative française et ouest-africaine : sur un
 * contrat, elle lève l'ambiguïté entre le nom et le prénom, y compris quand
 * les deux peuvent être l'un ou l'autre (« Fall Amadou » / « Amadou Fall »).
 *
 * Normaliser à l'écriture plutôt qu'à l'affichage a une raison : le nom est
 * recopié tel quel dans les PDF, les e-mails, les factures et les clichés
 * d'émetteur figés avec chaque document. Corriger au moment d'afficher aurait
 * supposé n'oublier aucun de ces endroits — la base est le seul point de
 * passage commun.
 *
 * ⚠️ Les séparateurs internes sont préservés : espace, trait d'union et
 * apostrophe séparent des éléments qui prennent chacun leur majuscule
 * (« n'diaye » → « N'Diaye » côté prénom), mais ne sont jamais ajoutés ni
 * retirés — un nom n'appartient qu'à celui qui le porte.
 */

/** Séparateurs qui, à l'intérieur d'un nom, ouvrent un nouvel élément. */
const SEPARATEURS = /([\s\-'’])/;

function estVide(valeur) {
  return valeur === null || valeur === undefined || String(valeur).trim() === '';
}

/**
 * Prénom : majuscule initiale sur chaque élément, le reste en minuscules.
 *
 * @param {string} valeur
 * @returns {string|null} la valeur normalisée, ou la valeur reçue telle quelle
 *   si elle est vide (null/undefined/chaîne blanche) — on ne fabrique pas une
 *   chaîne vide là où le champ était absent.
 */
function normaliserPrenom(valeur) {
  if (estVide(valeur)) return valeur;

  return String(valeur)
    .trim()
    .replace(/\s+/g, ' ')
    .split(SEPARATEURS)
    .map((morceau) => {
      if (SEPARATEURS.test(morceau) && morceau.length === 1) return morceau;
      if (!morceau) return morceau;
      return (
        morceau.charAt(0).toLocaleUpperCase('fr-FR') + morceau.slice(1).toLocaleLowerCase('fr-FR')
      );
    })
    .join('');
}

/**
 * Nom de famille : tout en capitales.
 *
 * @param {string} valeur
 * @returns {string|null} idem — une valeur vide est rendue inchangée.
 */
function normaliserNomFamille(valeur) {
  if (estVide(valeur)) return valeur;
  return String(valeur).trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
}

module.exports = { normaliserPrenom, normaliserNomFamille };
