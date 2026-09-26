/**
 * Masque les secrets portés par une URL avant de la journaliser : jeton de
 * confirmation d'email, jeton de désabonnement, paramètres `token` / `jeton`.
 * Un journal applicatif est lu par bien plus de monde qu'une base : un lien
 * encore valide ne doit pas s'y retrouver en clair.
 */
const MOTIFS = [
  [/(\/verify-email\/)[^/?#]+/gi, '$1[MASQUÉ]'],
  [/(\/desabonnement\/)[^/?#]+/gi, '$1[MASQUÉ]'],
  [/([?&](?:token|jeton|code|refreshToken)=)[^&#]*/gi, '$1[MASQUÉ]'],
];

const masquerUrl = (url) =>
  MOTIFS.reduce(
    (resultat, [motif, remplacement]) => resultat.replace(motif, remplacement),
    String(url || '')
  );

module.exports = masquerUrl;
