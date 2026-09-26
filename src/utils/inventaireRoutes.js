/**
 * Inventaire des routes à partir des routeurs Express RÉELS (et non du texte
 * des fichiers) : méthode, chemin, espace, authentification, rôles autorisés
 * et schémas de validation de chaque route.
 *
 * Les middlewares s'étiquettent eux-mêmes (`auth.garde`, `checkActiveUser.garde`,
 * `garde.roles`, `validate().schema`). Utilisé par le test de sécurité des
 * routes et par la génération de la documentation OpenAPI : ni l'un ni l'autre
 * ne peut donc diverger du code.
 */
const intersection = (a, b) => (a ? (b ? a.filter((r) => b.includes(r)) : a) : b);

const inventorier = (ROUTES) =>
  ROUTES.flatMap(({ chemin, espace, tag, routeur, alias = false }) => {
    const routes = [];
    const gardesRouteur = [];
    for (const couche of routeur.stack) {
      if (!couche.route) {
        gardesRouteur.push(couche.handle); // router.use(...) : s'applique aux routes suivantes
        continue;
      }
      const chaine = [...gardesRouteur, ...couche.route.stack.map((c) => c.handle)];
      const roles = chaine.filter((h) => Array.isArray(h.roles)).map((h) => h.roles);
      const suffixe = couche.route.path === '/' ? '' : couche.route.path;
      for (const methode of Object.keys(couche.route.methods)) {
        routes.push({
          methode,
          chemin: `${chemin}${suffixe}`,
          espace,
          tag,
          alias,
          auth: chaine.some((h) => h.garde === 'auth' || Array.isArray(h.roles)),
          compteActif: chaine.some((h) => h.garde === 'checkActiveUser'),
          roles: roles.length ? roles.reduce(intersection) : null,
          validations: chaine
            .filter((h) => h.schema)
            .map((h) => ({ source: h.source, schema: h.schema })),
        });
      }
    }
    return routes;
  });

module.exports = { inventorier };
