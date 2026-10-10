const { Resend } = require('resend');
const logger = require('../utils/logger');

/**
 * Envoi des courriels par l'API Resend (https://resend.com), seul canal email du
 * projet. Chaque envoi est journalisé avec le préfixe [EMAIL] (voir envoyerEmail).
 *
 * Variables : RESEND_API_KEY (clé « re_… ») et MAIL_FROM, dont le domaine doit
 * être vérifié dans Resend (sinon Resend refuse tout destinataire autre que le
 * propriétaire du compte).
 */

const estProduction = () => process.env.NODE_ENV === 'production';

/** La clé Resend est-elle renseignée (et pas une valeur d'exemple) ? */
const resendConfigure = () => {
  const cle = String(process.env.RESEND_API_KEY || '').trim();
  return Boolean(cle) && !/^re_x+$|A_RENSEIGNER|^your_/i.test(cle);
};

// Client créé à la première utilisation : le SDK lève une exception sans clé
let client = null;
const obtenirClient = () => {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
};

/** En production, l'adresse est partiellement masquée dans les logs (ab***@domaine). */
const masquer = (adresse) => {
  const liste = Array.isArray(adresse) ? adresse : [adresse];
  if (!estProduction()) return liste.join(', ');
  return liste
    .map((a) => {
      const [local, domaine] = String(a).split('@');
      return `${local.slice(0, 2)}***@${domaine ?? '?'}`;
    })
    .join(', ');
};

/**
 * Panne passagère (réseau, limite de débit 429, erreur Resend 5xx) : l'envoi peut
 * être retenté. Une erreur de validation (adresse invalide, domaine non vérifié,
 * clé refusée) ne l'est pas.
 */
const erreurTransitoire = (err) => {
  const statut = Number(err.statusCode);
  return !statut || statut === 429 || statut >= 500;
};

const ENTITES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ' };

/**
 * Version texte d'un courriel HTML, jointe à chaque envoi : un message sans partie
 * texte est plus souvent classé en indésirable, et certains clients n'affichent
 * que celle-ci. Les liens sont conservés sous la forme « libellé : url ».
 */
const texteDepuisHtml = (html) =>
  String(html || '')
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, url, libelle) => `${libelle} : ${url}`
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|tr|div|table)>/gi, '\n\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTITES[e] ?? e)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Explication lisible des refus Resend les plus fréquents, ajoutée au log d'échec. */
const AIDE_ERREURS = {
  400: 'requête refusée : adresse du destinataire ou de MAIL_FROM invalide',
  401: 'RESEND_API_KEY manquante ou mal formée',
  403: 'clé refusée, ou domaine de MAIL_FROM non vérifié dans Resend (seul le propriétaire du compte reçoit alors les emails)',
  422: 'champ invalide (MAIL_FROM, destinataire ou contenu)',
  429: 'limite de débit Resend atteinte',
};

const aide = (statut) =>
  AIDE_ERREURS[statut] ||
  (statut >= 500 ? 'Resend indisponible' : statut ? null : 'Resend injoignable (réseau)');

/**
 * Envoie un courriel et attend la réponse de Resend.
 *
 * Chaque envoi laisse une ligne lisible dans les logs, à chercher avec « [EMAIL] » :
 *   [EMAIL] ✅ ENVOYÉ      — accepté par Resend (id à retrouver dans resend.com → Emails)
 *   [EMAIL] ❌ ÉCHEC       — refusé ou injoignable, avec le statut et la raison
 *   [EMAIL] ⛔ NON ENVOYÉ  — Resend non configuré
 *
 * @param {object} message
 * @param {string} [message.texte] version texte ; déduite du HTML si absente
 * @param {string} [message.repondreA] adresse de réponse (en-tête Reply-To)
 * @param {number} [message.tentative] numéro de la tentative (journalisation)
 * @param {number} [message.tentativesMax] nombre de tentatives prévues (journalisation)
 * @returns {Promise<{ id: string }>} identifiant Resend du message
 * @throws {Error} avec `statusCode` et `nomErreur` si Resend refuse ou est injoignable
 */
const envoyerEmail = async ({
  to,
  subject,
  html,
  texte = null,
  repondreA = null,
  tentative = 1,
  tentativesMax = 1,
}) => {
  const contexte = { a: masquer(to), sujet: subject };
  if (!resendConfigure()) {
    const err = new Error('Resend non configuré (RESEND_API_KEY manquante)');
    err.statusCode = 401;
    logger.error('[EMAIL] ⛔ NON ENVOYÉ — RESEND_API_KEY absente', contexte);
    throw err;
  }

  const debut = Date.now();
  const essai = tentativesMax > 1 ? ` (tentative ${tentative}/${tentativesMax})` : '';
  logger.info(`[EMAIL] Envoi en cours${essai}`, contexte);

  let reponse;
  try {
    reponse = await obtenirClient().emails.send({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
      text: texte || texteDepuisHtml(html),
      ...(repondreA && { replyTo: repondreA }),
    });
  } catch (e) {
    reponse = {
      data: null,
      error: { name: 'erreur_reseau', message: e.message, statusCode: null },
    };
  }

  const { data, error } = reponse;
  if (error) {
    const err = new Error(error.message || 'Erreur Resend');
    err.statusCode = error.statusCode;
    err.nomErreur = error.name;
    const suite =
      tentative < tentativesMax && erreurTransitoire(err)
        ? 'nouvelle tentative prévue'
        : 'email NON envoyé';
    logger.error(`[EMAIL] ❌ ÉCHEC${essai} — ${suite}`, {
      ...contexte,
      statut: error.statusCode,
      erreur: error.name,
      raison: error.message,
      explication: aide(error.statusCode),
      dureeMs: Date.now() - debut,
    });
    throw err;
  }

  logger.info(`[EMAIL] ✅ ENVOYÉ${essai}`, {
    ...contexte,
    idResend: data?.id,
    dureeMs: Date.now() - debut,
  });
  return data;
};

/** Journalise la configuration au démarrage, pour repérer tout de suite un oubli. */
const journaliserConfiguration = () => {
  if (resendConfigure()) {
    logger.info(
      `[EMAIL] Resend actif — expéditeur : ${process.env.MAIL_FROM || '(MAIL_FROM vide)'}`
    );
    if (!process.env.MAIL_FROM)
      logger.warn('[EMAIL] MAIL_FROM est vide : Resend refusera tous les envois');
  } else {
    logger.warn('[EMAIL] ⛔ RESEND_API_KEY absente : AUCUN email ne sera envoyé');
  }
};

module.exports = {
  envoyerEmail,
  resendConfigure,
  erreurTransitoire,
  journaliserConfiguration,
  masquer,
  texteDepuisHtml,
};
