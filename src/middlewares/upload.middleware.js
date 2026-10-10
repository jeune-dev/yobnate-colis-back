const multer = require('multer');
const { uploadConfig } = require('../config/security');
const { BadRequestError, ServiceUnavailableError } = require('../errors/AppError');

/**
 * Réceptions de fichiers simultanées, par processus.
 *
 * multer garde chaque fichier en mémoire jusqu'à la fin de la requête (le fichier
 * est ensuite contrôlé puis envoyé à Cloudflare R2). Sans plafond, la mémoire croissait
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

/**
 * Signatures binaires (magic bytes) des formats acceptés, comme dans sign-back :
 * le contenu réel du fichier doit correspondre au type déclaré par le client.
 * Protège contre les exécutables ou scripts déguisés en image, PDF ou audio.
 * `types` : types déclarés compatibles ; `contentType` / `extension` : stockage R2.
 */
const commencePar = (buffer, octets, decalage = 0) =>
  octets.every((octet, i) => buffer[decalage + i] === octet);

const SIGNATURES = [
  {
    test: (b) => commencePar(b, [0x89, 0x50, 0x4e, 0x47]),
    types: ['image/png'],
    contentType: 'image/png',
    extension: 'png',
  },
  {
    test: (b) => commencePar(b, [0xff, 0xd8, 0xff]),
    types: ['image/jpeg', 'image/jpg'],
    contentType: 'image/jpeg',
    extension: 'jpg',
  },
  {
    test: (b) => commencePar(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
    types: ['application/pdf'],
    contentType: 'application/pdf',
    extension: 'pdf',
  },
  // Formats audio produits par les smartphones (message vocal)
  {
    test: (b) => commencePar(b, [0x66, 0x74, 0x79, 0x70], 4), // « ftyp » : m4a, mp4, 3gp
    types: ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/3gpp', 'video/mp4'],
    contentType: 'audio/mp4',
    extension: 'm4a',
  },
  {
    test: (b) => commencePar(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), // ID3, trame MPEG / AAC
    types: ['audio/mpeg', 'audio/mp3', 'audio/aac'],
    contentType: 'audio/mpeg',
    extension: 'mp3',
  },
  {
    test: (b) => commencePar(b, [0x4f, 0x67, 0x67, 0x53]), // « OggS »
    types: ['audio/ogg', 'audio/opus'],
    contentType: 'audio/ogg',
    extension: 'ogg',
  },
  {
    test: (b) => commencePar(b, [0x1a, 0x45, 0xdf, 0xa3]),
    types: ['audio/webm'],
    contentType: 'audio/webm',
    extension: 'webm',
  },
  {
    test: (b) =>
      commencePar(b, [0x52, 0x49, 0x46, 0x46]) && commencePar(b, [0x57, 0x41, 0x56, 0x45], 8), // RIFF…WAVE
    types: ['audio/wav', 'audio/x-wav'],
    contentType: 'audio/wav',
    extension: 'wav',
  },
];

/** Format réel d'un fichier d'après ses premiers octets (null : format refusé). */
const typeFichier = (buffer) =>
  buffer && buffer.length >= 4 ? SIGNATURES.find((s) => s.test(buffer)) || null : null;

/** Le contenu du fichier correspond-il au type qu'il déclare ? */
const checkMagicBytes = (buffer, mimetype) =>
  Boolean(typeFichier(buffer)?.types.includes(mimetype));

/**
 * Middleware enchaîné après multer (single, array, fields) : chaque fichier reçu
 * doit avoir un contenu conforme à son type déclaré, sinon la requête est refusée
 * avant tout traitement ou stockage.
 */
const validateMagicBytes = (req, res, next) => {
  const fichiers = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
  ];
  const invalide = fichiers.find((f) => !checkMagicBytes(f.buffer, f.mimetype));
  if (invalide) {
    return next(
      new BadRequestError(
        `Fichier invalide : "${invalide.originalname}". Le contenu ne correspond pas au type déclaré.`
      )
    );
  }
  next();
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Type de fichier non autorisé'));
  }
  cb(null, true);
};

/**
 * Un middleware multer précédé du plafond de réceptions simultanées et suivi de
 * la vérification du contenu des fichiers : aucune route ne peut l'oublier.
 */
const avecPlafond = (middleware) => [limiterReceptions, middleware, validateMagicBytes];

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
  typeFichier,
  checkMagicBytes,
  validateMagicBytes,
  etatReceptions: () => ({ enCours: receptionsEnCours, enAttente: enAttente.length }),
};
