/**
 * Ouvrir une notification la marque comme lue, avec les autres notifications
 * non lues du même objet (même colis, même facture…).
 */
const { randomUUID } = require('crypto');
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Notifications lues (base réelle)', () => {
  let app;

  beforeAll(() => {
    app = require('../../src/app');
  });
  afterAll(fermerBase);

  const notif = (userId, champs = {}) =>
    f.models.Notification.create({
      userId,
      titre: 'Suivi',
      message: 'Votre colis avance',
      type: 'colis',
      ...champs,
    });

  test('les autres notifications du même objet passent en lues, pas celles des autres objets', async () => {
    const client = await f.creerUtilisateur();
    const autre = await f.creerUtilisateur();
    const colisA = randomUUID();
    const colisB = randomUUID();
    const ouverte = await notif(client.id, { entite: 'Colis', entiteId: colisA });
    const memeColis = await notif(client.id, { entite: 'Colis', entiteId: colisA });
    const autreColis = await notif(client.id, { entite: 'Colis', entiteId: colisB });
    const sansObjet = await notif(client.id);
    const autreCompte = await notif(autre.id, { entite: 'Colis', entiteId: colisA });

    const res = await request(app)
      .patch(`/client/notifications/${ouverte.id}/lue`)
      .set('Authorization', await f.jeton(client))
      .expect(200);
    expect(res.body.data.lues.sort()).toEqual([ouverte.id, memeColis.id].sort());
    expect(res.body.data.nonLues).toBe(2);

    const lue = async (n) => (await f.models.Notification.findByPk(n.id)).isRead;
    expect(await lue(memeColis)).toBe(true);
    expect(await lue(autreColis)).toBe(false);
    expect(await lue(sansObjet)).toBe(false);
    expect(await lue(autreCompte)).toBe(false);
  });

  test('une notification sans objet ne marque qu’elle-même', async () => {
    const client = await f.creerUtilisateur();
    const seule = await notif(client.id);
    const voisine = await notif(client.id);
    const res = await request(app)
      .patch(`/client/notifications/${seule.id}/lue`)
      .set('Authorization', await f.jeton(client))
      .expect(200);
    expect(res.body.data.lues).toEqual([seule.id]);
    expect((await f.models.Notification.findByPk(voisine.id)).isRead).toBe(false);
  });
});
