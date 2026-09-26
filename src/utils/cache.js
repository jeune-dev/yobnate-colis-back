/**
 * Cache mémoire local au processus, à durée de vie (TTL).
 *
 * - Les entrées expirées sont purgées périodiquement (et non seulement à la
 *   lecture) : une clé jamais relue ne reste plus en mémoire indéfiniment.
 * - Taille bornée : au-delà de MAX_ENTREES, les plus anciennes insertions sont
 *   évincées (une Map conserve l'ordre d'insertion).
 * - `memoiser` évite la ruée à l'expiration (« cache stampede ») : si dix requêtes
 *   arrivent pendant qu'un calcul coûteux est en cours, elles attendent son
 *   résultat au lieu de lancer dix fois le même calcul contre PostgreSQL.
 *
 * Limite assumée : chaque processus (worker PM2, conteneur) a son propre cache ;
 * une invalidation n'atteint que le processus qui l'exécute. Les TTL sont donc
 * courts (30 s à 5 min) pour borner l'écart entre processus.
 */
const MAX_ENTREES = Number(process.env.CACHE_MAX_ENTREES) || 10000;
const store = new Map();
const enCours = new Map();

const get = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

const set = (key, value, ttlMs) => {
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (store.size > MAX_ENTREES) store.delete(store.keys().next().value);
};

const del = (key) => store.delete(key);

/** Renvoie la valeur en cache, ou calcule-la une seule fois même sous concurrence. */
const memoiser = (key, ttlMs, calculer) => {
  const enCache = get(key);
  if (enCache !== null) return Promise.resolve(enCache);
  if (enCours.has(key)) return enCours.get(key);

  const promesse = (async () => {
    try {
      const valeur = await calculer();
      set(key, valeur, ttlMs);
      return valeur;
    } finally {
      enCours.delete(key);
    }
  })();
  enCours.set(key, promesse);
  return promesse;
};

const purger = () => {
  const maintenant = Date.now();
  for (const [key, entry] of store) if (maintenant > entry.expiresAt) store.delete(key);
};
// unref : ce minuteur ne doit pas empêcher l'arrêt du processus
setInterval(purger, 60 * 1000).unref();

module.exports = { get, set, del, memoiser, taille: () => store.size };
