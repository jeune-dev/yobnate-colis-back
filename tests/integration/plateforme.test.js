/**
 * Socle de l'API : sondes de santé, préfixe versionné, format des erreurs,
 * déconnexion, règles transverses de compte.
 */
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Socle de l’API (base réelle)', () => {
  let app;

  beforeAll(() => {
    app = require('../../src/app');
  });
  afterAll(fermerBase);

  describe('Sondes de santé', () => {
    test.each(['/health', '/health/ready', '/api/v1/health'])(
      '%s → 200 base connectée',
      async (url) => {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, db: 'connected' });
        expect(res.headers['cache-control']).toContain('no-store');
      }
    );

    test('/health/live répond sans interroger la base', async () => {
      expect((await request(app).get('/health/live')).status).toBe(200);
    });

    test('pendant l’arrêt gracieux → 503', async () => {
      const etat = require('../../src/utils/etatApplication');
      etat.signalerArret();
      try {
        const res = await request(app).get('/health');
        expect(res.status).toBe(503);
      } finally {
        etat.reprendre();
      }
    });
  });

  describe('Préfixe /api/v1 et chemins historiques', () => {
    test('la même route répond sous les deux chemins', async () => {
      const user = await f.creerUtilisateur();
      for (const base of ['', '/api/v1']) {
        const res = await request(app)
          .post(`${base}/auth/login`)
          .send({ email: user.email, password: f.MOT_DE_PASSE });
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Format des erreurs', () => {
    test('route inconnue → 404 avec identifiant de corrélation', async () => {
      const res = await request(app).get('/nexiste/pas').set('X-Request-ID', 'test-correlation-1');
      expect(res.status).toBe(404);
      expect(res.body.requestId).toBe('test-correlation-1');
      expect(res.headers['x-request-id']).toBe('test-correlation-1');
    });

    test('identifiant de corrélation malformé → remplacé', async () => {
      const res = await request(app).get('/health/live').set('X-Request-ID', '<script>');
      expect(res.headers['x-request-id']).not.toBe('<script>');
    });

    test('validation → 400 avec le détail par champ', async () => {
      const res = await request(app).post('/auth/register').send({ email: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    test('JSON malformé → 400', async () => {
      const res = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(res.status).toBe(400);
    });

    test('en-têtes de sécurité présents, X-Powered-By absent', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });
  });

  describe('Déconnexion', () => {
    test('aboutit avec un jeton d’accès expiré et révoque le refresh token', async () => {
      const user = await f.creerUtilisateur();
      const connexion = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: f.MOT_DE_PASSE })
        .expect(200);
      const expire = jwt.sign({ sub: user.id, role: 'client', tv: 0 }, process.env.JWT_SECRET, {
        expiresIn: -10,
      });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${expire}`)
        .send({ refreshToken: connexion.body.data.refreshToken });
      expect(res.status).toBe(200);

      const rafraichir = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: connexion.body.data.refreshToken });
      expect(rafraichir.status).toBe(401);
    });

    test('un jeton forgé n’est pas inscrit en liste de révocation', async () => {
      const avant = await f.models.TokenBlacklist.count();
      const forge = jwt.sign(
        { sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 },
        'autre'.repeat(10)
      );
      await request(app).post('/auth/logout').set('Authorization', `Bearer ${forge}`).expect(200);
      expect(await f.models.TokenBlacklist.count()).toBe(avant);
    });
  });

  describe('Compte désactivé', () => {
    test('ne peut pas changer son mot de passe → 403', async () => {
      const user = await f.creerUtilisateur({ isActive: false });
      const res = await request(app)
        .put('/auth/change-password')
        .set('Authorization', await f.jeton(user))
        .send({ oldPassword: f.MOT_DE_PASSE, newPassword: 'Nouveau1!pass' });
      expect(res.status).toBe(403);
    });
  });

  describe('Annulation d’une expédition déjà réglée', () => {
    test('→ 409, rien n’est modifié (le remboursement passe par le service client)', async () => {
      const client = await f.creerUtilisateur({ creditParrainage: 0 });
      const colis = await f.creerColis(client, { creditParrainageUtilise: 5 });
      const facture = await f.creerFacture(colis, {
        montantPaye: 40,
        statut: 'partiellement_payee',
      });

      const res = await request(app)
        .patch(`/client/colis/${colis.id}/annuler`)
        .set('Authorization', await f.jeton(client))
        .send({});
      expect(res.status).toBe(409);

      await Promise.all([colis.reload(), facture.reload(), client.reload()]);
      expect(colis.statut).toBe('en_attente');
      expect(facture.statut).toBe('partiellement_payee');
      expect(Number(client.creditParrainage)).toBe(0);
    });
  });

  describe('Purge planifiée', () => {
    test('supprime jetons et codes expirés, conserve les valides', async () => {
      const { cleanupExpiredTokens } = require('../../src/jobs/cleanupExpiredTokens.job');
      const user = await f.creerUtilisateur();
      const passe = new Date(Date.now() - 60 * 1000);
      const futur = new Date(Date.now() + 60 * 60 * 1000);
      await f.models.UserOtp.bulkCreate([
        { userId: user.id, codeHash: 'a'.repeat(64), type: 'reset_password', expiresAt: passe },
        { userId: user.id, codeHash: 'b'.repeat(64), type: 'reset_password', expiresAt: futur },
      ]);
      await f.models.RefreshToken.create({
        userId: user.id,
        tokenHash: 'c'.repeat(64),
        expiresAt: passe,
      });

      await cleanupExpiredTokens();

      expect(await f.models.UserOtp.count({ where: { userId: user.id } })).toBe(1);
      expect(await f.models.RefreshToken.count({ where: { userId: user.id } })).toBe(0);
    });
  });
});
