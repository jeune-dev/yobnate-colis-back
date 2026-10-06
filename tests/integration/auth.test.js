/**
 * Parcours d'authentification sur base réelle : connexion, réinitialisation,
 * changement de mot de passe et révocation des sessions.
 */
const crypto = require('crypto');
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const NOUVEAU = 'Nouveau1!pass';

describeDb('Authentification (base réelle)', () => {
  let app;

  beforeAll(() => {
    app = require('../../src/app');
  });
  afterAll(fermerBase);

  const deposerCode = (user, code) =>
    f.models.UserOtp.create({
      userId: user.id,
      codeHash: sha256(code),
      type: 'reset_password',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

  describe('Connexion', () => {
    test('identifiants valides → 200 avec jetons et sans mot de passe', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: f.MOT_DE_PASSE });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.utilisateur.password).toBeUndefined();
    });

    test('mauvais mot de passe → 401, aucun jeton de rafraîchissement créé', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'Mauvais1!x' });
      expect(res.status).toBe(401);
      expect(await f.models.RefreshToken.count({ where: { userId: user.id } })).toBe(0);
    });

    test('compte désactivé → 403', async () => {
      const user = await f.creerUtilisateur({ isActive: false });
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: f.MOT_DE_PASSE });
      expect(res.status).toBe(403);
    });

    test('corps invalide → 400', async () => {
      const res = await request(app).post('/auth/login').send({ password: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('Confirmation de l’adresse par code', () => {
    const inscrire = (champs = {}) =>
      request(app)
        .post('/auth/register')
        .send({
          nom: 'diop',
          prenom: 'awa',
          email: `code-${f.suffixe()}@exemple.com`,
          telephone: f.telephoneUnique(),
          password: 'Motdepasse1!',
          ...champs,
        });

    const deposerCodeVerification = async (email, code) => {
      const user = await f.models.User.findOne({ where: { email } });
      await f.models.UserOtp.update(
        { isUsed: true },
        { where: { userId: user.id, type: 'verification_email' } }
      );
      await f.models.UserOtp.create({
        userId: user.id,
        codeHash: sha256(code),
        type: 'verification_email',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      return user;
    };

    test('inscription : aucun jeton, code exigé, noms mis en forme', async () => {
      const res = await inscrire();
      expect(res.status).toBe(201);
      expect(res.body.data.verificationRequise).toBe(true);
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.utilisateur.nom).toBe('DIOP');
      expect(res.body.data.utilisateur.prenom).toBe('Awa');
    });

    test('connexion avant confirmation → 403 EMAIL_NON_CONFIRME', async () => {
      const { body } = await inscrire();
      const res = await request(app)
        .post('/auth/login')
        .send({ identifiant: body.data.email, password: 'Motdepasse1!' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NON_CONFIRME');
      expect(res.body.email).toBe(body.data.email);
    });

    test('code faux refusé ; bon code → session ouverte, puis connexion possible', async () => {
      const { body } = await inscrire();
      const email = body.data.email;
      await deposerCodeVerification(email, '246810');

      const faux = await request(app).post('/auth/verify-email').send({ email, code: '111111' });
      expect(faux.status).toBe(400);

      const bon = await request(app).post('/auth/verify-email').send({ email, code: '246810' });
      expect(bon.status).toBe(200);
      expect(bon.body.data.accessToken).toEqual(expect.any(String));

      const connexion = await request(app)
        .post('/auth/login')
        .send({ identifiant: email, password: 'Motdepasse1!' });
      expect(connexion.status).toBe(200);
    });

    test('adresse déjà confirmée : aucun jeton délivré sans mot de passe', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app)
        .post('/auth/verify-email')
        .send({ email: user.email, code: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.data?.accessToken).toBeUndefined();
    });

    test('après 5 codes faux, le bon code est lui aussi refusé', async () => {
      const { body } = await inscrire();
      const email = body.data.email;
      await deposerCodeVerification(email, '135790');
      for (let i = 0; i < 5; i += 1) {
        await request(app)
          .post('/auth/verify-email')
          .send({ email, code: String(200000 + i) })
          .expect(400);
      }
      const res = await request(app).post('/auth/verify-email').send({ email, code: '135790' });
      expect(res.status).toBe(400);
    });

    test('numéro déjà utilisé → 409 qui nomme le téléphone', async () => {
      const user = await f.creerUtilisateur();
      const res = await inscrire({ telephone: user.telephone });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/numéro de téléphone/);
    });

    test('saisie invalide → message précis', async () => {
      const res = await inscrire({ email: 'awa diop@exemple.com', telephone: '+2217712345' });
      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          "L'adresse email ne doit pas contenir d'espace",
          expect.stringMatching(/9 chiffres/),
        ])
      );
    });
  });

  describe('Adresse email insensible à la casse', () => {
    test('inscription avec la même adresse en majuscules → 409', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app).post('/auth/register').send({
        nom: 'Doublon',
        prenom: 'Test',
        email: user.email.toUpperCase(),
        telephone: '+221781234567',
        password: 'Motdepasse1!',
      });
      expect(res.status).toBe(409);
    });

    test('compte historique enregistré avec des majuscules : doublon détecté, mot de passe oublié servi', async () => {
      const historique = await f.creerUtilisateur({ email: `Ancien-${f.suffixe()}@Exemple.com` });
      const inscription = await request(app).post('/auth/register').send({
        nom: 'Doublon',
        prenom: 'Test',
        email: historique.email.toLowerCase(),
        telephone: f.telephoneUnique(),
        password: 'Motdepasse1!',
      });
      expect(inscription.status).toBe(409);

      await request(app)
        .post('/auth/forgot-password')
        .send({ email: historique.email.toLowerCase() })
        .expect(200);
      expect(await f.models.UserOtp.count({ where: { userId: historique.id } })).toBe(1);
    });

    test('l’adresse est enregistrée en minuscules', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          nom: 'Casse',
          prenom: 'Test',
          email: `MiXeD-${f.suffixe()}@Exemple.COM`,
          telephone: f.telephoneUnique(),
          password: 'Motdepasse1!',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.utilisateur.email).toBe(res.body.data.utilisateur.email.toLowerCase());
    });

    test('mot de passe oublié avec une casse différente → code émis', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: user.email.toUpperCase() });
      expect(res.status).toBe(200);
      expect(await f.models.UserOtp.count({ where: { userId: user.id } })).toBe(1);
    });
  });

  describe('Réinitialisation par code', () => {
    test('code correct → mot de passe changé, code consommé', async () => {
      const user = await f.creerUtilisateur();
      await deposerCode(user, '123456');
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ email: user.email, code: '123456', newPassword: NOUVEAU });
      expect(res.status).toBe(200);

      const connexion = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: NOUVEAU });
      expect(connexion.status).toBe(200);
    });

    test('force brute : après 5 codes faux, le bon code est lui aussi refusé', async () => {
      const user = await f.creerUtilisateur();
      await deposerCode(user, '654321');
      for (let i = 0; i < 5; i += 1) {
        const essai = await request(app)
          .post('/auth/reset-password')
          .send({ email: user.email, code: String(100000 + i), newPassword: NOUVEAU });
        expect(essai.status).toBe(400);
      }
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ email: user.email, code: '654321', newPassword: NOUVEAU });
      expect(res.status).toBe(400);

      // Le mot de passe d'origine reste le seul valable
      const connexion = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: f.MOT_DE_PASSE });
      expect(connexion.status).toBe(200);
    });
  });

  describe('Révocation des sessions', () => {
    test('changement de mot de passe : l’ancien jeton d’accès est refusé', async () => {
      const user = await f.creerUtilisateur();
      const entete = await f.jeton(user);
      expect((await request(app).get('/client/profil').set('Authorization', entete)).status).toBe(
        200
      );

      const changement = await request(app)
        .put('/auth/change-password')
        .set('Authorization', entete)
        .send({ oldPassword: f.MOT_DE_PASSE, newPassword: NOUVEAU });
      expect(changement.status).toBe(200);

      const apres = await request(app).get('/client/profil').set('Authorization', entete);
      expect(apres.status).toBe(401);
    });

    test('réinitialisation : les jetons déjà émis sont refusés', async () => {
      const user = await f.creerUtilisateur();
      const entete = await f.jeton(user);
      await request(app).get('/client/profil').set('Authorization', entete); // mis en cache
      await deposerCode(user, '222333');
      await request(app)
        .post('/auth/reset-password')
        .send({ email: user.email, code: '222333', newPassword: NOUVEAU })
        .expect(200);

      const apres = await request(app).get('/client/profil').set('Authorization', entete);
      expect(apres.status).toBe(401);
    });

    test('désactivation par un administrateur : effet immédiat', async () => {
      const admin = await f.creerUtilisateur({ role: 'admin' });
      const user = await f.creerUtilisateur();
      const entete = await f.jeton(user);
      await request(app).get('/client/profil').set('Authorization', entete).expect(200);

      await request(app)
        .patch(`/admin/users/${user.id}/statut`)
        .set('Authorization', await f.jeton(admin))
        .send({ isActive: false })
        .expect(200);

      const apres = await request(app).get('/client/profil').set('Authorization', entete);
      expect(apres.status).toBe(403);
    });

    test('déconnexion : jeton d’accès révoqué', async () => {
      const user = await f.creerUtilisateur();
      const entete = await f.jeton(user);
      await request(app).post('/auth/logout').set('Authorization', entete).expect(200);
      const apres = await request(app).get('/client/profil').set('Authorization', entete);
      expect(apres.status).toBe(401);
    });
  });
});
