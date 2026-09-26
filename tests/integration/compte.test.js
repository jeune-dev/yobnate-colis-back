/**
 * Cycle de vie du compte (RGPD, Google Play) : export, suppression par le
 * titulaire, demande publique et traitement par un administrateur.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Compte client — export et suppression (base réelle)', () => {
  let app;
  let admin;
  let jetonAdmin;

  beforeAll(async () => {
    app = require('../../src/app');
    admin = await f.creerUtilisateur({ role: 'admin' });
    jetonAdmin = await f.jeton(admin);
  });
  afterAll(fermerBase);

  describe('Export des données (art. 20)', () => {
    test('renvoie le profil et les seules expéditions du titulaire, sans mot de passe', async () => {
      const client = await f.creerUtilisateur();
      const autre = await f.creerUtilisateur();
      const sien = await f.creerColis(client);
      await f.creerColis(autre);

      const res = await request(app)
        .get('/client/compte/export')
        .set('Authorization', await f.jeton(client));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      const { export: donnees } = res.body.data;
      expect(donnees.profil.email).toBe(client.email);
      expect(donnees.profil.password).toBeUndefined();
      expect(donnees.expeditions.map((c) => c.reference)).toEqual([sien.reference]);
    });

    test('sans jeton → 401', async () => {
      expect((await request(app).get('/client/compte/export')).status).toBe(401);
    });
  });

  describe('Suppression par le titulaire (art. 17)', () => {
    test('mot de passe incorrect → 400, compte intact', async () => {
      const client = await f.creerUtilisateur();
      const res = await request(app)
        .delete('/client/compte')
        .set('Authorization', await f.jeton(client))
        .send({ password: 'Mauvais1!x' });
      expect(res.status).toBe(400);
      await client.reload();
      expect(client.supprimeLe).toBeNull();
      expect(client.isActive).toBe(true);
    });

    test('expédition en cours → 409, compte intact', async () => {
      const client = await f.creerUtilisateur();
      await f.creerColis(client, { statut: 'en_transit' });
      const res = await request(app)
        .delete('/client/compte')
        .set('Authorization', await f.jeton(client))
        .send({ password: f.MOT_DE_PASSE });
      expect(res.status).toBe(409);
      await client.reload();
      expect(client.supprimeLe).toBeNull();
    });

    test('succès : données pseudonymisées, sessions révoquées, expéditions conservées', async () => {
      const client = await f.creerUtilisateur();
      const emailOrigine = client.email;
      const colis = await f.creerColis(client, { statut: 'livre' });
      await f.models.Adresse.create({
        userId: client.id,
        libelle: 'Maison',
        nom: 'Destinataire Test',
        telephone: '+221770000009',
        villeId: colis.villeArriveeId,
        adresse: '12 rue du Test',
        pays: 'SN',
      });
      expect(await f.models.Adresse.count({ where: { userId: client.id } })).toBe(1);
      const entete = await f.jeton(client);

      const res = await request(app)
        .delete('/client/compte')
        .set('Authorization', entete)
        .send({ password: f.MOT_DE_PASSE, motif: 'Je n’utilise plus le service' });
      expect(res.status).toBe(200);

      await client.reload();
      expect(client.supprimeLe).not.toBeNull();
      expect(client.isActive).toBe(false);
      expect(client.email).not.toBe(emailOrigine);
      expect(client.nom).toBe('Compte');
      expect(await f.models.Adresse.count({ where: { userId: client.id } })).toBe(0);
      expect(await f.models.RefreshToken.count({ where: { userId: client.id } })).toBe(0);
      expect(await f.models.Colis.count({ where: { id: colis.id } })).toBe(1);

      // L'ancien jeton et l'ancienne adresse ne donnent plus accès
      expect((await request(app).get('/client/profil').set('Authorization', entete)).status).toBe(
        401
      );
      const connexion = await request(app)
        .post('/auth/login')
        .send({ email: emailOrigine, password: f.MOT_DE_PASSE });
      expect(connexion.status).toBe(401);
    });
  });

  describe('Demande publique de suppression (Google Play)', () => {
    test('enregistrée sans compte ni jeton ; même réponse que le compte existe ou non', async () => {
      const client = await f.creerUtilisateur();
      const existant = await request(app)
        .post('/suppression-compte')
        .send({ email: client.email, motif: 'Plus d’usage' });
      const inconnu = await request(app)
        .post('/suppression-compte')
        .send({ email: `inconnu-${f.suffixe()}@exemple.com` });
      expect(existant.status).toBe(201);
      expect(inconnu.status).toBe(201);
      expect(existant.body.message).toBe(inconnu.body.message);
      expect(await f.models.DemandeSuppression.count({ where: { email: client.email } })).toBe(1);
    });

    test('email invalide → 400', async () => {
      const res = await request(app).post('/suppression-compte').send({ email: 'pas-un-email' });
      expect(res.status).toBe(400);
    });

    test('traitement admin : le compte est pseudonymisé, un second traitement est refusé', async () => {
      const client = await f.creerUtilisateur();
      const depot = await request(app).post('/suppression-compte').send({ email: client.email });
      expect(depot.status).toBe(201);
      const demande = await f.models.DemandeSuppression.findOne({ where: { email: client.email } });

      const res = await request(app)
        .patch(`/admin/suppressions-compte/${demande.id}`)
        .set('Authorization', jetonAdmin)
        .send({ statut: 'traitee', noteAdmin: 'Identité vérifiée par téléphone' });
      expect(res.status).toBe(200);
      expect(res.body.data.compteSupprime).toBe(true);
      await client.reload();
      expect(client.supprimeLe).not.toBeNull();

      const encore = await request(app)
        .patch(`/admin/suppressions-compte/${demande.id}`)
        .set('Authorization', jetonAdmin)
        .send({ statut: 'rejetee' });
      expect(encore.status).toBe(409);
    });

    test('un client ne peut pas lister les demandes → 403', async () => {
      const client = await f.creerUtilisateur();
      const res = await request(app)
        .get('/admin/suppressions-compte')
        .set('Authorization', await f.jeton(client));
      expect(res.status).toBe(403);
    });
  });
});
