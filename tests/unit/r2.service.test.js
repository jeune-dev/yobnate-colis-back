/**
 * Stockage Cloudflare R2 et vérification du contenu des fichiers (magic bytes),
 * sur le modèle de sign-back. Client S3 simulé : aucun appel réseau.
 */
const {
  typeFichier,
  checkMagicBytes,
  validateMagicBytes,
} = require('../../src/middlewares/upload.middleware');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600', 'hex');
const PDF = Buffer.from('%PDF-1.7 justificatif');
const M4A = Buffer.from('000000206674797069736f6d00000200', 'hex');
const SCRIPT = Buffer.from('#!/bin/sh\nrm -rf /');

const VARIABLES_R2 = {
  R2_ACCOUNT_ID: 'compte',
  R2_ACCESS_KEY_ID: 'cle',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'yobante-colis',
  R2_PUBLIC_URL: 'https://fichiers.exemple.com/',
};

/** Charge r2.service avec ou sans configuration, client S3 remplacé par un double. */
const chargerR2 = ({ configure = true, echec = false } = {}) => {
  const envois = [];
  let service;
  jest.isolateModules(() => {
    for (const [cle, valeur] of Object.entries(VARIABLES_R2)) {
      if (configure) process.env[cle] = valeur;
      else delete process.env[cle];
    }
    jest.doMock('@aws-sdk/client-s3', () => {
      const commande = (type) =>
        jest.fn(function Commande(entree) {
          this.type = type;
          this.entree = entree;
        });
      return {
        S3Client: jest.fn(() => ({
          send: jest.fn((cmd) => {
            envois.push(cmd);
            return echec
              ? Promise.reject(
                  Object.assign(new Error('Accès refusé'), { $metadata: { httpStatusCode: 403 } })
                )
              : Promise.resolve({});
          }),
        })),
        PutObjectCommand: commande('put'),
        DeleteObjectCommand: commande('delete'),
      };
    });
    service = require('../../src/infrastructure/r2.service');
  });
  return { service, envois };
};

afterEach(() => {
  for (const cle of Object.keys(VARIABLES_R2)) delete process.env[cle];
  jest.resetModules();
});

describe('Vérification du contenu des fichiers (magic bytes)', () => {
  test('contenu conforme au type déclaré', () => {
    expect(checkMagicBytes(PNG, 'image/png')).toBe(true);
    expect(checkMagicBytes(JPEG, 'image/jpeg')).toBe(true);
    expect(checkMagicBytes(PDF, 'application/pdf')).toBe(true);
    expect(checkMagicBytes(M4A, 'audio/mp4')).toBe(true);
  });

  test('contenu différent du type déclaré : refusé', () => {
    expect(checkMagicBytes(PDF, 'image/png')).toBe(false);
    expect(checkMagicBytes(SCRIPT, 'image/jpeg')).toBe(false);
    expect(typeFichier(SCRIPT)).toBeNull();
  });

  test('middleware : 400 nommant le fichier, quelle que soit la forme de multer', () => {
    const appeler = (req) => {
      const next = jest.fn();
      validateMagicBytes(req, {}, next);
      return next.mock.calls[0][0];
    };
    expect(
      appeler({ file: { buffer: PNG, mimetype: 'image/png', originalname: 'a.png' } })
    ).toBeUndefined();

    const erreur = appeler({
      files: {
        photos: [{ buffer: PNG, mimetype: 'image/png', originalname: 'a.png' }],
        vocal: [{ buffer: SCRIPT, mimetype: 'audio/mp4', originalname: 'vocal.m4a' }],
      },
    });
    expect(erreur).toMatchObject({
      statusCode: 400,
      message: 'Fichier invalide : "vocal.m4a". Le contenu ne correspond pas au type déclaré.',
    });
    expect(
      appeler({ files: [{ buffer: PDF, mimetype: 'image/png', originalname: 'photo.png' }] })
    ).toMatchObject({ statusCode: 400 });
  });
});

describe('Stockage Cloudflare R2', () => {
  test('envoi : clé aléatoire dans le dossier, type réel, URL publique', async () => {
    const { service, envois } = chargerR2();
    const fichier = await service.uploadFile(PDF, { folder: 'yobante-colis/justificatifs' });

    const { Bucket, Key, ContentType } = envois[0].entree;
    expect(Bucket).toBe('yobante-colis');
    expect(Key).toMatch(/^yobante-colis\/justificatifs\/[0-9a-f-]{36}\.pdf$/);
    expect(ContentType).toBe('application/pdf');
    expect(fichier).toEqual({ url: `https://fichiers.exemple.com/${Key}`, publicId: `r2:${Key}` });
  });

  test('suppression : fichier R2 supprimé, identifiant antérieur à R2 ignoré', async () => {
    const { service, envois } = chargerR2();
    await service.deleteFile('r2:yobante-colis/avatars/a.png');
    await service.deleteFile('yobante-colis/avatars/ancien-fichier');
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({
      type: 'delete',
      entree: { Key: 'yobante-colis/avatars/a.png' },
    });
  });

  test('refus de R2 : 503 explicite à l’envoi, suppression sans erreur', async () => {
    const { service } = chargerR2({ echec: true });
    await expect(service.uploadFile(PNG, { folder: 'x' })).rejects.toMatchObject({
      statusCode: 503,
      message: "L'envoi des fichiers a échoué, veuillez réessayer dans un instant",
    });
    await expect(service.deleteFile('r2:x/a.png')).resolves.toBeUndefined();
  });

  test('R2 non configuré : 503 explicite, aucun envoi', async () => {
    const { service, envois } = chargerR2({ configure: false });
    await expect(service.uploadFile(PNG, { folder: 'x' })).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(envois).toHaveLength(0);
  });

  test('fichier de format inconnu : refusé avant tout envoi', async () => {
    const { service, envois } = chargerR2();
    await expect(service.uploadFile(SCRIPT, { folder: 'x' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(envois).toHaveLength(0);
  });
});
