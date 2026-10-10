const { listeQuery, filtres } = require('../../../validations/common');

const listeJournalQuery = listeQuery({
  userId: filtres.id,
  entite: filtres.recherche,
  action: filtres.recherche,
  dateDebut: filtres.date,
  dateFin: filtres.date,
});

module.exports = { listeJournalQuery };
