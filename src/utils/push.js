const { URLSearchParams } = require('url');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Notifications push mobiles via Firebase Cloud Messaging (API HTTP v1).
 *
 * L'authentification utilise directement le compte de service Google (JWT signé
 * RS256 échangé contre un jeton OAuth2), sans dépendance supplémentaire. Si les
 * variables FCM_* ne sont pas renseignées, l'envoi est simplement ignoré : les
 * notifications internes et les emails restent délivrés.
 */

const PROJET = process.env.FCM_PROJECT_ID;
const EMAIL_COMPTE = process.env.FCM_CLIENT_EMAIL;
const CLE_PRIVEE = (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const estConfigure = () => Boolean(PROJET && EMAIL_COMPTE && CLE_PRIVEE);

let jetonEnCache = null;

const obtenirJetonAcces = async () => {
  if (jetonEnCache && jetonEnCache.expireA > Date.now() + 60 * 1000) return jetonEnCache.valeur;

  const maintenant = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: EMAIL_COMPTE,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: maintenant,
      exp: maintenant + 3600,
    },
    CLE_PRIVEE,
    { algorithm: 'RS256' }
  );

  const reponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!reponse.ok) throw new Error(`OAuth2 Google : HTTP ${reponse.status}`);
  const { access_token: valeur, expires_in: duree } = await reponse.json();
  jetonEnCache = { valeur, expireA: Date.now() + Number(duree || 3600) * 1000 };
  return valeur;
};

/**
 * Envoie une notification push à un appareil.
 * @returns {Promise<boolean>} vrai si FCM a accepté le message.
 */
const envoyerPush = async ({ token, titre, message, donnees = {} }) => {
  if (!token || !estConfigure()) return false;
  try {
    const acces = await obtenirJetonAcces();
    const reponse = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJET}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: titre, body: message },
          // FCM n'accepte que des chaînes dans le bloc data
          data: Object.fromEntries(
            Object.entries(donnees)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => [k, String(v)])
          ),
        },
      }),
    });
    if (!reponse.ok) {
      logger.warn('Notification push refusée par FCM', { status: reponse.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Échec d envoi de notification push', { message: err.message });
    return false;
  }
};

module.exports = { envoyerPush, estConfigure };
