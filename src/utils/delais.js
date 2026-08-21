const { Op } = require('sequelize');
const { JourFerie } = require('../models');

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const aMinuit = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const enIso = (date) => aMinuit(date).toISOString().slice(0, 10);

const estWeekend = (date) => [0, 6].includes(new Date(date).getDay());

/**
 * Charge les jours fériés d'un pays sur une fenêtre donnée.
 * Les jours marqués récurrents sont rapportés à l'année de la fenêtre.
 */
const chargerJoursFeries = async (pays, dateDebut, dateFin) => {
  const feries = await JourFerie.findAll({
    where: {
      pays,
      [Op.or]: [
        { recurrent: true },
        { date: { [Op.between]: [enIso(dateDebut), enIso(dateFin)] } },
      ],
    },
    attributes: ['date', 'recurrent'],
  });

  const dates = new Set();
  const anneeDebut = new Date(dateDebut).getFullYear();
  const anneeFin = new Date(dateFin).getFullYear();

  for (const ferie of feries) {
    if (!ferie.recurrent) {
      dates.add(String(ferie.date));
      continue;
    }
    const [, mois, jour] = String(ferie.date).split('-');
    for (let annee = anneeDebut; annee <= anneeFin; annee += 1) {
      dates.add(`${annee}-${mois}-${jour}`);
    }
  }
  return dates;
};

/**
 * Ajoute un nombre de jours ouvrés à une date, en excluant week-ends et jours
 * fériés du pays. `joursFeries` est l'ensemble d'ISO-dates renvoyé par chargerJoursFeries.
 */
const ajouterJoursOuvres = (dateDepart, nbJours, joursFeries = new Set()) => {
  let courante = aMinuit(dateDepart);
  let restants = Math.max(0, Math.round(nbJours));

  while (restants > 0) {
    courante = new Date(courante.getTime() + MS_PAR_JOUR);
    if (!estWeekend(courante) && !joursFeries.has(enIso(courante))) restants -= 1;
  }
  return courante;
};

const ajouterJoursCalendaires = (dateDepart, nbJours) =>
  new Date(aMinuit(dateDepart).getTime() + Math.max(0, Math.round(nbJours)) * MS_PAR_JOUR);

/**
 * Estime la date de livraison d'une expédition.
 *
 * Un dépôt après l'heure limite du service, un week-end ou un jour férié reporte
 * le point de départ au premier jour ouvré suivant, avant d'appliquer le délai
 * d'acheminement et l'éventuel supplément de zone.
 */
const calculerDateLivraisonEstimee = async ({
  service,
  paysDepart,
  paysArrivee,
  delaiSupplementaireJours = 0,
  dateDepot = new Date(),
}) => {
  const delaiTotal = Number(service.delaiMaxJours) + Number(delaiSupplementaireJours);
  const fenetreFin = ajouterJoursCalendaires(dateDepot, delaiTotal + 21);

  const [feriesDepart, feriesArrivee] = await Promise.all([
    chargerJoursFeries(paysDepart, dateDepot, fenetreFin),
    paysArrivee === paysDepart
      ? Promise.resolve(null)
      : chargerJoursFeries(paysArrivee, dateDepot, fenetreFin),
  ]);
  const feries = new Set([...feriesDepart, ...(feriesArrivee || [])]);

  // Report au premier jour ouvré si le dépôt intervient après l'heure limite
  let depart = aMinuit(dateDepot);
  const horsDelai = !service.avantHeureLimite?.(new Date(dateDepot));
  if (horsDelai || estWeekend(depart) || feries.has(enIso(depart))) {
    depart = ajouterJoursOuvres(depart, 1, feries);
  }

  const dateEstimee = service.joursOuvresUniquement
    ? ajouterJoursOuvres(depart, delaiTotal, feries)
    : ajouterJoursCalendaires(depart, delaiTotal);

  return {
    dateEstimee,
    dateAuPlusTot: service.joursOuvresUniquement
      ? ajouterJoursOuvres(
          depart,
          Number(service.delaiMinJours) + Number(delaiSupplementaireJours),
          feries
        )
      : ajouterJoursCalendaires(
          depart,
          Number(service.delaiMinJours) + Number(delaiSupplementaireJours)
        ),
    delaiApplique: delaiTotal,
    departReporte: horsDelai,
  };
};

/** Nombre de jours calendaires écoulés entre deux dates. */
const joursEcoules = (debut, fin = new Date()) =>
  Math.floor((aMinuit(fin) - aMinuit(debut)) / MS_PAR_JOUR);

module.exports = {
  MS_PAR_JOUR,
  aMinuit,
  enIso,
  estWeekend,
  chargerJoursFeries,
  ajouterJoursOuvres,
  ajouterJoursCalendaires,
  calculerDateLivraisonEstimee,
  joursEcoules,
};
