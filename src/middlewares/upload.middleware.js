const multer = require('multer');
const { uploadConfig } = require('../config/security');

// Signatures binaires (magic bytes) pour valider le vrai type de fichier,
// indépendamment de l'extension ou du mimetype déclaré par le client.
const MAGIC_BYTES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }
];

const isAllowedFile = (buffer) =>
  MAGIC_BYTES.some((sig) => sig.bytes.every((byte, i) => buffer[i] === byte));

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
  fileFilter
});

module.exports = { upload, isAllowedFile };
