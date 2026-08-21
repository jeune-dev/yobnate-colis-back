const RAYON_TERRE_KM = 6371;

const enRadians = (degres) => (degres * Math.PI) / 180;

/**
 * Distance orthodromique entre deux points, en kilomètres (formule de haversine).
 * Retourne null si l'une des coordonnées est absente.
 */
const distanceKm = (lat1, lon1, lat2, lon2) => {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || v === '')) return null;
  const dLat = enRadians(Number(lat2) - Number(lat1));
  const dLon = enRadians(Number(lon2) - Number(lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(enRadians(Number(lat1))) * Math.cos(enRadians(Number(lat2))) * Math.sin(dLon / 2) ** 2;
  return Number((RAYON_TERRE_KM * 2 * Math.asin(Math.sqrt(a))).toFixed(2));
};

/**
 * Bornes d'un carré englobant un rayon donné autour d'un point.
 * Sert à pré-filtrer en SQL avant le calcul exact de la distance.
 */
const boiteEnglobante = (latitude, longitude, rayonKm) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const deltaLat = rayonKm / 111.32;
  const cos = Math.cos(enRadians(lat));
  // Aux pôles, un degré de longitude tend vers zéro : on élargit alors au maximum
  const deltaLon = Math.abs(cos) < 1e-6 ? 180 : rayonKm / (111.32 * Math.abs(cos));
  return {
    latMin: Math.max(-90, lat - deltaLat),
    latMax: Math.min(90, lat + deltaLat),
    lonMin: Math.max(-180, lon - deltaLon),
    lonMax: Math.min(180, lon + deltaLon),
  };
};

/**
 * Trie une liste d'entités géolocalisées par distance croissante et annote
 * chacune de sa distance. Les entités sans coordonnées sont rejetées en fin de liste.
 */
const trierParProximite = (items, latitude, longitude, { rayonKm = null } = {}) => {
  const annotes = items.map((item) => {
    const brut = typeof item.toJSON === 'function' ? item.toJSON() : { ...item };
    const distance = distanceKm(latitude, longitude, item.latitude, item.longitude);
    return { ...brut, distanceKm: distance };
  });

  const filtres =
    rayonKm === null
      ? annotes
      : annotes.filter((i) => i.distanceKm !== null && i.distanceKm <= rayonKm);

  return filtres.sort((a, b) => {
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });
};

module.exports = { distanceKm, boiteEnglobante, trierParProximite, RAYON_TERRE_KM };
