/**
 * Recherche dans le carnet d'adresses (GET /client/adresses?search=…), utilisée
 * par l'assistant d'expédition pour retrouver un destinataire : nom, libellé,
 * entreprise ou téléphone, sans que le filtre de type soit perdu.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb("Carnet d'adresses — recherche (base réelle)", () => {
  let app;
  let jeton;
  let jetonAutre;

  const creer = async (j, champs) => {
    const res = await request(app).post('/client/adresses').set('Authorization', j).send(champs);
    expect(res.status).toBe(201);
  };
  const chercher = async (requete, j = jeton) => {
    const res = await request(app).get(`/client/adresses?${requete}`).set('Authorization', j);
    expect(res.status).toBe(200);
    return res.body.data.adresses.map((a) => a.nom).sort();
  };

  beforeAll(async () => {
    app = require('../../src/app');
    const client = await f.creerUtilisateur();
    const autre = await f.creerUtilisateur();
    jeton = await f.jeton(client);
    jetonAutre = await f.jeton(autre);
    const dakar = await f.creerVille({ pays: 'SN' });
    const paris = await f.creerVille({ pays: 'FR' });
    const base = { adresse: '12 rue du Test' };
    await creer(jeton, {
      ...base,
      libelle: 'Maman',
      type: 'destinataire',
      nom: 'Awa Séye',
      telephone: '+221771234567',
      pays: 'SN',
      villeId: dakar.id,
    });
    await creer(jeton, {
      ...base,
      libelle: 'Bureau',
      type: 'les_deux',
      nom: 'Moussa Diop',
      entreprise: 'Sonatel',
      telephone: '+221781112233',
      pays: 'SN',
      villeId: dakar.id,
    });
    await creer(jeton, {
      ...base,
      libelle: 'Moi',
      type: 'expediteur',
      nom: 'Awa Expéditrice',
      telephone: '+33612345678',
      pays: 'FR',
      villeId: paris.id,
    });
    await creer(jetonAutre, {
      ...base,
      libelle: 'Autre',
      type: 'destinataire',
      nom: 'Awa Inconnue',
      telephone: '+221770000000',
      pays: 'SN',
      villeId: dakar.id,
    });
  });
  afterAll(fermerBase);

  test('par nom, sans tenir compte de la casse', async () => {
    expect(await chercher('search=awa')).toEqual(['Awa Expéditrice', 'Awa Séye']);
  });

  test('le filtre de type est conservé avec la recherche', async () => {
    expect(await chercher('type=destinataire&search=awa')).toEqual(['Awa Séye']);
  });

  test('par entreprise et par libellé', async () => {
    expect(await chercher('search=sonatel')).toEqual(['Moussa Diop']);
    expect(await chercher('search=maman')).toEqual(['Awa Séye']);
  });

  test('par téléphone, avec espaces, sans indicatif ou avec le 0 national', async () => {
    expect(await chercher('search=77%20123%2045')).toEqual(['Awa Séye']);
    expect(await chercher('search=%2B221%2078%20111')).toEqual(['Moussa Diop']);
    expect(await chercher('search=06%2012%2034')).toEqual(['Awa Expéditrice']);
  });

  test('filtre pays combiné', async () => {
    expect(await chercher('pays=SN&search=awa')).toEqual(['Awa Séye']);
  });

  test('les jokers de LIKE sont pris littéralement', async () => {
    expect(await chercher('search=%25')).toEqual([]);
    expect(await chercher('search=_')).toEqual([]);
  });

  test('seul le carnet du titulaire est consulté', async () => {
    expect(await chercher('search=inconnue')).toEqual([]);
    expect(await chercher('search=inconnue', jetonAutre)).toEqual(['Awa Inconnue']);
  });
});
