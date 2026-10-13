/**
 * Borne de fin d'un filtre de période. Une date de fin sans heure (AAAA-MM-JJ, ou
 * déjà convertie par la validation en minuit pile) désigne toute la journée : lue
 * telle quelle, elle valait minuit et excluait la journée de fin (souvent
 * aujourd'hui) des listes et des indicateurs.
 */
const borneFin = (dateFin) => {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(dateFin)) ? `${dateFin}T00:00:00Z` : dateFin
  );
  if (Number.isNaN(date.getTime())) return date;
  const minuitPile =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return minuitPile ? new Date(date.getTime() + 24 * 3600 * 1000 - 1) : date;
};

module.exports = { borneFin };
