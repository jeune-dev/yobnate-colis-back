const logger = require('../config/logger');

/**
 * Messages WhatsApp via l'API WhatsApp Cloud (Meta).
 *
 * Hors fenêtre de conversation de 24 h, WhatsApp n'accepte que des modèles
 * pré-approuvés : si WHATSAPP_TEMPLATE_SUIVI est défini, le message est envoyé
 * avec ce modèle (un seul paramètre de corps : le texte de la notification),
 * sinon en texte libre. Sans WHATSAPP_TOKEN ni WHATSAPP_PHONE_NUMBER_ID,
 * l'envoi est ignoré sans erreur.
 */

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const MODELE = process.env.WHATSAPP_TEMPLATE_SUIVI;
const LANGUE = process.env.WHATSAPP_TEMPLATE_LANGUE || 'fr';
const VERSION_API = process.env.WHATSAPP_API_VERSION || 'v20.0';

const estConfigure = () => Boolean(TOKEN && PHONE_ID);

/** L'API attend le numéro international sans « + » ni espaces. */
const normaliserNumero = (telephone) => String(telephone || '').replace(/[^\d]/g, '');

const envoyerWhatsapp = async ({ telephone, message }) => {
  const destinataire = normaliserNumero(telephone);
  if (!destinataire || !estConfigure()) return false;

  const corps = MODELE
    ? {
        type: 'template',
        template: {
          name: MODELE,
          language: { code: LANGUE },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
        },
      }
    : { type: 'text', text: { preview_url: true, body: message } };

  try {
    const reponse = await fetch(`https://graph.facebook.com/${VERSION_API}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destinataire, ...corps }),
    });
    if (!reponse.ok) {
      logger.warn('Message WhatsApp refusé', { status: reponse.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Échec d envoi WhatsApp', { message: err.message });
    return false;
  }
};

module.exports = { envoyerWhatsapp, estConfigure };
