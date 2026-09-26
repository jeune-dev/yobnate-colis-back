/**
 * Tentatives interdites : chaque refus doit renvoyer le bon code HTTP ET ne
 * laisser aucune trace en base.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Sécurité — authentification et rôles (base réelle)', () => {
  let app;
  let client;
  let jetonClient;
  let point;

  beforeAll(async () => {
    app = require('../../src/app');
    client = await f.creerUtilisateur();
    jetonClient = await f.jeton(client);
    point = await f.creerPoint();
    const autreClient = await f.creerUtilisateur();
    await f.creerColis(autreClient, {
      pointActuelId: point.id,
      destinataireNom: 'Awa Diop',
      destinataireTelephone: '+221771112233',
    });
  });

  afterAll(fermerBase);

  describe('Jeton', () => {
    test('absent → 401', async () => {
      const res = await request(app).get('/client/colis');
      expect(res.status).toBe(401);
    });

    test('signé avec un autre secret → 401', async () => {
      const faux = jwt.sign({ sub: client.id, role: 'client' }, 'x'.repeat(40));
      const res = await request(app).get('/client/colis').set('Authorization', `Bearer ${faux}`);
      expect(res.status).toBe(401);
    });

    test('expiré → 401', async () => {
      const expire = jwt.sign({ sub: client.id, role: 'client' }, process.env.JWT_SECRET, {
        expiresIn: -10,
      });
      const res = await request(app).get('/client/colis').set('Authorization', `Bearer ${expire}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Token expiré');
    });

    test('rôle forgé dans le jeton : le rôle en base fait foi', async () => {
      const forge = jwt.sign(
        { sub: client.id, role: 'super_admin', tv: client.tokenVersion ?? 0 },
        process.env.JWT_SECRET
      );
      const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${forge}`);
      expect(res.status).toBe(403);
    });

    test('compte supprimé → 401', async () => {
      const ephemere = await f.creerUtilisateur();
      const entete = await f.jeton(ephemere);
      await f.models.RefreshToken.destroy({ where: { userId: ephemere.id } });
      await ephemere.destroy();
      const res = await request(app).get('/client/colis').set('Authorization', entete);
      expect(res.status).toBe(401);
    });

    test('compte désactivé → 403', async () => {
      const inactif = await f.creerUtilisateur({ isActive: false });
      const res = await request(app)
        .get('/client/colis')
        .set('Authorization', await f.jeton(inactif));
      expect(res.status).toBe(403);
    });
  });

  describe('CLIENT → back-office', () => {
    test.each([
      ['get', '/admin/users'],
      ['get', '/admin/colis'],
      ['get', '/admin/paiements'],
      ['get', '/admin/factures'],
      ['get', '/admin/dashboard/stats'],
      ['get', '/admin/points-collecte'],
      ['get', '/admin/parametres'],
    ])('%s %s → 403', async (verbe, url) => {
      const res = await request(app)[verbe](url).set('Authorization', jetonClient);
      expect(res.status).toBe(403);
    });

    test('stock d’un point (noms et téléphones des destinataires) → 403', async () => {
      const res = await request(app)
        .get(`/admin/points-collecte/${point.id}/stock`)
        .set('Authorization', jetonClient);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('+221771112233');
    });

    test('fiche d’un point (coordonnées du responsable) → 403', async () => {
      const res = await request(app)
        .get(`/admin/points-collecte/${point.id}`)
        .set('Authorization', jetonClient);
      expect(res.status).toBe(403);
    });

    test('statistiques d’un point → 403', async () => {
      const res = await request(app)
        .get(`/admin/points-collecte/${point.id}/statistiques`)
        .set('Authorization', jetonClient);
      expect(res.status).toBe(403);
    });

    test('création d’un point refusée et rien n’est écrit', async () => {
      const avant = await f.models.PointCollecte.count();
      const res = await request(app)
        .post('/admin/points-collecte')
        .set('Authorization', jetonClient)
        .send({ code: 'PIRATE', nom: 'Pirate' });
      expect(res.status).toBe(403);
      expect(await f.models.PointCollecte.count()).toBe(avant);
    });
  });

  describe('CLIENT → ressource d’un autre client', () => {
    test('détail, suivi, annulation du colis d’autrui → 404, colis intact', async () => {
      const autre = await f.creerUtilisateur();
      const colis = await f.creerColis(autre);
      const base = `/client/colis/${colis.id}`;

      expect((await request(app).get(base).set('Authorization', jetonClient)).status).toBe(404);
      expect(
        (await request(app).get(`${base}/suivi`).set('Authorization', jetonClient)).status
      ).toBe(404);
      const annulation = await request(app)
        .patch(`${base}/annuler`)
        .set('Authorization', jetonClient)
        .send({ motif: 'intrusion' });
      expect(annulation.status).toBe(404);

      await colis.reload();
      expect(colis.statut).toBe('en_attente');
      expect(await f.models.SuiviColis.count({ where: { colisId: colis.id } })).toBe(0);
    });

    test('facture d’autrui → 404', async () => {
      const autre = await f.creerUtilisateur();
      const facture = await f.creerFacture(await f.creerColis(autre));
      const res = await request(app)
        .get(`/client/paiements/factures/${facture.id}`)
        .set('Authorization', jetonClient);
      expect(res.status).toBe(404);
    });
  });

  describe('Personnel — périmètre', () => {
    test('AGENT de point → stock d’un autre point : 403', async () => {
      const sonPoint = await f.creerPoint();
      const agent = await f.creerUtilisateur({ role: 'agent_point', pointCollecteId: sonPoint.id });
      const entete = await f.jeton(agent);

      const autre = await request(app)
        .get(`/admin/points-collecte/${point.id}/stock`)
        .set('Authorization', entete);
      expect(autre.status).toBe(403);

      const sien = await request(app)
        .get(`/admin/points-collecte/${sonPoint.id}/stock`)
        .set('Authorization', entete);
      expect(sien.status).toBe(200);
    });

    test('ADMIN → stock de n’importe quel point : 200', async () => {
      const admin = await f.creerUtilisateur({ role: 'admin' });
      const res = await request(app)
        .get(`/admin/points-collecte/${point.id}/stock`)
        .set('Authorization', await f.jeton(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.colis).toHaveLength(1);
    });

    describe('COURSIER → enlèvement', () => {
      let ville;
      const creerEnlevement = (champs) =>
        f.models.DemandeEnlevement.create({
          reference: `ENL-${f.suffixe()}`,
          userId: client.id,
          contactNom: 'Contact',
          contactTelephone: '+221770000001',
          pays: 'SN',
          villeId: ville.id,
          adresse: 'Rue 1',
          dateSouhaitee: '2026-10-01',
          creneau: '08:00-12:00',
          statut: 'planifie',
          ...champs,
        });

      beforeAll(async () => {
        ville = await f.creerVille();
      });

      test('non affecté : démarrage et clôture hors périmètre (404), statut inchangé', async () => {
        const affecte = await f.creerUtilisateur({ role: 'coursier' });
        const intrus = await f.creerUtilisateur({ role: 'coursier' });
        const demande = await creerEnlevement({ coursierId: affecte.id });
        const entete = await f.jeton(intrus);

        const demarrage = await request(app)
          .patch(`/admin/enlevements/${demande.id}/demarrer`)
          .set('Authorization', entete);
        expect(demarrage.status).toBe(404);

        await demande.update({ statut: 'en_cours' });
        const cloture = await request(app)
          .patch(`/admin/enlevements/${demande.id}/cloturer`)
          .set('Authorization', entete)
          .send({ statut: 'echoue', motifEchec: 'Absent' });
        expect(cloture.status).toBe(404);

        await demande.reload();
        expect(demande.statut).toBe('en_cours');
      });

      test('affecté : démarrage autorisé', async () => {
        const coursier = await f.creerUtilisateur({ role: 'coursier' });
        const demande = await creerEnlevement({ coursierId: coursier.id });
        const res = await request(app)
          .patch(`/admin/enlevements/${demande.id}/demarrer`)
          .set('Authorization', await f.jeton(coursier));
        expect(res.status).toBe(200);
        await demande.reload();
        expect(demande.statut).toBe('en_cours');
      });
    });
  });
});
