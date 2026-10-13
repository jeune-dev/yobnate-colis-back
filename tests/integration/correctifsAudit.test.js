/**
 * Correctifs de l'audit du 13/10/2026 : chaque test rejoue le scénario qui révélait
 * l'anomalie (finances, remise des colis, stocks, tarification, paramètres).
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Correctifs de l’audit (base réelle)', () => {
  let app;
  let admin;
  let enteteAdmin;
  let client;
  let enteteClient;

  const post = (url, corps, entete = enteteAdmin) =>
    request(app).post(url).set('Authorization', entete).send(corps);
  const patch = (url, corps, entete = enteteAdmin) =>
    request(app).patch(url).set('Authorization', entete).send(corps);

  beforeAll(async () => {
    app = require('../../src/app');
    await require('../../src/modules/parametre/service/parametre.service').initialiser();
    admin = await f.creerUtilisateur({ role: 'super_admin' });
    enteteAdmin = await f.jeton(admin);
    client = await f.creerUtilisateur({ pays: 'FR' });
    enteteClient = await f.jeton(client);
  });
  afterAll(fermerBase);

  describe('Avoirs', () => {
    test('un avoir est imputé sur sa facture : le reste dû baisse, la facture se solde', async () => {
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 25 }));
      const res = await post(`/admin/factures/${facture.id}/avoir`, { montant: 5, motif: 'Geste' });
      expect(res.status).toBe(200);
      expect(res.body.data.avoir.reference).toMatch(/^AVO-\d{4}-\d{5}$/);
      expect(res.body.data.avoir.statut).toBe('payee');
      await facture.reload();
      expect(Number(facture.montantAvoirs)).toBe(5);
      expect(facture.soldeDu).toBe(20);

      await post(`/admin/factures/${facture.id}/avoir`, { montant: 20, motif: 'Solde' });
      await facture.reload();
      expect(facture.statut).toBe('payee');
    });

    test('avoirs de facture et de réclamation : numéros uniques, factures sans trou', async () => {
      const colis = await f.creerColis(client, { montantTotal: 40 });
      const facture = await f.creerFacture(colis);
      const avoirFacture = await post(`/admin/factures/${facture.id}/avoir`, {
        montant: 2,
        motif: 'Erreur',
      });

      const ouverte = await post(
        '/client/reclamations',
        {
          type: 'retard',
          objet: 'Retard',
          description: 'Mon colis a du retard.',
          colisId: colis.id,
        },
        enteteClient
      );
      expect(ouverte.status).toBe(201);
      const { id } = ouverte.body.data.reclamation;
      await patch(`/admin/reclamations/${id}/resoudre`, { statut: 'en_cours' });
      const resolue = await patch(`/admin/reclamations/${id}/resoudre`, {
        statut: 'resolue',
        resolution: 'Indemnisation',
        montantAccorde: 3,
      });
      expect(resolue.status).toBe(200);

      const refs = [avoirFacture.body.data.avoir.reference, resolue.body.data.avoir.reference];
      expect(new Set(refs).size).toBe(2);
      // L'indemnisation est imputée sur la facture de l'expédition
      await facture.reload();
      expect(Number(facture.montantAvoirs)).toBe(5);
      expect(resolue.body.data.avoir.factureOrigineId).toBe(facture.id);
    });

    test('un avoir ne compte jamais dans l’encours ni dans les impayées', async () => {
      const autre = await f.creerUtilisateur();
      await f.models.Facture.create({
        reference: `AVO-T-${f.suffixe()}`,
        userId: autre.id,
        type: 'avoir',
        devise: 'EUR',
        montantTotal: 10,
        statut: 'en_attente',
      });
      const res = await request(app)
        .get(`/admin/factures`)
        .query({ userId: autre.id, impayees: true })
        .set('Authorization', enteteAdmin);
      expect(res.body.data.factures).toHaveLength(0);
      const fiche = await request(app)
        .get(`/admin/users/${autre.id}`)
        .set('Authorization', enteteAdmin);
      expect(JSON.stringify(fiche.body.data)).not.toMatch(/"solde":10/);
    });

    test('un avoir ne s’encaisse pas', async () => {
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 30 }));
      const { avoir } = (
        await post(`/admin/factures/${facture.id}/avoir`, { montant: 10, motif: 'Erreur de tarif' })
      ).body.data;
      const res = await post(`/admin/paiements/factures/${avoir.id}`, {
        methode: 'especes',
        montant: 10,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Paiements et remboursements', () => {
    test('moyen de paiement incompatible avec la devise refusé', async () => {
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 25 }));
      expect(
        (
          await post(`/admin/paiements/factures/${facture.id}`, {
            methode: 'orange_money',
            montant: 5,
          })
        ).status
      ).toBe(400);
      expect(
        (await post(`/admin/paiements/factures/${facture.id}`, { methode: 'carte', montant: 5 }))
          .status
      ).toBe(201);
    });

    test('remboursements partiels successifs, sans rouvrir la dette par défaut', async () => {
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 20 }));
      const pay = (
        await post(`/admin/paiements/factures/${facture.id}`, { methode: 'carte', montant: 20 })
      ).body.data.paiement;

      const r1 = await patch(`/admin/paiements/${pay.id}/rembourser`, {
        montant: 5,
        motif: 'Geste 1',
      });
      expect(r1.status).toBe(200);
      expect(r1.body.data.avoir).toBeTruthy();
      const r2 = await patch(`/admin/paiements/${pay.id}/rembourser`, {
        montant: 5,
        motif: 'Geste 2',
      });
      expect(r2.status).toBe(200);

      await facture.reload();
      expect(facture.statut).toBe('payee');
      expect(facture.soldeDu).toBe(0);
      expect(Number(facture.montantPaye)).toBe(10);
    });

    test('remboursement avec rouvrirFacture : la somme redevient due', async () => {
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 20 }));
      const pay = (
        await post(`/admin/paiements/factures/${facture.id}`, { methode: 'carte', montant: 20 })
      ).body.data.paiement;
      const r = await patch(`/admin/paiements/${pay.id}/rembourser`, {
        montant: 8,
        motif: 'Encaissement erroné',
        rouvrirFacture: true,
      });
      expect(r.status).toBe(200);
      await facture.reload();
      expect(facture.statut).toBe('partiellement_payee');
      expect(facture.soldeDu).toBe(8);
    });

    test('statistiques : un paiement remboursé reste dans le brut, le remboursé à côté', async () => {
      const avant = (
        await request(app).get('/admin/paiements/statistiques').set('Authorization', enteteAdmin)
      ).body.data.statistiques.parDevise.find((d) => d.devise === 'EUR') || {
        encaisse: 0,
        rembourse: 0,
      };
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 50 }));
      const pay = (
        await post(`/admin/paiements/factures/${facture.id}`, { methode: 'carte', montant: 50 })
      ).body.data.paiement;
      await patch(`/admin/paiements/${pay.id}/rembourser`, { montant: 50, motif: 'Annulation' });
      const apres = (
        await request(app).get('/admin/paiements/statistiques').set('Authorization', enteteAdmin)
      ).body.data.statistiques.parDevise.find((d) => d.devise === 'EUR');
      expect(apres.encaisse - avant.encaisse).toBe(50);
      expect(apres.rembourse - avant.rembourse).toBe(50);
    });
  });

  describe('Remise des colis', () => {
    test('mise à disposition sans code : un code est créé et exigé au retrait', async () => {
      const point = await f.creerPoint();
      const colis = await f.creerColis(client, {
        statut: 'arrive',
        modeLivraison: 'livraison_domicile',
        codeRetrait: null,
      });
      const dispo = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'DISPO',
        pointCollecteId: point.id,
      });
      expect(dispo.status).toBe(200);
      await colis.reload();
      expect(colis.codeRetrait).toMatch(/^\d{4}$/);

      const mauvais = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'RETIRE',
        codeRetrait: '0000' === colis.codeRetrait ? '1111' : '0000',
      });
      expect(mauvais.status).toBe(400);
    });

    test('facture impayée : remise refusée, sauf dérogation tracée de l’administrateur', async () => {
      const point = await f.creerPoint();
      const colis = await f.creerColis(client, {
        statut: 'disponible_retrait',
        pointActuelId: point.id,
        codeRetrait: '4321',
      });
      await f.creerFacture(colis, { montantTotal: 360 });
      const refus = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'RETIRE',
        codeRetrait: '4321',
      });
      expect(refus.status).toBe(400);
      expect(refus.body.message).toMatch(/impayée/);

      const force = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'RETIRE',
        codeRetrait: '4321',
        remiseSansReglement: true,
      });
      expect(force.status).toBe(200);
    });

    test('la remise en lot est refusée', async () => {
      const colis = await f.creerColis(client, { statut: 'en_livraison' });
      const res = await post('/admin/colis/evenements/lot', {
        colisIds: [colis.id],
        codeEvenement: 'LIVRE',
      });
      expect(res.status).toBe(400);
    });

    test('le stock du point redescend quand le colis est retiré', async () => {
      const point = await f.creerPoint();
      const colis = await f.creerColis(client, { statut: 'arrive' });
      await f.creerFacture(colis, { montantPaye: 100, statut: 'payee' });
      await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'DISPO',
        pointCollecteId: point.id,
      });
      await point.reload();
      expect(point.colisEnStock).toBe(1);
      await colis.reload();
      const retrait = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'RETIRE',
        codeRetrait: colis.codeRetrait,
      });
      expect(retrait.status).toBe(200);
      await point.reload();
      expect(point.colisEnStock).toBe(0);
    });
  });

  describe('Cycle de vie', () => {
    test('« refusé par le destinataire » impossible au départ ; sortie d’incident par une nouvelle réception', async () => {
      const point = await f.creerPoint();
      const colis = await f.creerColis(client, { statut: 'receptionne', pointActuelId: point.id });
      const refus = await post(`/admin/colis/${colis.id}/evenements`, { codeEvenement: 'REFUSE' });
      expect(refus.status).toBe(400);

      await post(`/admin/colis/${colis.id}/evenements`, { codeEvenement: 'AVARIE' });
      const reprise = await post(`/admin/colis/${colis.id}/evenements`, {
        codeEvenement: 'RECEPTION',
        pointCollecteId: point.id,
      });
      expect(reprise.status).toBe(200);
      await colis.reload();
      expect(colis.statut).toBe('receptionne');
    });
  });

  describe('Indicateurs et tarification', () => {
    test('analyses : la journée de fin est incluse', async () => {
      await f.creerColis(client, { montantTotal: 77, devise: 'EUR' });
      const jour = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get('/admin/dashboard/kpis')
        .query({ dateDebut: jour, dateFin: jour })
        .set('Authorization', enteteAdmin);
      expect(res.status).toBe(200);
      const eur = res.body.data.kpis.ventes.find((v) => v.devise === 'EUR');
      expect(eur?.commandes).toBeGreaterThan(0);
    });

    test('simulateur : poidsKg est pris en compte comme des pièces', async () => {
      const [paris, dakar] = await Promise.all([
        f.creerVille({ pays: 'FR' }),
        f.creerVille({ pays: 'SN' }),
      ]);
      const service = await f.creerService({
        modeTransport: 'maritime',
        poidsMinKg: 0.5,
        poidsMaxKg: 100,
        coefficientVolumetrique: 5000,
        isActive: true,
      });
      await f.models.Tarif.create({
        serviceId: service.id,
        paysDepart: 'FR',
        paysArrivee: 'SN',
        poidsMinKg: 0,
        poidsMaxKg: 100,
        prixBase: 10,
        poidsInclusKg: 0,
        prixParKgSupplementaire: 2,
        devise: 'EUR',
        isActive: true,
      });
      const total = async (corps) => {
        const r = await request(app)
          .post('/public/devis')
          .send({
            villeDepartId: paris.id,
            villeArriveeId: dakar.id,
            categorie: 'colis_moyen',
            ...corps,
          });
        return r.body.data.devis.offres.find((o) => o.service.id === service.id)?.montants.total;
      };
      const parPoids = await total({ poidsKg: 50 });
      const parPieces = await total({ pieces: [{ poidsKg: 50 }] });
      expect(parPoids).toBeDefined();
      expect(parPoids).toBe(parPieces);
    });

    test('marchandise dangereuse refusée en aérien', async () => {
      const [paris, dakar] = await Promise.all([
        f.creerVille({ pays: 'FR' }),
        f.creerVille({ pays: 'SN' }),
      ]);
      const service = await f.creerService({ modeTransport: 'aerien', isActive: true });
      const res = await request(app)
        .post('/public/devis')
        .send({
          villeDepartId: paris.id,
          villeArriveeId: dakar.id,
          categorie: 'colis_moyen',
          pieces: [{ poidsKg: 5 }],
          serviceId: service.id,
          marchandiseDangereuse: true,
        });
      const offre = res.body.data?.devis?.offres?.find((o) => o.service.id === service.id);
      expect(offre).toBeUndefined();
    });
  });

  describe('Paramètres et saisies', () => {
    test('paramètres numériques bornés', async () => {
      const put = (cle, valeur) =>
        request(app)
          .put(`/admin/parametres/${cle}`)
          .set('Authorization', enteteAdmin)
          .send({ valeur });
      expect((await put('tva_fr', 500)).status).toBe(400);
      expect((await put('taux_change_eur_xof', 0)).status).toBe(400);
      expect((await put('arrondi_poids_kg', 0)).status).toBe(400);
      expect((await put('prefixe_numero_suivi', '<b>')).status).toBe(400);
      expect((await put('tva_fr', 20)).status).toBe(200);
    });

    test('inscription sans pays avec un numéro français : client en France', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          nom: 'Martin',
          prenom: 'Luc',
          email: `luc-${f.suffixe()}@exemple.com`,
          telephone: `+3361${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
          password: 'Motdepasse1!',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.utilisateur.pays).toBe('FR');
    });

    test('enlèvement refusé un dimanche et avec un téléphone invalide', async () => {
      const ville = await f.creerVille({ pays: 'FR' });
      const prochainDimanche = new Date();
      prochainDimanche.setUTCDate(
        prochainDimanche.getUTCDate() + ((7 - prochainDimanche.getUTCDay()) % 7 || 7)
      );
      const base = {
        contactNom: 'Awa',
        contactTelephone: '+33612345001',
        pays: 'FR',
        villeId: ville.id,
        adresse: '1 rue de Rivoli',
        creneau: '08:00-12:00',
      };
      const dimanche = await post(
        '/client/enlevements',
        { ...base, dateSouhaitee: prochainDimanche.toISOString().slice(0, 10) },
        enteteClient
      );
      expect(dimanche.status).toBe(400);
      const lundi = new Date(prochainDimanche);
      lundi.setUTCDate(lundi.getUTCDate() + 1);
      const telephone = await post(
        '/client/enlevements',
        { ...base, contactTelephone: 'abc', dateSouhaitee: lundi.toISOString().slice(0, 10) },
        enteteClient
      );
      expect(telephone.status).toBe(400);
    });
  });
});
