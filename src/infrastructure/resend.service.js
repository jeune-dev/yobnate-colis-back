const { Resend } = require('resend');
const logger = require('../utils/logger');

/**
 * Envoi des courriels par l'API Resend (https://resend.com), seul canal email du
 * projet. Chaque envoi est journalisé avec le préfixe [resend] : départ, succès
 * (avec l'identifiant Resend, à retrouver dans le tableau de bord), échec.
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

/**
 * Envoie un courriel et attend la réponse de Resend.
 * @param {object} message
 * @param {string} [message.texte] version texte ; déduite du HTML si absente
 * @param {string} [message.repondreA] adresse de réponse (en-tête Reply-To)
 * @returns {Promise<{ id: string }>} identifiant Resend du message
 * @throws {Error} avec `statusCode` et `nomErreur` si Resend refuse ou est injoignable
 */
const envoyerEmail = async ({ to, subject, html, texte = null, repondreA = null }) => {
  if (!resendConfigure()) {
    const err = new Error('Resend non configuré (RESEND_API_KEY manquante)');
    err.statusCode = 400;
    logger.error(`[resend] Envoi impossible à ${masquer(to)} — ${subject}`, {
      raison: err.message,
    });
    throw err;
  }

  const debut = Date.now();
  logger.info(`[resend] Envoi en cours à ${masquer(to)} — ${subject}`);

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
    logger.error(`[resend] Échec de l'envoi à ${masquer(to)} — ${subject}`, {
      erreur: error.name,
      statut: error.statusCode,
      message: error.message,
      dureeMs: Date.now() - debut,
    });
    const err = new Error(error.message || 'Erreur Resend');
    err.statusCode = error.statusCode;
    err.nomErreur = error.name;
    throw err;
  }

  logger.info(`[resend] Email envoyé à ${masquer(to)} — ${subject}`, {
    idResend: data?.id,
    dureeMs: Date.now() - debut,
  });
  return data;
};

/** Journalise la configuration au démarrage, pour repérer tout de suite un oubli. */
const journaliserConfiguration = () => {
  if (resendConfigure()) {
    logger.info(
      `[resend] Envoi des emails actif — expéditeur : ${process.env.MAIL_FROM || '(MAIL_FROM vide)'}`
    );
    if (!process.env.MAIL_FROM)
      logger.warn('[resend] MAIL_FROM est vide : Resend refusera les envois');
  } else {
    logger.warn('[resend] RESEND_API_KEY absente : aucun email ne sera envoyé');
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
