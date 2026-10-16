/**
 * Remise confirmée par le destinataire dans son application : l'agent affiche un
 * code à usage unique, le destinataire titulaire d'un compte le saisit.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Remise confirmée dans l’application du destinataire (base réelle)', () => {
  let app;
  let point;
  let agent;
  let expediteur;

  beforeAll(async () => {
    app = require('../../src/app');
    point = await f.creerPoint();
    agent = await f.creerUtilisateur({ role: 'agent_point', pointCollecteId: point.id });
    expediteur = await f.creerUtilisateur();
  });
  afterAll(fermerBase);

  const colisDisponible = (destinataire, champs = {}) =>
    f.creerColis(expediteur, {
      statut: 'disponible_retrait',
      pointActuelId: point.id,
      codeRetrait: '4321',
      destinataireTelephone: destinataire?.telephone || '+221771234567',
      ...champs,
    });

  const afficherCode = async (colis) =>
    request(app)
      .post(`/admin/colis/${colis.id}/code-remise`)
      .set('Authorization', await f.jeton(agent));

  const confirmer = async (destinataire, colis, code) =>
    request(app)
      .post(`/client/colis/recus/${colis.id}/confirmer-remise`)
      .set('Authorization', await f.jeton(destinataire))
      .send({ code });

  test('code affiché par l’agent, saisi par le destinataire → colis récupéré, avis possible', async () => {
    const destinataire = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire);

    const detail = await request(app)
      .get(`/admin/colis/${colis.id}`)
      .set('Authorization', await f.jeton(agent));
    expect(detail.body.data.colis.destinataireACompte).toBe(true);

    const affiche = await afficherCode(colis);
    expect(affiche.status).toBe(200);
    const { code } = affiche.body.data;
    expect(code).toMatch(/^\d{6}$/);
    // Ni le code ni son empreinte ne sortent par les lectures du colis
    const relu = await request(app)
      .get(`/admin/colis/${colis.id}`)
      .set('Authorization', await f.jeton(agent));
    expect(JSON.stringify(relu.body)).not.toMatch(/codeRemise/);

    const res = await confirmer(destinataire, colis, code);
    expect(res.status).toBe(200);
    await colis.reload();
    expect(colis.statut).toBe('recupere');
    expect(colis.codeRemiseEmpreinte).toBeNull();
    const evenement = await f.models.SuiviColis.findOne({
      where: { colisId: colis.id, codeEvenement: 'RETIRE' },
    });
    expect(evenement.createdBy).toBe(agent.id);

    // Usage unique
    expect((await confirmer(destinataire, colis, code)).status).toBe(400);

    const aEvaluer = await request(app)
      .get('/client/avis/a-evaluer')
      .set('Authorization', await f.jeton(destinataire));
    expect(aEvaluer.body.data.colis.map((c) => c.id)).toContain(colis.id);
  });

  test('destinataire avec compte, sans l’application : remise au code de retrait, tracée', async () => {
    const destinataire = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire);
    const jetonAgent = await f.jeton(agent);
    const evenement = (codeRetrait) =>
      request(app)
        .post(`/admin/colis/${colis.id}/evenements`)
        .set('Authorization', jetonAgent)
        .send({ codeEvenement: 'RETIRE', codeRetrait });

    // Le code affiché avant la remise de secours ne doit plus servir ensuite
    const { code } = (await afficherCode(colis)).body.data;
    expect((await evenement('0000')).status).toBe(400);
    expect((await evenement('4321')).status).toBe(200);
    await colis.reload();
    expect(colis.statut).toBe('recupere');
    const trace = await f.models.ActivityLog.findOne({
      where: { entiteId: colis.id, action: 'colis.remise.sans_application' },
    });
    expect(trace).not.toBeNull();

    const tardif = await confirmer(destinataire, colis, code);
    expect(tardif.status).toBe(400);
    expect(tardif.body.message).toMatch(/plus en attente de remise/);
  });

  test('destinataire avec compte, livraison sans code de retrait : le coursier passe par l’application', async () => {
    const destinataire = await f.creerUtilisateur();
    const coursier = await f.creerUtilisateur({ role: 'coursier' });
    const colis = await f.creerColis(expediteur, {
      statut: 'en_livraison',
      coursierLivraisonId: coursier.id,
      destinataireTelephone: destinataire.telephone,
    });
    const res = await request(app)
      .post(`/admin/colis/${colis.id}/evenements`)
      .set('Authorization', await f.jeton(coursier))
      .send({ codeEvenement: 'LIVRE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/administrateur/);
  });

  test('facture impayée : signalée dans le détail, le code reste utilisable après encaissement', async () => {
    const destinataire = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire);
    const { code } = (await afficherCode(colis)).body.data;
    // Facture créée après l'affichage du code : la confirmation est refusée sans consommer le code
    const facture = await f.creerFacture(colis, {
      montantTotal: 5000,
      montantPaye: 0,
      statut: 'en_attente',
    });
    const detail = await request(app)
      .get(`/admin/colis/${colis.id}`)
      .set('Authorization', await f.jeton(agent));
    expect(detail.body.data.colis.reglementAvantRemise).toBe(true);

    expect((await confirmer(destinataire, colis, code)).status).toBe(400);
    await facture.update({ montantPaye: 5000, statut: 'payee' });
    expect((await confirmer(destinataire, colis, code)).status).toBe(200);
  });

  test('« Colis reçus » indique les avis déjà donnés', async () => {
    const destinataire = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire, { statut: 'recupere' });
    const liste = async () =>
      (
        await request(app)
          .get('/client/colis/recus')
          .set('Authorization', await f.jeton(destinataire))
      ).body.data.colis.find((c) => c.id === colis.id);
    expect((await liste()).avisDonne).toBe(false);
    await f.models.Avis.create({ userId: destinataire.id, colisId: colis.id, note: 5 });
    expect((await liste()).avisDonne).toBe(true);
  });

  test('destinataire sans compte : pas de code de remise, le code de retrait reste la règle', async () => {
    const colis = await colisDisponible(null);
    expect((await afficherCode(colis)).status).toBe(400);
    const res = await request(app)
      .post(`/admin/colis/${colis.id}/evenements`)
      .set('Authorization', await f.jeton(agent))
      .send({ codeEvenement: 'RETIRE', codeRetrait: '4321' });
    expect(res.status).toBe(200);
  });

  test('un autre client ne peut pas confirmer ; cinq erreurs annulent le code', async () => {
    const destinataire = await f.creerUtilisateur();
    const intrus = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire);
    const { code } = (await afficherCode(colis)).body.data;

    expect((await confirmer(intrus, colis, code)).status).toBe(404);

    const faux = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      expect((await confirmer(destinataire, colis, faux)).status).toBe(400);
    }
    // Le bon code ne marche plus : il faut en afficher un nouveau
    expect((await confirmer(destinataire, colis, code)).status).toBe(400);
    await colis.reload();
    expect(colis.statut).toBe('disponible_retrait');
  });

  test('code expiré → 400, rien ne change', async () => {
    const destinataire = await f.creerUtilisateur();
    const colis = await colisDisponible(destinataire);
    const { code } = (await afficherCode(colis)).body.data;
    await colis.update({ codeRemiseExpireLe: new Date(Date.now() - 1000) });
    expect((await confirmer(destinataire, colis, code)).status).toBe(400);
    await colis.reload();
    expect(colis.statut).toBe('disponible_retrait');
  });
});
