const multer = require('multer');
const { uploadConfig } = require('../config/security');
const { ServiceUnavailableError } = require('../errors/AppError');

/**
 * Réceptions de fichiers simultanées, par processus.
 *
 * multer garde chaque fichier en mémoire jusqu'à la fin de la requête (le fichier
 * est ensuite contrôlé puis envoyé à Cloudinary). Sans plafond, la mémoire croissait
 * avec le nombre d'envois en cours : 30 déclarations simultanées de 20 Mo portaient
 * le processus à 568 Mo, au-delà de la limite de 512 Mo du conteneur de production
 * (arrêt brutal par le noyau, toutes les requêtes en cours perdues).
 *
 * Au-delà de UPLOAD_CONCURRENCE réceptions (4 par défaut, soit ~100 Mo au pire derrière
 * Nginx qui plafonne un corps à 25 Mo), les suivantes attendent leur tour, au plus
 * UPLOAD_ATTENTE_MS (30 s), puis reçoivent un 503 que l'application peut réessayer.
 */
const MAX_RECEPTIONS = Number(process.env.UPLOAD_CONCURRENCE) || 4;
const ATTENTE_MAX_MS = Number(process.env.UPLOAD_ATTENTE_MS) || 30000;
let receptionsEnCours = 0;
const enAttente = [];

const libererPlace = () => {
  receptionsEnCours -= 1;
  const suivant = enAttente.shift();
  if (suivant) suivant();
};

const limiterReceptions = (req, res, next) => {
  const demarrer = () => {
    receptionsEnCours += 1;
    let libere = false;
    const liberer = () => {
      if (libere) return;
      libere = true;
      libererPlace();
    };
    res.once('finish', liberer);
    res.once('close', liberer);
    next();
  };
  if (receptionsEnCours < MAX_RECEPTIONS) return demarrer();

  const tour = () => {
    clearTimeout(minuteur);
    req.off('close', abandon);
    demarrer();
  };
  const retirer = () => {
    const position = enAttente.indexOf(tour);
    if (position >= 0) enAttente.splice(position, 1);
  };
  // Client parti pendant l'attente : sa place dans la file est rendue
  const abandon = () => {
    clearTimeout(minuteur);
    retirer();
  };
  const minuteur = setTimeout(() => {
    retirer();
    req.off('close', abandon);
    next(
      new ServiceUnavailableError('Trop d’envois de fichiers en cours, réessayez dans un instant')
    );
  }, ATTENTE_MAX_MS);
  req.once('close', abandon);
  enAttente.push(tour);
};

/** Un middleware multer précédé du plafond de réceptions simultanées. */
const avecPlafond = (middleware) => [limiterReceptions, middleware];

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

const multerStandard = multer({
  storage,
  limits: { fileSize: uploadConfig.maxFileSize },
  fileFilter,
});
const upload = {
  single: (...args) => avecPlafond(multerStandard.single(...args)),
  array: (...args) => avecPlafond(multerStandard.array(...args)),
  fields: (...args) => avecPlafond(multerStandard.fields(...args)),
};

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

const uploadColis = avecPlafond(
  multer({
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
  ])
);

module.exports = {
  upload,
  uploadColis,
  isAllowedFile,
  isAllowedAudio,
  etatReceptions: () => ({ enCours: receptionsEnCours, enAttente: enAttente.length }),
};
