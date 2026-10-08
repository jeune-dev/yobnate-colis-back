/**
 * Périmètre du personnel (config/roles.js) : un agent ne voit que ce qui
 * transite par son point, un coursier que ce qui lui est affecté.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Périmètre du personnel (base réelle)', () => {
  let app;
  let pointA;
  let pointB;
  let agentA;
  let coursier;
  let client;
  let colisA;
  let colisB;
  let colisCoursier;

  beforeAll(async () => {
    app = require('../../src/app');
    [pointA, pointB] = await Promise.all([f.creerPoint(), f.creerPoint()]);
    agentA = await f.creerUtilisateur({ role: 'agent_point', pointCollecteId: pointA.id });
    coursier = await f.creerUtilisateur({ role: 'coursier' });
    client = await f.creerUtilisateur();
    colisA = await f.creerColis(client, { pointActuelId: pointA.id });
    colisB = await f.creerColis(client, { pointActuelId: pointB.id });
    colisCoursier = await f.creerColis(client, { coursierLivraisonId: coursier.id });
  });
  afterAll(fermerBase);

  describe('Colis', () => {
    test('liste de l’agent : uniquement les colis de son point', async () => {
      const res = await request(app)
        .get('/admin/colis')
        .query({ limit: 100 })
        .set('Authorization', await f.jeton(agentA));
      expect(res.status).toBe(200);
      const ids = res.body.data.colis.map((c) => c.id);
      expect(ids).toContain(colisA.id);
      expect(ids).not.toContain(colisB.id);
      expect(ids).not.toContain(colisCoursier.id);
    });

    test('détail d’un colis d’un autre point → 404 ; du sien → 200', async () => {
      const entete = await f.jeton(agentA);
      expect(
        (await request(app).get(`/admin/colis/${colisB.id}`).set('Authorization', entete)).status
      ).toBe(404);
      expect(
        (await request(app).get(`/admin/colis/${colisA.id}`).set('Authorization', entete)).status
      ).toBe(200);
    });

    test('note interne sur un colis hors périmètre → 404, rien n’est écrit', async () => {
      const avant = await f.models.SuiviColis.count({ where: { colisId: colisB.id } });
      const res = await request(app)
        .post(`/admin/colis/${colisB.id}/notes`)
        .set('Authorization', await f.jeton(agentA))
        .send({ note: 'intrusion' });
      expect(res.status).toBe(404);
      expect(await f.models.SuiviColis.count({ where: { colisId: colisB.id } })).toBe(avant);
    });

    test('recherche par numéro hors périmètre → 404', async () => {
      const res = await request(app)
        .get(`/admin/colis/recherche/${colisB.reference}`)
        .set('Authorization', await f.jeton(agentA));
      expect(res.status).toBe(404);
    });

    test('coursier : uniquement les colis qui lui sont affectés', async () => {
      const res = await request(app)
        .get('/admin/colis')
        .query({ limit: 100 })
        .set('Authorization', await f.jeton(coursier));
      expect(res.body.data.colis.map((c) => c.id)).toEqual([colisCoursier.id]);
    });

    test('administrateur : aucune restriction', async () => {
      const admin = await f.creerUtilisateur({ role: 'admin' });
      const res = await request(app)
        .get(`/admin/colis/${colisB.id}`)
        .set('Authorization', await f.jeton(admin));
      expect(res.status).toBe(200);
    });
  });

  describe('Encaissements', () => {
    test('agent : encaissement imposé à son point, jamais à un autre', async () => {
      const facture = await f.creerFacture(colisA);
      const entete = await f.jeton(agentA);

      const autrePoint = await request(app)
        .post(`/admin/paiements/factures/${facture.id}`)
        .set('Authorization', entete)
        .send({ methode: 'wave', montant: 10, pointCollecteId: pointB.id });
      expect(autrePoint.status).toBe(403);

      const res = await request(app)
        .post(`/admin/paiements/factures/${facture.id}`)
        .set('Authorization', entete)
        .send({ methode: 'wave', montant: 10 });
      expect(res.status).toBe(201);
      expect(res.body.data.paiement.pointCollecteId).toBe(pointA.id);
    });

    test('agent : facture d’un colis hors périmètre → 404, aucun paiement', async () => {
      const facture = await f.creerFacture(colisB);
      const res = await request(app)
        .post(`/admin/paiements/factures/${facture.id}`)
        .set('Authorization', await f.jeton(agentA))
        .send({ methode: 'wave', montant: 10 });
      expect(res.status).toBe(404);
      expect(await f.models.Paiement.count({ where: { factureId: facture.id } })).toBe(0);
    });

    test('agent : caisse d’un autre point → 403', async () => {
      const res = await request(app)
        .get(`/admin/paiements/caisse/${pointB.id}`)
        .set('Authorization', await f.jeton(agentA));
      expect(res.status).toBe(403);
    });

    test('coursier : liste limitée aux encaissements qu’il a enregistrés', async () => {
      const res = await request(app)
        .get('/admin/paiements')
        .set('Authorization', await f.jeton(coursier));
      expect(res.status).toBe(200);
      expect(res.body.data.paiements.every((p) => p.recordedBy === coursier.id)).toBe(true);
    });
  });

  describe('Missions du personnel', () => {
    test('un agent ne peut pas enregistrer une étape hors de sa mission (douane) → 403', async () => {
      const colis = await f.creerColis(client, { pointActuelId: pointA.id, statut: 'en_douane' });
      const res = await request(app)
        .post(`/admin/colis/${colis.id}/evenements`)
        .set('Authorization', await f.jeton(agentA))
        .send({ codeEvenement: 'DOUANE_OK' });
      expect(res.status).toBe(403);
      await colis.reload();
      expect(colis.statut).toBe('en_douane');
    });

    test('le détail masque le code de retrait et propose les étapes de la mission', async () => {
      const colis = await f.creerColis(client, {
        pointRetraitId: pointA.id,
        statut: 'arrive',
        codeRetrait: '123456',
      });
      const res = await request(app)
        .get(`/admin/colis/${colis.id}`)
        .set('Authorization', await f.jeton(agentA));
      expect(res.status).toBe(200);
      expect(res.body.data.colis.codeRetrait).toBeUndefined();
      expect(res.body.data.colis.aCodeRetrait).toBe(true);
      const codes = res.body.data.colis.evenementsPossibles.map((e) => e.code);
      expect(codes).toContain('DISPO');
      expect(codes).not.toContain('DOUANE_OK');
    });

    test('la remise au destinataire exige le bon code de retrait', async () => {
      const colis = await f.creerColis(client, {
        pointRetraitId: pointA.id,
        statut: 'disponible_retrait',
        codeRetrait: '654321',
      });
      const entete = await f.jeton(agentA);
      const retirer = (codeRetrait) =>
        request(app)
          .post(`/admin/colis/${colis.id}/evenements`)
          .set('Authorization', entete)
          .send({ codeEvenement: 'RETIRE', codeRetrait });

      expect((await retirer('000000')).status).toBe(400);
      expect((await retirer('654321')).status).toBe(200);
      await colis.reload();
      expect(colis.statut).toBe('recupere');
    });

    test('un coursier ne livre pas sans le code du destinataire quand il en a un', async () => {
      const colis = await f.creerColis(client, {
        coursierLivraisonId: coursier.id,
        statut: 'en_livraison',
        codeRetrait: '111222',
      });
      const res = await request(app)
        .post(`/admin/colis/${colis.id}/evenements`)
        .set('Authorization', await f.jeton(coursier))
        .send({ codeEvenement: 'LIVRE' });
      expect(res.status).toBe(400);
    });

    test('le coursier et l’agent du point de dépôt voient le colis d’un enlèvement', async () => {
      const autreCoursier = await f.creerUtilisateur({ role: 'coursier' });
      const colis = await f.creerColis(client, { statut: 'enlevement_planifie' });
      const ville = await f.models.Ville.create({ nom: 'Ville enlèvement', pays: 'FR' });
      await f.models.DemandeEnlevement.create({
        reference: `ENL-T-${Date.now()}`,
        userId: client.id,
        colisId: colis.id,
        contactNom: 'Client Test',
        contactTelephone: '+33612345678',
        pays: 'FR',
        villeId: ville.id,
        adresse: '1 rue du Test',
        dateSouhaitee: '2026-10-08',
        creneau: '08:00-12:00',
        statut: 'planifie',
        coursierId: autreCoursier.id,
        pointDepotId: pointA.id,
      });
      for (const membre of [autreCoursier, agentA]) {
        const res = await request(app)
          .get(`/admin/colis/${colis.id}`)
          .set('Authorization', await f.jeton(membre));
        expect(res.status).toBe(200);
      }
      // Un coursier étranger à l’enlèvement ne le voit pas
      const res = await request(app)
        .get(`/admin/colis/${colis.id}`)
        .set('Authorization', await f.jeton(coursier));
      expect(res.status).toBe(404);
    });
  });
});
