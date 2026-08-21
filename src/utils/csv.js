/**
 * Sérialisation CSV des exports back-office.
 * Les valeurs sont systématiquement encadrées de guillemets et un préfixe neutre
 * est ajouté devant les caractères déclenchant l'évaluation de formule dans un
 * tableur, afin qu'un export ne devienne pas un vecteur d'injection.
 */
const CARACTERES_FORMULE = ['=', '+', '-', '@', '\t', '\r'];

const echapper = (valeur) => {
  if (valeur === null || valeur === undefined) return '""';
  let texte = String(valeur);
  if (CARACTERES_FORMULE.includes(texte.charAt(0))) texte = `'${texte}`;
  return `"${texte.replace(/"/g, '""')}"`;
};

/**
 * Construit un CSV à partir de colonnes { cle, libelle, transforme? }.
 * Le séparateur point-virgule et le BOM UTF-8 assurent une ouverture correcte
 * sous Excel en configuration française.
 */
const versCsv = (lignes, colonnes, { separateur = ';', bom = true } = {}) => {
  const entete = colonnes.map((c) => echapper(c.libelle ?? c.cle)).join(separateur);
  const corps = lignes.map((ligne) => {
    const source = typeof ligne.toJSON === 'function' ? ligne.toJSON() : ligne;
    return colonnes
      .map((c) => {
        const brut = c.cle
          .split('.')
          .reduce((acc, k) => (acc === null || acc === undefined ? acc : acc[k]), source);
        return echapper(c.transforme ? c.transforme(brut, source) : brut);
      })
      .join(separateur);
  });
  return `${bom ? '\uFEFF' : ''}${[entete, ...corps].join('\r\n')}`;
};

/** Positionne les en-têtes HTTP d'un téléchargement CSV. */
const envoyerCsv = (res, contenu, nomFichier) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  return res.status(200).send(contenu);
};

module.exports = { versCsv, envoyerCsv, echapper };
