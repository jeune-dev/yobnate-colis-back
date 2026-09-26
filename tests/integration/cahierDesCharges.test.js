/**
 * Points du cahier des charges ajoutés : avis clients modérés, FAQ, mesure
 * d'audience, taux de conversion, marge moyenne et niveau de stock.
 * Chaque test vérifie la réponse de l'API ET l'état réel des tables.
 */
const { randomUUID } = require('crypto');
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Cahier des charges — avis, FAQ, mesure, marge, stock (base réelle)', () => {
  let app;
  let jetonAdmin;
  let cache;
  // Chaque lecture du tableau de bord porte sa propre période : le cache (60 s) est par période
  let jour = 0;
  const periodeUnique = () => {
    jour += 1;
    return { dateDebut: `2020-01-${String(jour).padStart(2, '0')}`, dateFin: '2099-12-31' };
  };

  beforeAll(async () => {
    app = require('../../src/app');
    cache = require('../../src/utils/cache');
    jetonAdmin = await f.jeton(await f.creerUtilisateur({ role: 'admin' }));
  });
  afterAll(fermerBase);

  /* ── Avis clients ─────────────────────────────────────────────────────── */

  describe('Avis clients', () => {
    test('dépôt → en attente, invisible publiquement tant qu’il n’est pas publié', async () => {
      const client = await f.creerUtilisateur({ prenom: 'Awa', nom: 'Diop' });
      const colis = await f.creerColis(client, { statut: 'livre' });
      const res = await request(app)
        .post('/client/avis')
        .set('Authorization', await f.jeton(client))
        .send({ note: 5, commentaire: 'Colis arrivé à Dakar en parfait état', colisId: colis.id });
      expect(res.status).toBe(201);
      expect(res.body.data.avis.statut).toBe('en_attente');

      const publics = await request(app).get('/public/avis');
      expect(publics.body.data.avis.find((a) => a.id === res.body.data.avis.id)).toBeUndefined();
    });

    test('une expédition non livrée ne peut pas être évaluée ; une livrée une seule fois', async () => {
      const client = await f.creerUtilisateur();
      const entete = await f.jeton(client);
      const enCours = await f.creerColis(client, { statut: 'en_transit' });
      const refus = await request(app)
        .post('/client/avis')
        .set('Authorization', entete)
        .send({ note: 4, colisId: enCours.id });
      expect(refus.status).toBe(400);

      const livre = await f.creerColis(client, { statut: 'recupere' });
      const premiers = await Promise.all(
        [0, 1].map(() =>
          request(app)
            .post('/client/avis')
            .set('Authorization', entete)
            .send({ note: 4, colisId: livre.id })
        )
      );
      expect(premiers.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await f.models.Avis.count({ where: { colisId: livre.id } })).toBe(1);
    });

    test('le colis d’un autre client ne peut pas être évalué', async () => {
      const proprietaire = await f.creerUtilisateur();
      const colis = await f.creerColis(proprietaire, { statut: 'livre' });
      const intrus = await f.creerUtilisateur();
      const res = await request(app)
        .post('/client/avis')
        .set('Authorization', await f.jeton(intrus))
        .send({ note: 1, colisId: colis.id });
      expect(res.status).toBe(404);
    });

    test('un seul avis général à la fois par client', async () => {
      const client = await f.creerUtilisateur();
      const entete = await f.jeton(client);
      await request(app)
        .post('/client/avis')
        .set('Authorization', entete)
        .send({ note: 4 })
        .expect(201);
      const second = await request(app)
        .post('/client/avis')
        .set('Authorization', entete)
        .send({ note: 5 });
      expect(second.status).toBe(409);
    });

    test('note hors de 1 à 5 → 400', async () => {
      const client = await f.creerUtilisateur();
      const res = await request(app)
        .post('/client/avis')
        .set('Authorization', await f.jeton(client))
        .send({ note: 6 });
      expect(res.status).toBe(400);
    });

    test('modération : publication avec réponse, nom abrégé, synthèse publique', async () => {
      const client = await f.creerUtilisateur({ prenom: 'Moussa', nom: 'Fall' });
      const colis = await f.creerColis(client, { statut: 'livre' });
      const depot = await request(app)
        .post('/client/avis')
        .set('Authorization', await f.jeton(client))
        .send({ note: 4, titre: 'Très bien', colisId: colis.id });
      const id = depot.body.data.avis.id;

      const pub = await request(app)
        .patch(`/admin/avis/${id}/moderation`)
        .set('Authorization', jetonAdmin)
        .send({ statut: 'publie', reponse: 'Merci pour votre confiance !' });
      expect(pub.status).toBe(200);

      cache.del('avis:public:synthese');
      const publics = await request(app).get('/public/avis').query({ limit: 50 });
      const affiche = publics.body.data.avis.find((a) => a.id === id);
      expect(affiche).toMatchObject({
        note: 4,
        titre: 'Très bien',
        auteur: 'Moussa F.',
        reponse: 'Merci pour votre confiance !',
      });
      // Aucune donnée personnelle dans la réponse publique
      expect(JSON.stringify(affiche)).not.toMatch(/@|Fall|userId/);
      const { synthese } = publics.body.data;
      expect(synthese.total).toBe(await f.models.Avis.count({ where: { statut: 'publie' } }));
      expect(synthese.repartition).toHaveLength(5);
    });

    test('rejet : motif obligatoire, puis notification au client', async () => {
      const client = await f.creerUtilisateur();
      const depot = await request(app)
        .post('/client/avis')
        .set('Authorization', await f.jeton(client))
        .send({ note: 1, commentaire: 'Publicité hors sujet' });
      const id = depot.body.data.avis.id;
      await request(app)
        .patch(`/admin/avis/${id}/moderation`)
        .set('Authorization', jetonAdmin)
        .send({ statut: 'rejete' })
        .expect(400);
      await request(app)
        .patch(`/admin/avis/${id}/moderation`)
        .set('Authorization', jetonAdmin)
        .send({ statut: 'rejete', motifRejet: 'Contenu sans rapport avec le service' })
        .expect(200);
      expect((await f.models.Avis.findByPk(id)).statut).toBe('rejete');
      expect(await f.models.Notification.count({ where: { userId: client.id } })).toBe(1);
    });

    test('un client ne modère pas : 403 sur le back-office', async () => {
      const client = await f.creerUtilisateur();
      const res = await request(app)
        .get('/admin/avis')
        .set('Authorization', await f.jeton(client));
      expect(res.status).toBe(403);
    });

    test('tableau de bord : nombre et qualité des évaluations', async () => {
      const res = await request(app)
        .get('/admin/dashboard/evaluations')
        .query(periodeUnique())
        .set('Authorization', jetonAdmin);
      expect(res.status).toBe(200);
      const ev = res.body.data.evaluations;
      expect(ev.total).toBe(await f.models.Avis.count());
      expect(ev.publies + ev.enAttente + ev.rejetes).toBe(ev.total);
      expect(ev.repartition.reduce((n, r) => n + r.total, 0)).toBe(ev.total);
      expect(ev.noteMoyenne).toBeGreaterThanOrEqual(1);
    });
  });

  /* ── FAQ ──────────────────────────────────────────────────────────────── */

  describe('FAQ', () => {
    test('rédaction par l’admin, publication groupée par rubrique, questions inactives masquées', async () => {
      const creer = (champs) =>
        request(app).post('/admin/faq').set('Authorization', jetonAdmin).send(champs);
      const q1 = await creer({
        question: 'Quels produits sont interdits ?',
        reponse: 'Liquides inflammables, armes…',
        rubrique: 'douane',
        ordre: 2,
      });
      expect(q1.status).toBe(201);
      await creer({
        question: 'Faut-il une facture pour la douane ?',
        reponse: 'Oui, au-delà de 100 €.',
        rubrique: 'douane',
        ordre: 1,
      }).expect(201);
      const cachee = await creer({
        question: 'Question en brouillon ?',
        reponse: 'Pas encore publiée.',
        rubrique: 'douane',
        isActive: false,
      });

      const res = await request(app).get('/public/faq');
      expect(res.status).toBe(200);
      const douane = res.body.data.rubriques.find((r) => r.rubrique === 'douane');
      expect(douane.questions.map((q) => q.question)).toEqual([
        'Faut-il une facture pour la douane ?',
        'Quels produits sont interdits ?',
      ]);
      expect(douane.questions.some((q) => q.id === cachee.body.data.faq.id)).toBe(false);

      // Modification : le cache public est invalidé immédiatement
      await request(app)
        .put(`/admin/faq/${q1.body.data.faq.id}`)
        .set('Authorization', jetonAdmin)
        .send({ isActive: false })
        .expect(200);
      const apres = await request(app).get('/public/faq');
      const douaneApres = apres.body.data.rubriques.find((r) => r.rubrique === 'douane');
      expect(douaneApres.questions).toHaveLength(1);
    });

    test('rubrique inconnue → 400 ; client → 403', async () => {
      await request(app)
        .post('/admin/faq')
        .set('Authorization', jetonAdmin)
        .send({ question: 'Question valide ?', reponse: 'Réponse', rubrique: 'inconnue' })
        .expect(400);
      const client = await f.creerUtilisateur();
      await request(app)
        .post('/admin/faq')
        .set('Authorization', await f.jeton(client))
        .send({ question: 'Question valide ?', reponse: 'Réponse' })
        .expect(403);
    });
  });

  /* ── Mesure d'audience ────────────────────────────────────────────────── */

  describe('Mesure d’audience', () => {
    const visite = (champs, entete = null) => {
      const req = request(app).post('/public/visites');
      if (entete) req.set('Authorization', entete);
      return req.send(champs);
    };

    test('session : pages vues, présence (temps passé) sans page, source classée', async () => {
      const sessionId = randomUUID();
      const visiteurId = randomUUID();
      const base = { sessionId, visiteurId, plateforme: 'web' };
      const r1 = await visite({
        ...base,
        page: '/tarifs',
        referent: 'https://www.google.fr/search?q=envoi+colis+dakar',
      });
      expect(r1.status).toBe(200);
      expect(r1.body.data).toEqual({ enregistree: true, sessionExpiree: false });
      await visite({ ...base, page: '/suivi' }).expect(200);
      await visite({ ...base, evenement: 'ping' }).expect(200);

      const ligne = await f.models.Visite.findByPk(sessionId);
      expect(ligne.pagesVues).toBe(2);
      expect(ligne.source).toBe('recherche');
      expect(ligne.referentDomaine).toBe('google.fr');
      expect(ligne.pageEntree).toBe('/tarifs');
      expect(ligne.userId).toBeNull();
    });

    test('un autre visiteur ne peut pas prolonger la session d’autrui', async () => {
      const sessionId = randomUUID();
      await visite({ sessionId, visiteurId: randomUUID(), page: '/' }).expect(200);
      const intrus = await visite({ sessionId, visiteurId: randomUUID(), page: '/x' });
      expect(intrus.body.data.sessionExpiree).toBe(true);
      expect((await f.models.Visite.findByPk(sessionId)).pagesVues).toBe(1);
    });

    test('session expirée après 30 min d’inactivité : non prolongée', async () => {
      const sessionId = randomUUID();
      const visiteurId = randomUUID();
      await visite({ sessionId, visiteurId, page: '/' }).expect(200);
      await f.models.Visite.update(
        { derniereActivite: new Date(Date.now() - 31 * 60 * 1000) },
        { where: { id: sessionId } }
      );
      const res = await visite({ sessionId, visiteurId, page: '/faq' });
      expect(res.body.data.sessionExpiree).toBe(true);
    });

    test('visiteur connu : session rattachée au compte si un jeton valide est présenté', async () => {
      const client = await f.creerUtilisateur();
      const sessionId = randomUUID();
      await visite(
        { sessionId, visiteurId: randomUUID(), plateforme: 'android', page: '/accueil' },
        await f.jeton(client)
      ).expect(200);
      expect((await f.models.Visite.findByPk(sessionId)).userId).toBe(client.id);

      // Jeton invalide : la mesure reste anonyme, sans erreur
      const anonyme = randomUUID();
      await visite({ sessionId: anonyme, visiteurId: randomUUID() }, 'Bearer faux').expect(200);
      expect((await f.models.Visite.findByPk(anonyme)).userId).toBeNull();
    });

    test('identifiants non UUID → 400', async () => {
      await visite({ sessionId: '1', visiteurId: 'abc' }).expect(400);
    });

    test('tableau de bord marketing : trafic, visiteurs connus, temps passé, sources', async () => {
      const res = await request(app)
        .get('/admin/dashboard/marketing')
        .query(periodeUnique())
        .set('Authorization', jetonAdmin);
      expect(res.status).toBe(200);
      const m = res.body.data.marketing;
      expect(m.trafic.visites).toBe(await f.models.Visite.count());
      expect(m.trafic.visiteursUniques).toBeGreaterThan(0);
      expect(m.pourcentageVisiteursConnus).toBeGreaterThan(0);
      expect(m.pourcentageVisiteursConnus).toBeLessThanOrEqual(100);
      expect(m.sourcesTrafic.map((s) => s.source)).toEqual(
        expect.arrayContaining(['recherche', 'direct'])
      );
      expect(m.sourcesTrafic.reduce((n, s) => n + s.visites, 0)).toBe(m.trafic.visites);
      expect(typeof m.tempsPasse.moyenneSecondes).toBe('number');
    });
  });

  /* ── Marge moyenne ────────────────────────────────────────────────────── */

  describe('Marge moyenne', () => {
    test('coût de revient saisi par colis puis marge du tableau de bord', async () => {
      const client = await f.creerUtilisateur();
      const colis = await f.creerColis(client, {
        montantTotal: 120,
        montantTva: 20,
        devise: 'EUR',
        statut: 'livre',
      });
      const res = await request(app)
        .patch(`/admin/colis/${colis.id}/cout-revient`)
        .set('Authorization', jetonAdmin)
        .send({ coutRevient: 60 });
      expect(res.status).toBe(200);
      expect(Number((await f.models.Colis.findByPk(colis.id)).coutRevient)).toBe(60);

      const kpis = await request(app)
        .get('/admin/dashboard/kpis')
        .query(periodeUnique())
        .set('Authorization', jetonAdmin);
      expect(kpis.status).toBe(200);
      const eur = kpis.body.data.kpis.marge.find((m) => m.devise === 'EUR');
      // Contrôle indépendant, recalculé en base
      const [[attendu]] = await f.models.sequelize.query(
        `SELECT AVG("montantTotal" - "montantTva" - "montantDroitsDouane" - "coutRevient")::float AS m
           FROM colis WHERE devise = 'EUR' AND "coutRevient" IS NOT NULL
            AND statut NOT IN ('annule', 'refuse')`
      );
      expect(eur.margeMoyenne).toBeCloseTo(attendu.m, 2);
      expect(eur.colisAvecCout).toBeGreaterThanOrEqual(1);
    });

    test('coût d’un conteneur réparti au prorata du poids, converti par devise', async () => {
      const client = await f.creerUtilisateur();
      const rotation = await f.models.Rotation.create({
        reference: `ROT-${f.suffixe()}`,
        modeTransport: 'maritime',
        paysDepart: 'FR',
        paysArrivee: 'SN',
        dateDepartPrevue: new Date(),
        dateArriveePrevue: new Date(Date.now() + 20 * 86400000),
      });
      const lourd = await f.creerColis(client, { rotationId: rotation.id, poidsFactureKg: 30 });
      const leger = await f.creerColis(client, { rotationId: rotation.id, poidsFactureKg: 10 });
      const enFcfa = await f.creerColis(client, {
        rotationId: rotation.id,
        poidsFactureKg: 10,
        devise: 'XOF',
        montantTotal: 65000,
      });

      const res = await request(app)
        .post(`/admin/rotations/${rotation.id}/cout`)
        .set('Authorization', jetonAdmin)
        .send({ coutTotal: 1000, devise: 'EUR' });
      expect(res.status).toBe(200);
      expect(res.body.data.nbColis).toBe(3);

      const cout = async (c) => Number((await f.models.Colis.findByPk(c.id)).coutRevient);
      expect(await cout(lourd)).toBe(600);
      expect(await cout(leger)).toBe(200);
      // 200 € au taux EUR/XOF paramétré (655,957 par défaut), arrondi au franc
      expect(await cout(enFcfa)).toBe(131191);
      const r = await f.models.Rotation.findByPk(rotation.id);
      expect(Number(r.coutTotal)).toBe(1000);
      expect(r.coutDevise).toBe('EUR');
    });

    test('conteneur vide → 400 ; coût négatif → 400', async () => {
      const vide = await f.models.Rotation.create({
        reference: `ROT-${f.suffixe()}`,
        modeTransport: 'aerien',
        paysDepart: 'FR',
        paysArrivee: 'SN',
        dateDepartPrevue: new Date(),
        dateArriveePrevue: new Date(),
      });
      await request(app)
        .post(`/admin/rotations/${vide.id}/cout`)
        .set('Authorization', jetonAdmin)
        .send({ coutTotal: 100, devise: 'EUR' })
        .expect(400);
      await request(app)
        .post(`/admin/rotations/${vide.id}/cout`)
        .set('Authorization', jetonAdmin)
        .send({ coutTotal: -1, devise: 'EUR' })
        .expect(400);
    });

    test('le personnel (coursier) ne saisit pas de coût : 403', async () => {
      const coursier = await f.creerUtilisateur({ role: 'coursier' });
      const client = await f.creerUtilisateur();
      const colis = await f.creerColis(client, { coursierLivraisonId: coursier.id });
      const res = await request(app)
        .patch(`/admin/colis/${colis.id}/cout-revient`)
        .set('Authorization', await f.jeton(coursier))
        .send({ coutRevient: 10 });
      expect(res.status).toBe(403);
    });
  });

  /* ── Niveau de stock ──────────────────────────────────────────────────── */

  describe('Niveau de stock', () => {
    test('emballages en rupture, sous le seuil ou disponibles ; occupation des points', async () => {
      const rupture = await f.creerEmballage({ stock: 0 });
      const faible = await f.creerEmballage({ stock: 3 });
      const ok = await f.creerEmballage({ stock: 40 });
      await f.creerEmballage({ stock: null }); // non suivi : absent de l'indicateur
      const point = await f.creerPoint({ colisEnStock: 45, capaciteMaxColis: 50 });

      cache.del('dashboard:stock');
      const res = await request(app).get('/admin/dashboard/stock').set('Authorization', jetonAdmin);
      expect(res.status).toBe(200);
      const { emballages, pointsCollecte, seuilAlerte } = res.body.data.stock;
      expect(seuilAlerte).toBe(5);
      const etat = (e) => emballages.articles.find((a) => a.id === e.id)?.etat;
      expect([etat(rupture), etat(faible), etat(ok)]).toEqual(['rupture', 'faible', 'ok']);
      expect(emballages.suivis).toBe(
        await f.models.Emballage.count({
          where: { stock: { [require('sequelize').Op.ne]: null } },
        })
      );
      const p = pointsCollecte.points.find((x) => x.id === point.id);
      expect(p.tauxOccupation).toBe(90);
    });
  });
});
