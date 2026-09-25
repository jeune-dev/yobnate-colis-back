const multer = require('multer');
const { uploadConfig } = require('../config/security');

// Signatures binaires (magic bytes) pour valider le vrai type de fichier,
// indépendamment de l'extension ou du mimetype déclaré par le client.
const MAGIC_BYTES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

const isAllowedFile = (buffer) =>
  MAGIC_BYTES.some((sig) => sig.bytes.every((byte, i) => buffer[i] === byte));

/** Signatures des formats audio produits par les smartphones (message vocal). */
const commencePar = (buffer, octets, decalage = 0) =>
  octets.every((byte, i) => buffer[decalage + i] === byte);

const isAllowedAudio = (buffer) =>
  Boolean(buffer) &&
  buffer.length > 12 &&
  (commencePar(buffer, [0x66, 0x74, 0x79, 0x70], 4) || // m4a / mp4 / 3gp : « ftyp »
    commencePar(buffer, [0x49, 0x44, 0x33]) || // mp3 avec étiquette ID3
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) || // trame MPEG / AAC ADTS
    commencePar(buffer, [0x4f, 0x67, 0x67, 0x53]) || // ogg / opus : « OggS »
    commencePar(buffer, [0x1a, 0x45, 0xdf, 0xa3]) || // webm
    (commencePar(buffer, [0x52, 0x49, 0x46, 0x46]) &&
      commencePar(buffer, [0x57, 0x41, 0x56, 0x45], 8))); // wav

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Type de fichier non autorisé'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: uploadConfig.maxFileSize },
  fileFilter,
});

/**
 * Formulaire d'expédition : photos du colis et, en option, un message vocal
 * descriptif. Chaque champ n'accepte que son propre type de fichier.
 */
const TYPES_AUDIO = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/3gpp',
  'video/mp4', // certains enregistreurs Android étiquettent ainsi un m4a
];

const uploadColis = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 11 },
  fileFilter: (req, file, cb) => {
    const autorises =
      file.fieldname === 'vocal'
        ? TYPES_AUDIO
        : uploadConfig.allowedMimeTypes.filter((t) => t.startsWith('image/'));
    if (!autorises.includes(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    cb(null, true);
  },
}).fields([
  { name: 'photos', maxCount: 10 },
  { name: 'vocal', maxCount: 1 },
]);

module.exports = { upload, uploadColis, isAllowedFile, isAllowedAudio };
