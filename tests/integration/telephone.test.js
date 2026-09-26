/**
 * Preuve de possession du numéro de téléphone et accès aux colis reçus.
 * L'envoi WhatsApp est simulé : seul l'appel sortant vers Meta est remplacé.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Vérification du téléphone (base réelle)', () => {
  let app;
  let whatsapp;
  let parametreService;

  beforeAll(() => {
    app = require('../../src/app');
    whatsapp = require('../../src/infrastructure/whatsapp');
    parametreService = require('../../src/modules/parametre/service/parametre.service');
  });
  afterAll(fermerBase);

  const exigerVerification = async (valeur) => {
    await f.models.ParametreSysteme.upsert({
      cle: 'verification_telephone_obligatoire',
      valeur: String(valeur),
      type: 'booleen',
      categorie: 'comptes',
      libelle: 'test',
    });
    parametreService.invaliderCache();
  };

  /** Simule WhatsApp et renvoie le dernier code envoyé. */
  const simulerWhatsapp = () => {
    const envois = [];
    jest.spyOn(whatsapp, 'estConfigure').mockReturnValue(true);
    jest.spyOn(whatsapp, 'envoyerWhatsapp').mockImplementation(async (msg) => {
      envois.push(msg);
      return true;
    });
    return () => envois.at(-1)?.message.match(/(\d{6})/)[1];
  };

  afterEach(() => jest.restoreAllMocks());

  test('canal WhatsApp non configuré → 503 explicite', async () => {
    const client = await f.creerUtilisateur();
    const res = await request(app)
      .post('/client/profil/telephone/code')
      .set('Authorization', await f.jeton(client));
    expect(res.status).toBe(503);
  });

  test('code reçu puis vérifié → numéro prouvé', async () => {
    const dernierCode = simulerWhatsapp();
    const client = await f.creerUtilisateur();
    const entete = await f.jeton(client);

    await request(app)
      .post('/client/profil/telephone/code')
      .set('Authorization', entete)
      .expect(200);
    expect(whatsapp.envoyerWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ telephone: client.telephone })
    );
    const res = await request(app)
      .post('/client/profil/telephone/verifier')
      .set('Authorization', entete)
      .send({ code: dernierCode() });
    expect(res.status).toBe(200);
    await client.reload();
    expect(client.telephoneVerifie).toBe(true);
  });

  test('5 codes faux : le bon code est ensuite refusé', async () => {
    const dernierCode = simulerWhatsapp();
    const client = await f.creerUtilisateur();
    const entete = await f.jeton(client);
    await request(app)
      .post('/client/profil/telephone/code')
      .set('Authorization', entete)
      .expect(200);
    const bon = dernierCode();
    const faux = bon === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/client/profil/telephone/verifier')
        .set('Authorization', entete)
        .send({ code: faux })
        .expect(400);
    }
    await request(app)
      .post('/client/profil/telephone/verifier')
      .set('Authorization', entete)
      .send({ code: bon })
      .expect(400);
    await client.reload();
    expect(client.telephoneVerifie).toBe(false);
  });

  test('changer de numéro retire la vérification', async () => {
    const client = await f.creerUtilisateur({ telephoneVerifie: true });
    await request(app)
      .put('/client/profil')
      .set('Authorization', await f.jeton(client))
      .send({ telephone: '+221781112299' })
      .expect(200);
    await client.reload();
    expect(client.telephoneVerifie).toBe(false);
  });

  describe('Colis reçus quand la vérification est exigée', () => {
    afterAll(() => exigerVerification(false));

    test('numéro non vérifié → 403 ; vérifié → 200', async () => {
      await exigerVerification(true);
      const expediteur = await f.creerUtilisateur();
      const nonVerifie = await f.creerUtilisateur();
      const verifie = await f.creerUtilisateur({ telephoneVerifie: true });
      await f.creerColis(expediteur, { destinataireTelephone: verifie.telephone });

      const refuse = await request(app)
        .get('/client/colis/recus')
        .set('Authorization', await f.jeton(nonVerifie));
      expect(refuse.status).toBe(403);

      const accepte = await request(app)
        .get('/client/colis/recus')
        .set('Authorization', await f.jeton(verifie));
      expect(accepte.status).toBe(200);
      expect(accepte.body.data.colis).toHaveLength(1);
    });
  });
});
