/**
 * Alertes de suivi d'une expédition : la destination doit correspondre au canal
 * (adresse email pour « email », numéro France / Sénégal pour « sms »).
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Abonnement aux alertes de suivi (base réelle)', () => {
  let app;
  let entete;
  let colis;

  beforeAll(async () => {
    app = require('../../src/app');
    const client = await f.creerUtilisateur();
    entete = await f.jeton(client);
    colis = await f.creerColis(client);
  });

  afterAll(fermerBase);

  const abonner = (corps) =>
    request(app)
      .post(`/api/v1/client/colis/${colis.id}/abonnement-suivi`)
      .set('Authorization', entete)
      .send(corps);

  test.each([
    [{ canal: 'email', destination: 'pas-un-email' }],
    [{ canal: 'sms', destination: '12345' }],
    [{ canal: 'sms', destination: 'awa@exemple.com' }],
  ])('destination incompatible avec le canal → 400 %j', async (corps) => {
    const res = await abonner(corps);
    expect(res.status).toBe(400);
  });

  test('email valide : enregistré en minuscules', async () => {
    const res = await abonner({ canal: 'email', destination: ' Awa@Exemple.com ' });
    expect(res.status).toBe(200);
    expect(res.body.data.abonnement.destination).toBe('awa@exemple.com');
  });

  test('numéro sénégalais : enregistré au format international', async () => {
    const res = await abonner({ canal: 'sms', destination: '+221 77 111 22 33' });
    expect(res.status).toBe(200);
    expect(res.body.data.abonnement.destination).toBe('+221771112233');
  });
});
