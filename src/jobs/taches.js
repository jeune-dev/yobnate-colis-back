const { Op } = require('sequelize');
const { Colis, Facture, TourneeCollecte, TachePlanifiee } = require('../models');
const logger = require('../config/logger');
const suiviService = require('../services/suivi.service');
const notificationService = require('../services/notification.service');
const factureService = require('../services/admin/facture.service');

/**
 * Tâches automatiques du parcours d'expédition.
 *
 * Elles tournent dans le processus du serveur : toutes les heures pour ce qui
 * doit réagir vite (propositions expirées, études en retard, tournées passées),
 * une fois par jour pour ce qui concerne les relances (factures, colis en
 * souffrance). Chaque tâche est indépendante : l'échec de l'une n'empêche pas
 * les autres, et aucune ne fait tomber le serveur.
 */

const HEURE_MS = 60 * 60 * 1000;
const aujourdHui = () => new Date().toISOString().slice(0, 10);
const ilYA = (jours) => new Date(Date.now() - jours * 24 * HEURE_MS).toISOString().slice(0, 10);

/** Catégorie 3 : une proposition sans réponse à son échéance clôt la demande. */
const expirerPropositions = async () => {
  const expirees = await Colis.findAll({
    where: { statut: 'devis_propose', propositionExpireAt: { [Op.lt]: new Date() } },
  });
  let traitees = 0;
  for (const colis of expirees) {
    // Chaque colis est indépendant : si le client accepte au même instant, l'événement
    // est refusé sous verrou (transition invalide) et seul ce colis est ignoré.
    try {
      await suiviService.enregistrerEvenement(colis, {
        codeEvenement: 'DEVIS_REFUSE',
        libelle: 'Proposition tarifaire expirée',
        commentaire: 'Aucune réponse avant la date de validité de la proposition',
      });
      // Libère le crédit de parrainage, la place en tournée et le stock d'emballages
      await require('../services/client/colis.service').liberRessources(colis);
      await colis.update({ propositionRepondueAt: new Date(), motifRefus: 'Proposition expirée' });
      traitees += 1;
    } catch (err) {
      logger.warn('Proposition non expirée', { colisId: colis.id, message: err.message });
    }
  }
  return traitees;
};

/**
 * Alerte les administrateurs quand une demande dépasse son délai d'étude (24 h
 * par défaut). La fenêtre d'une heure, égale à la périodicité de la tâche, fait
 * que chaque demande n'est signalée qu'une fois.
 */
const alerterEtudesEnRetard = async () => {
  const maintenant = new Date();
  const enRetard = await Colis.findAll({
    where: {
      statut: 'en_attente_validation',
      dateLimiteEtude: { [Op.lte]: maintenant, [Op.gt]: new Date(maintenant - HEURE_MS) },
    },
    attributes: ['id', 'reference', 'categorie'],
  });
  for (const colis of enRetard) {
    await notificationService.notifierAdmins({
      titre: `Délai d'étude dépassé — ${colis.reference}`,
      message: 'Cette demande attend une réponse depuis plus de 24 h.',
      type: 'colis',
      niveau: 'critique',
      entite: 'Colis',
      entiteId: colis.id,
      lienCible: `/admin/colis/${colis.id}`,
    });
  }
  return enRetard.length;
};

/** Une tournée dont la date est passée est clôturée. */
const cloturerTourneesPassees = async () => {
  const [nb] = await TourneeCollecte.update(
    { statut: 'terminee' },
    {
      where: {
        statut: { [Op.in]: ['ouverte', 'complete', 'en_cours'] },
        dateCollecte: { [Op.lt]: aujourdHui() },
      },
    }
  );
  return nb;
};

/** Relance espacée des factures échues : J+1, J+7, J+14 et J+30 après l'échéance. */
const JOURS_RELANCE = [1, 7, 14, 30];
const relancerFacturesEchues = async () => {
  const echues = await Facture.findAll({
    where: {
      statut: { [Op.in]: ['en_attente', 'partiellement_payee'] },
      dateLimitePaiement: { [Op.in]: JOURS_RELANCE.map(ilYA) },
    },
    attributes: ['id'],
  });
  for (const facture of echues) {
    await factureService.relancer(facture.id, null).catch((err) =>
      logger.warn('Relance de facture non envoyée', {
        factureId: facture.id,
        message: err.message,
      })
    );
  }
  return echues.length;
};

/**
 * Colis dont le délai de garde en point de retrait est dépassé : l'administrateur
 * décide du retour à l'expéditeur, il reçoit donc un récapitulatif quotidien.
 */
const signalerColisEnSouffrance = async () => {
  const enSouffrance = await Colis.findAll({
    where: { statut: 'disponible_retrait', dateLimiteRetrait: { [Op.lt]: aujourdHui() } },
    attributes: ['id', 'reference'],
  });
  if (enSouffrance.length) {
    await notificationService.notifierAdmins({
      titre: `${enSouffrance.length} colis en souffrance en point de retrait`,
      message: `Délai de garde dépassé : ${enSouffrance
        .map((c) => c.reference)
        .slice(0, 10)
        .join(', ')}${enSouffrance.length > 10 ? '…' : ''}`,
      type: 'colis',
      niveau: 'alerte',
      lienCible: '/admin/colis?enSouffrance=true',
    });
  }
  return enSouffrance.length;
};

const TACHES_HORAIRES = { expirerPropositions, alerterEtudesEnRetard, cloturerTourneesPassees };
const TACHES_QUOTIDIENNES = { relancerFacturesEchues, signalerColisEnSouffrance };
/** Heure locale du serveur à laquelle partent les tâches quotidiennes. */
const HEURE_QUOTIDIENNE = 8;

const executer = async (taches) => {
  for (const [nom, tache] of Object.entries(taches)) {
    try {
      const nb = await tache();
      if (nb > 0) logger.info(`Tâche ${nom} : ${nb} élément(s) traité(s)`);
    } catch (err) {
      logger.error(`Tâche ${nom} en échec`, { message: err.message });
    }
  }
};

/**
 * Réserve l'exécution d'une tâche pour ce créneau. L'UPDATE conditionnel est atomique :
 * parmi plusieurs processus (workers PM2, conteneurs), un seul obtient la ligne.
 */
const reserver = async (nom, dernierAvant) => {
  await TachePlanifiee.bulkCreate([{ nom, derniereExecution: new Date(0) }], {
    ignoreDuplicates: true,
  });
  const [nb] = await TachePlanifiee.update(
    { derniereExecution: new Date() },
    { where: { nom, derniereExecution: { [Op.lt]: dernierAvant } } }
  );
  return nb === 1;
};

const debutDuJour = () => new Date(new Date().setHours(0, 0, 0, 0));
/** Tolérance sur la période horaire (dérive des minuteurs entre processus). */
const PERIODE_HORAIRE_MS = 55 * 60 * 1000;

const tic = async () => {
  try {
    if (await reserver('taches_horaires', new Date(Date.now() - PERIODE_HORAIRE_MS))) {
      await executer(TACHES_HORAIRES);
    }
    if (
      new Date().getHours() >= HEURE_QUOTIDIENNE &&
      (await reserver('taches_quotidiennes', debutDuJour()))
    ) {
      await executer(TACHES_QUOTIDIENNES);
    }
  } catch (err) {
    // Base momentanément indisponible : on retentera au prochain passage, sans faire
    // tomber le serveur (une promesse rejetée non gérée arrête le processus).
    logger.error('Planification des tâches en échec', { message: err.message });
  }
};

/** Démarre la planification (une exécution immédiate, puis toutes les heures). */
const demarrerTaches = () => {
  tic();
  return setInterval(tic, HEURE_MS);
};

module.exports = {
  demarrerTaches,
  executer,
  reserver,
  tic,
  ...TACHES_HORAIRES,
  ...TACHES_QUOTIDIENNES,
};
