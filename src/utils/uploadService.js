const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');
const { isAllowedFile, isAllowedAudio } = require('../middlewares/upload.middleware');
const { BadRequestError } = require('../errors/AppError');

const uploadToCloudinary = (buffer, { folder = 'yobnate-colis', resourceType = 'image' } = {}) => {
  // Cloudinary range l'audio parmi les ressources « video »
  const valide = resourceType === 'video' ? isAllowedAudio(buffer) : isAllowedFile(buffer);
  if (!valide) {
    throw new BadRequestError('Fichier invalide ou corrompu');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

const deleteFromCloudinary = (publicId, resourceType = 'image') => {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
