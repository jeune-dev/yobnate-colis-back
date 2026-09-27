/**
 * Plafond des réceptions de fichiers simultanées (mémoire bornée) : au-delà du
 * plafond, les envois attendent leur tour, puis reçoivent un 503 s'il tarde trop.
 */
process.env.UPLOAD_CONCURRENCE = '1';
process.env.UPLOAD_ATTENTE_MS = '300';

const express = require('express');
const request = require('supertest');
const { upload, etatReceptions } = require('../../src/middlewares/upload.middleware');
const errorHandler = require('../../src/middlewares/errorHandler.middleware');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

const application = (dureeTraitementMs) => {
  const app = express();
  app.post('/envoi', upload.single('photo'), async (req, res) => {
    await new Promise((r) => setTimeout(r, dureeTraitementMs));
    res.json({ taille: req.file?.size });
  });
  app.use(errorHandler);
  return app;
};

const envoyer = (app) =>
  request(app)
    .post('/envoi')
    .attach('photo', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });

describe('Plafond des réceptions de fichiers', () => {
  test('les envois au-delà du plafond attendent leur tour, puis passent', async () => {
    const app = application(50);
    const reponses = await Promise.all([envoyer(app), envoyer(app), envoyer(app)]);
    expect(reponses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(etatReceptions()).toEqual({ enCours: 0, enAttente: 0 });
  });

  test('une attente trop longue répond 503, sans bloquer la place', async () => {
    const app = application(600);
    const reponses = await Promise.all([envoyer(app), envoyer(app)]);
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 503]);
    expect(etatReceptions()).toEqual({ enCours: 0, enAttente: 0 });
  });
});
