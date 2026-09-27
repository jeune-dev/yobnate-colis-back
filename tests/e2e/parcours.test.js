/**
 * Parcours complets contre une vraie base PostgreSQL : comptes, catégories 1, 2 et 3,
 * conteneur, inventaire, tournées, et tâches automatiques.
 *
 * La base indiquée est ENTIÈREMENT VIDÉE puis reconstruite : n'utiliser qu'une base
 * dédiée aux tests. Exécution :
 *   E2E_DATABASE_URL=postgres://user:mdp@localhost:5432/yobnate_e2e npx jest tests/e2e
 * Sans E2E_DATABASE_URL, la suite est ignorée.
 */
const URL_BASE = process.env.E2E_DATABASE_URL;
const decrire = URL_BASE ? describe : describe.skip;

process.env.DATABASE_URL = URL_BASE || 'postgres://ignore:ignore@localhost:1/ignore';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(40);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'r'.repeat(40);
process.env.SMTP_HOST = 'smtp.test.local';
process.env.SMTP_USER = 'test';
process.env.APP_PUBLIC_URL = 'https://app.test';

// Services externes interceptés : mockEmails capturés, téléversements simulés
const mockEmails = [];
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: async (m) => mockEmails.push(m) }),
}));
jest.mock('../../src/infrastructure/uploadService', () => {
  let n = 0;
  return {
    uploadToCloudinary: async () => ({ url: `https://test/f${++n}.jpg`, publicId: `f${n}` }),
    deleteFromCloudinary: async () => {},
  };
});

const request = require('supertest');
const bcrypt = require('bcrypt');

jest.setTimeout(60000);

decrire('Parcours complets (base réelle)', () => {
  let app;
  let m;
  let taches;
  const donnees = {};
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);
  const auth = (jeton) => ({ Authorization: `Bearer ${jeton}` });
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const dernierEmail = (to, motif) =>
    [...mockEmails].reverse().find((e) => e.to === to && (!motif || motif.test(e.subject)));

  const declarer = (jeton, champs, nbPhotos) => {
    let req = request(app).post('/client/colis').set(auth(jeton));
    for (const [k, v] of Object.entries(champs)) {
      req = req.field(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    for (let i = 0; i < nbPhotos; i += 1) {
      req = req.attach('photos', JPEG, { filename: `p${i}.jpg`, contentType: 'image/jpeg' });
    }
    return req;
  };

  const inscrire = async (champs) => {
    const r = await request(app).post('/auth/register').send(champs);
    expect(r.status).toBe(201);
    await attendre(30);
    const jeton = dernierEmail(champs.email, /Confirmez/)?.html.match(
      /(?:token=|verify-email\/)([a-f0-9]{64})/
    )?.[1];
    expect(jeton).toBeDefined();
    return jeton;
  };

  beforeAll(async () => {
    m = require('../../src/models');
    await m.sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    // Extensions créées par la migration initiale (index trigrammes de recherche)
    await m.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm;'
    );
    await m.sequelize.sync();
    await require('../../src/modules/parametre/service/parametre.service').initialiser();
    app = require('../../src/app');
    taches = require('../../src/jobs/taches');

    // Référentiel minimal : villes, service maritime, point de dépôt, grille, admin
    const [paris, dakar, thies] = await m.Ville.bulkCreate([
      { nom: 'Paris', pays: 'FR' },
      { nom: 'Dakar', pays: 'SN', zoneTarifDakar: true },
      { nom: 'Thiès', pays: 'SN' },
    ]);
    const std = await m.ServiceExpedition.create({
      code: 'STD',
      nom: 'Standard',
      modeTransport: 'maritime',
      delaiMinJours: 15,
      delaiMaxJours: 30,
      coefficientVolumetrique: 5000,
      poidsMinKg: 0.5,
      poidsMaxKg: 100,
      isActive: true,
    });
    const point = await m.PointCollecte.create({
      code: 'FR-PAR-01',
      nom: 'Agence Paris',
      type: 'agence',
      pays: 'FR',
      villeId: paris.id,
      adresse: '10 rue de la Paix',
      telephone: '+33100000002',
      services: ['depot', 'retrait', 'paiement'],
      visiblePublic: true,
      isActive: true,
    });
    const articles = await m.ArticleTarif.bulkCreate([
      {
        code: 'DOC',
        libelle: 'Enveloppe',
        categorie: 'documents',
        prixDakar: 25,
        prixAutresRegions: 30,
        poidsMaxKg: 0.5,
      },
      {
        code: 'VALISE-23',
        libelle: 'Valise 23 kg',
        categorie: 'colis_moyen',
        prixDakar: 40,
        prixAutresRegions: 50,
        poidsMaxKg: 23,
      },
    ]);
    await m.User.create({
      nom: 'Admin',
      prenom: 'Test',
      email: 'admin@test.fr',
      password: await bcrypt.hash('Admin_Test_1234!', 4),
      telephone: '+221770000001',
      role: 'super_admin',
      emailVerifie: true,
    });
    Object.assign(donnees, { paris, dakar, thies, std, point, valise: articles[1] });

    const r = await request(app)
      .post('/auth/login')
      .send({ identifiant: 'admin@test.fr', password: 'Admin_Test_1234!' });
    donnees.admin = r.body.data.accessToken;
  });

  afterAll(async () => {
    if (m) await m.sequelize.close();
  });

  test('simulation sans compte : forfait Dakar et autres régions', async () => {
    const devis = (villeArriveeId) =>
      request(app)
        .post('/public/devis')
        .send({
          villeDepartId: donnees.paris.id,
          villeArriveeId,
          categorie: 'colis_moyen',
          articles: [{ articleTarifId: donnees.valise.id }],
        });
    expect((await devis(donnees.dakar.id)).body.data.devis.offres[0].montants.total).toBe(40);
    expect((await devis(donnees.thies.id)).body.data.devis.offres[0].montants.total).toBe(50);
  });

  test('comptes : confirmation d’email obligatoire, connexion par téléphone, parrainage', async () => {
    const jetonA = await inscrire({
      nom: 'Ndiaye',
      prenom: 'Papa',
      email: 'parrain@test.fr',
      telephone: '+33612340001',
      password: 'Motdepasse1!',
      pays: 'FR',
    });
    let r = await request(app)
      .post('/auth/login')
      .send({ identifiant: 'parrain@test.fr', password: 'Motdepasse1!' });
    expect(r.status).toBe(403);
    await request(app).post('/auth/verify-email').send({ token: jetonA }).expect(200);
    r = await request(app)
      .post('/auth/login')
      .send({ identifiant: '+33612340001', password: 'Motdepasse1!' });
    expect(r.status).toBe(200);
    donnees.parrain = r.body.data.accessToken;
    const code = (await request(app).get('/client/profil/parrainage').set(auth(donnees.parrain)))
      .body.data.parrainage.code;

    const jetonB = await inscrire({
      nom: 'Diop',
      prenom: 'Awa',
      email: 'filleul@test.fr',
      telephone: '+33612340002',
      password: 'Motdepasse1!',
      pays: 'FR',
      codeParrainage: code,
    });
    await request(app).post('/auth/verify-email').send({ token: jetonB }).expect(200);
    r = await request(app)
      .post('/auth/login')
      .send({ identifiant: 'filleul@test.fr', password: 'Motdepasse1!' });
    donnees.filleul = r.body.data.accessToken;
  });

  const base = () => ({
    serviceId: donnees.std.id,
    expediteurNom: 'Awa Diop',
    expediteurTelephone: '+33612340002',
    villeDepartId: donnees.paris.id,
    destinataireNom: 'Moussa Fall',
    destinataireTelephone: '+221771234567',
    villeArriveeId: donnees.dakar.id,
    modeLivraison: 'livraison_domicile',
    adresseLivraison: 'Rue 10, Médina',
    conditionsAcceptees: true,
  });
  const adresseSn = {
    destinataireQuartier: 'Médina',
    destinataireArrondissement: 'Dakar Plateau',
    destinataireDepartement: 'Dakar',
    destinatairePointRepere: 'Face à la mosquée',
  };

  test('catégorie 1 : facture immédiate, remise filleul, crédit du parrain repris à l’annulation', async () => {
    const r = await declarer(
      donnees.filleul,
      { ...base(), categorie: 'documents', typeDocument: 'Acte', modeDepot: 'envoi_postal' },
      1
    );
    expect(r.status).toBe(201);
    expect(r.body.data.colis.reference).toMatch(/^PNCO\d{10}ADI01$/);
    expect(Number(r.body.data.colis.montantTotal)).toBe(22.5);
    expect(r.body.data.facture).toBeTruthy();

    const parrain = await m.User.findOne({ where: { email: 'parrain@test.fr' } });
    expect(Number(parrain.creditParrainage)).toBe(5);

    await request(app)
      .patch(`/client/colis/${r.body.data.colis.id}/annuler`)
      .set(auth(donnees.filleul))
      .send({})
      .expect(200);
    await parrain.reload();
    expect(Number(parrain.creditParrainage)).toBe(0);
  });

  test('catégorie 2 : adresse sénégalaise bloquante, validation, facture à la réception, conteneur et inventaire', async () => {
    const champs = {
      ...base(),
      categorie: 'colis_moyen',
      etatMarchandise: 'neuf',
      valeurDeclaree: 300,
      articles: [{ articleTarifId: donnees.valise.id }],
      articlesDouane: [
        { designation: 'Chaussures', quantite: 4, valeurUnitaire: 50, etat: 'neuf' },
      ],
      modeDepot: 'point_collecte',
      pointCollecteDepartId: donnees.point.id,
    };
    expect((await declarer(donnees.filleul, champs, 3)).status).toBe(400);
    const r = await declarer(donnees.filleul, { ...champs, ...adresseSn }, 3);
    expect(r.status).toBe(201);
    const id = r.body.data.colis.id;
    expect(r.body.data.colis.statut).toBe('en_attente_validation');

    await request(app)
      .post(`/admin/colis/${id}/valider`)
      .set(auth(donnees.admin))
      .send({})
      .expect(200);
    await request(app)
      .post(`/admin/colis/${id}/evenements`)
      .set(auth(donnees.admin))
      .send({ codeEvenement: 'RECEPTION', pointCollecteId: donnees.point.id })
      .expect(200);
    await attendre(200);
    expect(await m.Facture.findOne({ where: { colisId: id } })).toBeTruthy();

    const recus = await request(app).get('/client/colis/recus').set(auth(donnees.filleul));
    expect(recus.status).toBe(200);

    const rot = await request(app).post('/admin/conteneurs').set(auth(donnees.admin)).send({
      modeTransport: 'maritime',
      paysDepart: 'FR',
      paysArrivee: 'SN',
      dateDepartPrevue: '2026-10-10T08:00:00Z',
      dateArriveePrevue: '2026-11-01T08:00:00Z',
    });
    const rotationId = rot.body.data.rotation.id;
    await request(app)
      .post(`/admin/conteneurs/${rotationId}/colis`)
      .set(auth(donnees.admin))
      .send({ colisIds: [id] })
      .expect(200);
    const inv = await request(app)
      .get(`/admin/inventaire?rotationId=${rotationId}`)
      .set(auth(donnees.admin));
    expect(inv.body.data.inventaire.synthese).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ produit: 'Chaussures', quantite: 4, etat: 'neuf' }),
      ])
    );
  });

  test('catégorie 3 : proposition acceptée, et proposition expirée clôturée par la tâche automatique', async () => {
    const champs = {
      ...base(),
      ...adresseSn,
      categorie: 'colis_xxl',
      description: 'Réfrigérateur',
      pieces: [{ poidsKg: 90, longueurCm: 180, largeurCm: 80, hauteurCm: 70 }],
      modeDepot: 'point_collecte',
      pointCollecteDepartId: donnees.point.id,
    };
    const accepte = (await declarer(donnees.parrain, champs, 1)).body.data.colis;
    await request(app)
      .post(`/admin/colis/${accepte.id}/proposition`)
      .set(auth(donnees.admin))
      .send({ montantTotal: 180 })
      .expect(200);
    const r = await request(app)
      .post(`/client/colis/${accepte.id}/proposition/accepter`)
      .set(auth(donnees.parrain));
    expect(Number(r.body.data.facture.montantTotal)).toBe(180);

    const expire = (await declarer(donnees.parrain, champs, 1)).body.data.colis;
    await request(app)
      .post(`/admin/colis/${expire.id}/proposition`)
      .set(auth(donnees.admin))
      .send({ montantTotal: 150 })
      .expect(200);
    await m.Colis.update(
      { propositionExpireAt: new Date(Date.now() - 1000) },
      { where: { id: expire.id } }
    );
    expect(await taches.expirerPropositions()).toBe(1);
    expect((await m.Colis.findByPk(expire.id)).statut).toBe('refuse');
  });

  test('tâches automatiques : études en retard, tournées passées, relances', async () => {
    const champs = {
      ...base(),
      ...adresseSn,
      categorie: 'colis_moyen',
      etatMarchandise: 'neuf',
      valeurDeclaree: 100,
      articles: [{ articleTarifId: donnees.valise.id }],
      modeDepot: 'point_collecte',
      pointCollecteDepartId: donnees.point.id,
    };
    const c = (await declarer(donnees.parrain, champs, 3)).body.data.colis;
    await m.Colis.update(
      { dateLimiteEtude: new Date(Date.now() - 60 * 1000) },
      { where: { id: c.id } }
    );
    expect(await taches.alerterEtudesEnRetard()).toBe(1);

    await m.TourneeCollecte.create({
      reference: 'TRN-TEST-1',
      titre: 'Passée',
      pays: 'FR',
      dateCollecte: '2020-01-01',
      statut: 'ouverte',
    });
    expect(await taches.cloturerTourneesPassees()).toBe(1);

    const facture = await m.Facture.findOne({ where: { statut: 'en_attente' } });
    await facture.update({
      dateLimitePaiement: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    });
    expect(await taches.relancerFacturesEchues()).toBeGreaterThanOrEqual(1);
  });

  /* ── Concurrence : requêtes simultanées contre PostgreSQL ─────────────── */

  test('concurrence : connexions simultanées du même compte (jetons distincts)', async () => {
    const connexions = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app)
          .post('/auth/login')
          .send({ identifiant: 'admin@test.fr', password: 'Admin_Test_1234!' })
      )
    );
    expect(connexions.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const refresh = connexions.map((r) => r.body.data.refreshToken);
    expect(new Set(refresh).size).toBe(4);

    // Un même refresh token rafraîchi deux fois en même temps : une seule réussite
    const doubles = await Promise.all(
      [0, 1, 2].map(() =>
        request(app).post('/auth/refresh-token').send({ refreshToken: refresh[0] })
      )
    );
    expect(doubles.filter((r) => r.status === 200)).toHaveLength(1);
    expect(doubles.filter((r) => r.status === 401)).toHaveLength(2);
  });

  test('concurrence : scans simultanés du même colis, stock du point compté une fois', async () => {
    const champs = {
      ...base(),
      ...adresseSn,
      categorie: 'colis_moyen',
      etatMarchandise: 'neuf',
      valeurDeclaree: 100,
      articles: [{ articleTarifId: donnees.valise.id }],
      modeDepot: 'point_collecte',
      pointCollecteDepartId: donnees.point.id,
    };
    const colis = (await declarer(donnees.parrain, champs, 3)).body.data.colis;
    await request(app)
      .post(`/admin/colis/${colis.id}/valider`)
      .set(auth(donnees.admin))
      .send({})
      .expect(200);
    const hub = await m.PointCollecte.create({
      code: 'FR-HUB-CC',
      nom: 'Hub concurrence',
      type: 'agence',
      pays: 'FR',
      villeId: donnees.paris.id,
      adresse: '1 rue du Test',
      telephone: '+33100000009',
      services: ['depot'],
    });

    const scans = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/admin/colis/${colis.id}/evenements`)
          .set(auth(donnees.admin))
          .send({ codeEvenement: 'RECEPTION', pointCollecteId: hub.id })
      )
    );
    expect(scans.every((r) => r.status === 200)).toBe(true);
    await hub.reload();
    expect(hub.colisEnStock).toBe(1);
    expect((await m.Colis.findByPk(colis.id)).statut).toBe('receptionne');
    donnees.colisConcurrence = colis.id;
  });

  test('concurrence : un colis chargé simultanément sur deux conteneurs ne l’est qu’une fois', async () => {
    const creer = () =>
      request(app).post('/admin/conteneurs').set(auth(donnees.admin)).send({
        modeTransport: 'maritime',
        paysDepart: 'FR',
        paysArrivee: 'SN',
        dateDepartPrevue: '2026-12-10T08:00:00Z',
        dateArriveePrevue: '2027-01-05T08:00:00Z',
      });
    const [a, b] = (await Promise.all([creer(), creer()])).map((r) => r.body.data.rotation.id);
    const charges = await Promise.all(
      [a, b].map((rotationId) =>
        request(app)
          .post(`/admin/conteneurs/${rotationId}/colis`)
          .set(auth(donnees.admin))
          .send({ colisIds: [donnees.colisConcurrence] })
      )
    );
    expect(charges.map((r) => r.status)).toEqual([200, 200]);
    const rotations = await m.Rotation.findAll({ where: { id: [a, b] } });
    expect(rotations.reduce((n, r) => n + r.nbColisCharges, 0)).toBe(1);
    const colis = await m.Colis.findByPk(donnees.colisConcurrence);
    expect([a, b]).toContain(colis.rotationId);
  });

  test('concurrence : une tâche planifiée ne s’exécute qu’une fois entre plusieurs processus', async () => {
    const maintenant = new Date();
    const essais = await Promise.all(
      Array.from({ length: 6 }, () => taches.reserver('test_cluster', maintenant))
    );
    expect(essais.filter(Boolean)).toHaveLength(1);
    // Créneau déjà pris : personne ne le réobtient avant la période suivante
    expect(await taches.reserver('test_cluster', new Date(Date.now() - 60 * 1000))).toBe(false);
  });

  test('taux de conversion : simulation sans compte, puis commande rattachée à cette simulation', async () => {
    const visiteurId = require('crypto').randomUUID();
    const simulation = await request(app)
      .post('/public/devis')
      .set('X-Visiteur-Id', visiteurId)
      .send({
        villeDepartId: donnees.paris.id,
        villeArriveeId: donnees.dakar.id,
        categorie: 'documents',
      });
    expect(simulation.status).toBe(200);
    const { simulationId } = simulation.body.data.devis;
    expect(simulationId).toBeDefined();
    const enregistree = await m.SimulationDevis.findByPk(simulationId);
    expect(enregistree).toMatchObject({ visiteurId, userId: null, colisId: null });

    const commande = await request(app)
      .post('/client/colis')
      .set(auth(donnees.parrain))
      .set('X-Visiteur-Id', visiteurId)
      .field('serviceId', donnees.std.id)
      .field('expediteurNom', 'Papa Ndiaye')
      .field('expediteurTelephone', '+33612340001')
      .field('villeDepartId', donnees.paris.id)
      .field('destinataireNom', 'Moussa Fall')
      .field('destinataireTelephone', '+221771234567')
      .field('villeArriveeId', donnees.dakar.id)
      .field('modeLivraison', 'livraison_domicile')
      .field('adresseLivraison', 'Rue 10, Médina')
      .field('conditionsAcceptees', 'true')
      .field('categorie', 'documents')
      .field('typeDocument', 'Acte')
      .field('modeDepot', 'envoi_postal')
      .field('simulationId', simulationId)
      .attach('photos', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(commande.status).toBe(201);

    await enregistree.reload();
    expect(enregistree.colisId).toBe(commande.body.data.colis.id);
    expect(enregistree.userId).toBeTruthy();

    const kpis = await request(app)
      .get('/admin/dashboard/conversion')
      .query({ dateDebut: '2000-01-01', dateFin: '2099-12-31' })
      .set(auth(donnees.admin));
    expect(kpis.status).toBe(200);
    const c = kpis.body.data.conversion;
    expect(c.simulationsConverties).toBeGreaterThanOrEqual(1);
    expect(c.tauxConversionSimulations).toBeCloseTo(
      (c.simulationsConverties / c.simulations) * 100,
      1
    );
  });
  test('concurrence : plus d’annulations simultanées que de connexions au pool, sans blocage', async () => {
    // Chaque annulation tient une connexion (transaction + verrou du colis) ; ses
    // notifications en réclamaient une seconde avant le COMMIT. Au-delà de la taille
    // du pool (10), toutes attendaient : 30 s de blocage puis des 503.
    const ids = [];
    for (let i = 0; i < 14; i += 1) {
      const r = await declarer(
        donnees.parrain,
        { ...base(), categorie: 'documents', typeDocument: 'Acte', modeDepot: 'envoi_postal' },
        1
      );
      expect(r.status).toBe(201);
      ids.push(r.body.data.colis.id);
    }
    const debut = Date.now();
    const reponses = await Promise.all(
      ids.map((id) =>
        request(app).patch(`/client/colis/${id}/annuler`).set(auth(donnees.parrain)).send({})
      )
    );
    expect(reponses.map((r) => r.status)).toEqual(ids.map(() => 200));
    expect(Date.now() - debut).toBeLessThan(10000);
    // Les notifications partent bien, après validation
    const notifiees = await m.Notification.count({ where: { entiteId: ids } });
    expect(notifiees).toBeGreaterThanOrEqual(ids.length);
  });

  test('une transaction annulée n’annonce rien au client (notification après validation)', async () => {
    const suivi = require('../../src/modules/colis/service/suivi.service');
    const id = donnees.colisConcurrence;
    const compter = () =>
      m.Notification.count({
        where: { entiteId: id, titre: { [require('sequelize').Op.like]: '%Information%' } },
      });
    const avant = await compter();
    await expect(
      m.sequelize.transaction(async (t) => {
        const colis = await m.Colis.findByPk(id, { transaction: t });
        await suivi.enregistrerEvenement(
          colis,
          { codeEvenement: 'INFO', commentaire: 'x' },
          { transaction: t }
        );
        throw new Error('annulée');
      })
    ).rejects.toThrow('annulée');
    expect(await compter()).toBe(avant);

    await m.sequelize.transaction(async (t) => {
      const colis = await m.Colis.findByPk(id, { transaction: t });
      await suivi.enregistrerEvenement(
        colis,
        { codeEvenement: 'INFO', commentaire: 'x' },
        { transaction: t }
      );
    });
    expect(await compter()).toBe(avant + 1);
  });
  test('concurrence : une réclamation résolue deux fois en même temps n’indemnise qu’une fois', async () => {
    const ouverte = await request(app)
      .post('/client/reclamations')
      .set(auth(donnees.parrain))
      .send({ type: 'retard', objet: 'Colis en retard', description: 'Mon colis a du retard.' });
    expect(ouverte.status).toBe(201);
    const { id, reference } = ouverte.body.data.reclamation;
    await request(app)
      .patch(`/admin/reclamations/${id}/resoudre`)
      .set(auth(donnees.admin))
      .send({ statut: 'en_cours' })
      .expect(200);

    const resolutions = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .patch(`/admin/reclamations/${id}/resoudre`)
          .set(auth(donnees.admin))
          .send({ statut: 'resolue', resolution: 'Geste commercial', montantAccorde: 30 })
      )
    );
    expect(resolutions.map((r) => r.status).sort()).toEqual([200, 400]);
    const avoirs = await m.Facture.count({
      where: { type: 'avoir', mentions: `Avoir émis au titre de la réclamation ${reference}` },
    });
    expect(avoirs).toBe(1);
  });
  test('avoirs : le cumul ne dépasse jamais le total de la facture, même en parallèle', async () => {
    const r = await declarer(
      donnees.parrain,
      { ...base(), categorie: 'documents', typeDocument: 'Acte', modeDepot: 'envoi_postal' },
      1
    );
    const facture = await m.Facture.findOne({ where: { colisId: r.body.data.colis.id } });
    const total = Number(facture.montantTotal);
    const moitie = Math.floor((total * 60) / 100);
    // Deux avoirs de 60 % demandés en même temps : un seul peut passer
    const simultanes = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/admin/factures/${facture.id}/avoir`)
          .set(auth(donnees.admin))
          .send({ montant: moitie, motif: 'Geste commercial' })
      )
    );
    expect(simultanes.map((x) => x.status).sort()).toEqual([200, 400]);
    const somme = await m.Facture.sum('montantTotal', {
      where: { factureOrigineId: facture.id, type: 'avoir' },
    });
    expect(Number(somme)).toBeLessThanOrEqual(total);
  });
  test('concurrence : un conteneur passé deux fois « en transit » en même temps ne propage qu’une fois', async () => {
    const { rotationId } = await m.Colis.findByPk(donnees.colisConcurrence);
    const statut = (valeur) =>
      request(app)
        .patch(`/admin/conteneurs/${rotationId}/statut`)
        .set(auth(donnees.admin))
        .send({ statut: valeur });
    expect((await statut('cloturee')).status).toBe(200);
    const departs = await Promise.all([statut('en_transit'), statut('en_transit')]);
    // Un seul passage accepté ; l'autre est refusé, en conflit (409) s'il a lu l'ancien
    // statut, ou comme transition invalide (400) s'il est arrivé après le premier
    const statuts = departs.map((r) => r.status);
    expect(statuts.filter((code) => code === 200)).toHaveLength(1);
    expect([400, 409]).toContain(statuts.find((code) => code !== 200));
    const evenements = await m.SuiviColis.count({
      where: { colisId: donnees.colisConcurrence, codeEvenement: 'DEPART_HUB' },
    });
    expect(evenements).toBe(1);
  });
});
