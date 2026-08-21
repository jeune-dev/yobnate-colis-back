/**
 * Générateur de code-barres Code 128 (jeu B) au format SVG.
 *
 * Les étiquettes d'expédition doivent rester scannables sur n'importe quel poste
 * sans dépendance externe ni service tiers : le tracé est donc calculé ici, à
 * partir de la table de largeurs normalisée, et rendu en SVG vectoriel.
 */

// Chaque symbole occupe 11 modules décrits par six largeurs alternées barre/espace
// (le symbole d'arrêt en compte sept).
const MOTIFS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/** Le jeu B couvre les caractères ASCII imprimables de l'espace au tilde. */
const estEncodable = (texte) => /^[\x20-\x7E]+$/.test(texte);

/**
 * Convertit un texte en suite de valeurs Code 128 : symbole de départ, données,
 * clé de contrôle modulo 103, symbole d'arrêt.
 */
const encoder = (texte) => {
  if (!estEncodable(texte)) {
    throw new Error("Le code-barres Code 128 n'accepte que des caractères ASCII imprimables");
  }

  const valeurs = [...texte].map((c) => c.charCodeAt(0) - 32);
  const somme = valeurs.reduce((acc, v, i) => acc + v * (i + 1), START_B);
  return [START_B, ...valeurs, somme % 103, STOP];
};

/** Suite de largeurs de modules, alternant barre (indices pairs) et espace. */
const largeurs = (texte) => encoder(texte).flatMap((valeur) => [...MOTIFS[valeur]].map(Number));

/**
 * Rend le code-barres en SVG autonome.
 *
 * @param {string} texte        Données à encoder (numéro de suivi, référence).
 * @param {object} options
 * @param {number} options.moduleWidth Largeur d'un module, en unités SVG.
 * @param {number} options.hauteur     Hauteur des barres.
 * @param {boolean} options.afficherTexte Ajoute la valeur en clair sous les barres.
 * @param {number} options.marge       Zone silencieuse de part et d'autre.
 */
const versSvg = (
  texte,
  { moduleWidth = 2, hauteur = 60, afficherTexte = true, marge = 10, couleur = '#000000' } = {}
) => {
  const modules = largeurs(texte);
  const largeurCode = modules.reduce((acc, m) => acc + m, 0) * moduleWidth;
  const hauteurTexte = afficherTexte ? 18 : 0;
  const largeurTotale = largeurCode + marge * 2;
  const hauteurTotale = hauteur + hauteurTexte + marge;

  let x = marge;
  const barres = [];
  modules.forEach((module, index) => {
    const largeur = module * moduleWidth;
    // Les indices pairs correspondent aux barres, les impairs aux espaces
    if (index % 2 === 0) {
      barres.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${largeur.toFixed(2)}" height="${hauteur}" fill="${couleur}"/>`
      );
    }
    x += largeur;
  });

  const legende = afficherTexte
    ? `<text x="${(largeurTotale / 2).toFixed(2)}" y="${hauteur + 15}" text-anchor="middle" ` +
      `font-family="monospace" font-size="14" letter-spacing="1" fill="${couleur}">${texte}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeurTotale.toFixed(2)}" ` +
    `height="${hauteurTotale}" viewBox="0 0 ${largeurTotale.toFixed(2)} ${hauteurTotale}" role="img" ` +
    `aria-label="Code-barres ${texte}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>${barres.join('')}${legende}</svg>`
  );
};

/** Variante encodée en base64, directement insérable dans un attribut `src`. */
const versDataUri = (texte, options) =>
  `data:image/svg+xml;base64,${Buffer.from(versSvg(texte, options), 'utf8').toString('base64')}`;

module.exports = { versSvg, versDataUri, encoder, largeurs, estEncodable };
