/**
 * r2.service.js — Stockage des fichiers sur Cloudflare R2 (même approche que sign-back).
 *
 * Photos de colis, avatars, justificatifs, pièces de réclamation, documents de
 * douane, messages vocaux, visuels du catalogue.
 *
 * Variables d'environnement requises :
 *   R2_ACCOUNT_ID         — ID du compte Cloudflare
 *   R2_ACCESS_KEY_ID      — Clé d'accès R2
 *   R2_SECRET_ACCESS_KEY  — Clé secrète R2
 *   R2_BUCKET_NAME        — Nom du bucket
 *   R2_PUBLIC_URL         — URL publique du bucket (domaine personnalisé ou https://pub-xxx.r2.dev)
 *
 * Le contenu des fichiers est vérifié dès la réception (validateMagicBytes, dans
 * upload.middleware) ; le format réel détermine ici le type et l'extension stockés.
 */

const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { typeFichier } = require('../middlewares/upload.middleware');
const { BadRequestError, ServiceUnavailableError } = require('../errors/AppError');
const logger = require('../utils/logger');

// ── Client R2 ─────────────────────────────────────────────────────────────────

const estConfigure = () =>
  Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );

const r2Client = estConfigure()
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

/**
 * Identifiant stocké en base : « r2:<clé> ». Un identifiant sans ce préfixe désigne un
 * fichier antérieur à R2, à transférer par scripts/migrerFichiersVersR2.js.
 */
const PREFIXE = 'r2:';

/**
 * Un refus de R2 (identifiants absents ou invalides, quota, délai dépassé) n'a pas
 * de statut HTTP exploitable : la cause exacte est journalisée et le client reçoit
 * un 503 explicite qu'il peut réessayer, au lieu d'une « Erreur interne du serveur ».
 */
const echecTeleversement = (err, folder) => {
  logger.error('Téléversement R2 en échec', {
    message: err?.message,
    httpCode: err?.$metadata?.httpStatusCode,
    folder,
  });
  return new ServiceUnavailableError(
    "L'envoi des fichiers a échoué, veuillez réessayer dans un instant"
  );
};

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Envoie un fichier (Buffer mémoire, req.file.buffer via multer) vers R2.
 * Clé aléatoire : l'adresse publique ne peut pas être devinée, et le nom
 * d'origine (parfois personnel) n'est jamais exposé.
 *
 * @param {Buffer} buffer      — contenu du fichier
 * @param {object} [options]
 * @param {string} [options.folder] — dossier dans le bucket (ex. 'yobnate-express/avatars')
 * @returns {Promise<{ url: string, publicId: string }>} URL publique et identifiant à conserver
 */
const uploadFile = async (buffer, { folder = 'yobnate-express' } = {}) => {
  const format = typeFichier(buffer);
  if (!format) throw new BadRequestError('Fichier invalide ou corrompu');
  if (!r2Client) {
    throw echecTeleversement(new Error('Stockage R2 non configuré (variables R2_*)'), folder);
  }

  const key = `${folder}/${crypto.randomUUID()}.${format.extension}`;
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: format.contentType,
        // Clé unique, jamais réécrite : mise en cache longue par Cloudflare et les apps
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  } catch (err) {
    throw echecTeleversement(err, folder);
  }
  return { url: `${PUBLIC_URL}/${key}`, publicId: `${PREFIXE}${key}` };
};

// ── Suppression ───────────────────────────────────────────────────────────────

/**
 * Supprime un fichier de R2. Simple nettoyage : un échec est journalisé mais ne
 * fait jamais échouer la requête (sinon une erreur alors que le nouveau fichier
 * est déjà en ligne). Un identifiant antérieur à R2 est ignoré.
 *
 * @param {string} publicId — identifiant renvoyé par uploadFile
 */
const deleteFile = async (publicId) => {
  if (!publicId) return;
  if (!publicId.startsWith(PREFIXE)) {
    logger.info('Fichier hors R2 : non supprimé (à transférer avec fichiers:migrer-r2)', {
      publicId,
    });
    return;
  }
  if (!r2Client) return;
  try {
    await r2Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: publicId.slice(PREFIXE.length) })
    );
  } catch (err) {
    logger.warn('Suppression R2 en échec', { message: err?.message, publicId });
  }
};

module.exports = { uploadFile, deleteFile, estConfigure, PUBLIC_URL };
