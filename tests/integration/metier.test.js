/**
 * Règles métier à effet en base : cohérence après échec, concurrence, stock,
 * crédit et encaissements. Chaque test vérifie l'état réel des tables.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Règles métier (base réelle)', () => {
  let app;
  let admin;
  let jetonAdmin;

  beforeAll(async () => {
    app = require('../../src/app');
    admin = await f.creerUtilisateur({ role: 'admin' });
    jetonAdmin = await f.jeton(admin);
  });
  afterAll(fermerBase);

  describe('Annulation d’une expédition par le client', () => {
    const preparer = async ({ credit = 10, stock = 4, quantite = 2 } = {}) => {
      const client = await f.creerUtilisateur({ creditParrainage: 0 });
      const emballage = await f.creerEmballage({ stock });
      const colis = await f.creerColis(client, {
        creditParrainageUtilise: credit,
        emballages: [{ emballageId: emballage.id, libelle: 'Carton', quantite, montant: 10 }],
      });
      const facture = await f.creerFacture(colis);
      return { client, emballage, colis, facture, entete: await f.jeton(client) };
    };

    test('annulation → statut, crédit, stock et facture mis à jour ensemble', async () => {
      const { client, emballage, colis, facture, entete } = await preparer();
      const res = await request(app)
        .patch(`/client/colis/${colis.id}/annuler`)
        .set('Authorization', entete)
        .send({ motif: 'Changement de programme' });
      expect(res.status).toBe(200);

      await Promise.all([client.reload(), emballage.reload(), colis.reload(), facture.reload()]);
      expect(colis.statut).toBe('annule');
      expect(Number(client.creditParrainage)).toBe(10);
      expect(emballage.stock).toBe(6);
      expect(facture.statut).toBe('annulee');
    });

    test('deux annulations simultanées : une seule aboutit, ressources rendues une fois', async () => {
      const { client, emballage, colis, entete } = await preparer();
      const envoyer = () =>
        request(app)
          .patch(`/client/colis/${colis.id}/annuler`)
          .set('Authorization', entete)
          .send({ motif: 'double clic' });
      const reponses = await Promise.all([envoyer(), envoyer(), envoyer()]);

      expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(reponses.filter((r) => r.status === 400)).toHaveLength(2);
      await Promise.all([client.reload(), emballage.reload()]);
      expect(Number(client.creditParrainage)).toBe(10);
      expect(emballage.stock).toBe(6);
      expect(
        await f.models.SuiviColis.count({ where: { colisId: colis.id, codeEvenement: 'ANNULE' } })
      ).toBe(1);
    });

    test('échec au milieu de l’annulation : rien n’est modifié', async () => {
      const { client, emballage, colis, facture, entete } = await preparer();
      const panne = jest
        .spyOn(f.models.Facture, 'update')
        .mockRejectedValueOnce(new Error('panne simulée'));

      const res = await request(app)
        .patch(`/client/colis/${colis.id}/annuler`)
        .set('Authorization', entete)
        .send({});
      expect(res.status).toBe(500);
      panne.mockRestore();

      await Promise.all([client.reload(), emballage.reload(), colis.reload(), facture.reload()]);
      expect(colis.statut).toBe('en_attente');
      expect(Number(colis.creditParrainageUtilise)).toBe(10);
      expect(Number(client.creditParrainage)).toBe(0);
      expect(emballage.stock).toBe(4);
      expect(facture.statut).toBe('en_attente');
      expect(await f.models.SuiviColis.count({ where: { colisId: colis.id } })).toBe(0);
    });

    test('colis déjà pris en charge → 400, aucune écriture', async () => {
      const { client, colis, entete } = await preparer();
      await colis.update({ statut: 'en_transit' });
      const res = await request(app)
        .patch(`/client/colis/${colis.id}/annuler`)
        .set('Authorization', entete)
        .send({});
      expect(res.status).toBe(400);
      await client.reload();
      expect(Number(client.creditParrainage)).toBe(0);
    });
  });

  describe('Refus admin concurrent d’une annulation client', () => {
    test('les ressources ne sont restituées qu’une fois', async () => {
      const client = await f.creerUtilisateur({ creditParrainage: 0 });
      const colis = await f.creerColis(client, {
        statut: 'en_attente_validation',
        creditParrainageUtilise: 15,
      });
      const [annulation, refus] = await Promise.all([
        request(app)
          .patch(`/client/colis/${colis.id}/annuler`)
          .set('Authorization', await f.jeton(client))
          .send({}),
        request(app)
          .post(`/admin/colis/${colis.id}/refuser`)
          .set('Authorization', jetonAdmin)
          .send({ motif: 'Contenu non conforme' }),
      ]);

      expect([annulation.status, refus.status].filter((s) => s === 200)).toHaveLength(1);
      await client.reload();
      expect(Number(client.creditParrainage)).toBe(15);
    });
  });

  describe('Proposition tarifaire (catégorie 3)', () => {
    test('acceptations simultanées : une seule facture', async () => {
      const client = await f.creerUtilisateur();
      const colis = await f.creerColis(client, {
        categorie: 'colis_xxl',
        statut: 'devis_propose',
        montantTotal: 300,
      });
      const entete = await f.jeton(client);
      const accepter = () =>
        request(app)
          .post(`/client/colis/${colis.id}/proposition/accepter`)
          .set('Authorization', entete);
      const reponses = await Promise.all([accepter(), accepter()]);

      expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await f.models.Facture.count({ where: { colisId: colis.id } })).toBe(1);
    });
  });

  describe('Encaissement d’une facture', () => {
    test('deux encaissements simultanés : pas de sur-paiement ni de mise à jour perdue', async () => {
      const client = await f.creerUtilisateur();
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 100 }));
      const encaisser = () =>
        request(app)
          .post(`/admin/paiements/factures/${facture.id}`)
          .set('Authorization', jetonAdmin)
          .send({ methode: 'especes', montant: 60 });
      const reponses = await Promise.all([encaisser(), encaisser()]);

      expect(reponses.map((r) => r.status).sort()).toEqual([201, 400]);
      await facture.reload();
      expect(Number(facture.montantPaye)).toBe(60);
      expect(facture.statut).toBe('partiellement_payee');
      expect(await f.models.Paiement.count({ where: { factureId: facture.id } })).toBe(1);
    });

    test('règlements successifs : la facture est soldée exactement', async () => {
      const client = await f.creerUtilisateur();
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 100 }));
      for (const montant of [40, 60]) {
        await request(app)
          .post(`/admin/paiements/factures/${facture.id}`)
          .set('Authorization', jetonAdmin)
          .send({ methode: 'especes', montant })
          .expect(201);
      }
      await facture.reload();
      expect(Number(facture.montantPaye)).toBe(100);
      expect(facture.statut).toBe('payee');
    });

    test('deux remboursements simultanés du même paiement : un seul aboutit', async () => {
      const client = await f.creerUtilisateur();
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 100 }));
      const encaissement = await request(app)
        .post(`/admin/paiements/factures/${facture.id}`)
        .set('Authorization', jetonAdmin)
        .send({ methode: 'especes', montant: 100 })
        .expect(201);
      const paiementId = encaissement.body.data.paiement.id;

      const rembourser = () =>
        request(app)
          .patch(`/admin/paiements/${paiementId}/rembourser`)
          .set('Authorization', jetonAdmin)
          .send({ montant: 100, motif: 'Colis perdu' });
      const reponses = await Promise.all([rembourser(), rembourser()]);

      expect(reponses.map((r) => r.status).sort()).toEqual([200, 400]);
      const paiement = await f.models.Paiement.findByPk(paiementId);
      expect(Number(paiement.montantRembourse)).toBe(100);
      await facture.reload();
      expect(Number(facture.montantPaye)).toBe(0);
    });

    test('montant supérieur au solde → 400, aucun paiement', async () => {
      const client = await f.creerUtilisateur();
      const facture = await f.creerFacture(await f.creerColis(client, { montantTotal: 50 }));
      const res = await request(app)
        .post(`/admin/paiements/factures/${facture.id}`)
        .set('Authorization', jetonAdmin)
        .send({ methode: 'especes', montant: 80 });
      expect(res.status).toBe(400);
      expect(await f.models.Paiement.count({ where: { factureId: facture.id } })).toBe(0);
    });
  });

  describe('Réservations à la commande (stock d’emballages, crédit de parrainage)', () => {
    const ColisService = require('../../src/modules/colis/service/colisDeclaration.service');
    const { sequelize } = f.models;

    test('stock insuffisant → 409 et transaction annulée', async () => {
      const emballage = await f.creerEmballage({ stock: 1 });
      await expect(
        sequelize.transaction((t) =>
          ColisService.reserverEmballages([{ emballageId: emballage.id, quantite: 2 }], t)
        )
      ).rejects.toMatchObject({ statusCode: 409 });
      await emballage.reload();
      expect(emballage.stock).toBe(1);
    });

    test('commandes simultanées sur la dernière unité : le stock ne devient jamais négatif', async () => {
      const emballage = await f.creerEmballage({ stock: 1 });
      const resultats = await Promise.allSettled(
        [1, 2, 3].map(() =>
          sequelize.transaction((t) =>
            ColisService.reserverEmballages([{ emballageId: emballage.id, quantite: 1 }], t)
          )
        )
      );
      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await emballage.reload();
      expect(emballage.stock).toBe(0);
    });

    test('emballage sans suivi de stock (stock nul) : aucune limite', async () => {
      const emballage = await f.creerEmballage({ stock: null });
      await sequelize.transaction((t) =>
        ColisService.reserverEmballages([{ emballageId: emballage.id, quantite: 5 }], t)
      );
      await emballage.reload();
      expect(emballage.stock).toBeNull();
    });

    test('crédit de parrainage consommé deux fois en parallèle : jamais négatif', async () => {
      const client = await f.creerUtilisateur({ creditParrainage: 10 });
      const resultats = await Promise.allSettled(
        [1, 2].map(() =>
          sequelize.transaction((t) => ColisService.consommerCreditParrainage(client.id, 10, t))
        )
      );
      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await client.reload();
      expect(Number(client.creditParrainage)).toBe(0);
    });
  });

  describe('Douane — retrait d’un article', () => {
    test('DELETE /admin/douane/:id/articles/:articleId retire bien l’article', async () => {
      const client = await f.creerUtilisateur();
      const colis = await f.creerColis(client);
      const declaration = await f.models.DeclarationDouane.create({
        colisId: colis.id,
        paysExport: 'FR',
        paysImport: 'SN',
      });
      const article = await f.models.ArticleDouane.create({
        declarationId: declaration.id,
        designation: 'Chemises',
        valeurUnitaire: 10,
      });

      const res = await request(app)
        .delete(`/admin/douane/${declaration.id}/articles/${article.id}`)
        .set('Authorization', jetonAdmin);
      expect(res.status).toBe(200);
      expect(await f.models.ArticleDouane.findByPk(article.id)).toBeNull();
    });

    test('identifiant d’article invalide → 400', async () => {
      const res = await request(app)
        .delete(`/admin/douane/${'1'.repeat(8)}-0000-4000-8000-000000000000/articles/abc`)
        .set('Authorization', jetonAdmin);
      expect(res.status).toBe(400);
    });
  });

  describe('Bascule de statut (activation / désactivation)', () => {
    test('corps absent → 400, compte inchangé', async () => {
      const user = await f.creerUtilisateur();
      const res = await request(app)
        .patch(`/admin/users/${user.id}/statut`)
        .set('Authorization', jetonAdmin)
        .send({});
      expect(res.status).toBe(400);
      await user.reload();
      expect(user.isActive).toBe(true);
    });
  });

  describe('Colis reçus (destinataire)', () => {
    test('liste des colis adressés au numéro du compte, sans le code de retrait', async () => {
      const destinataire = await f.creerUtilisateur();
      const expediteur = await f.creerUtilisateur();
      await f.creerColis(expediteur, {
        destinataireTelephone: destinataire.telephone,
        codeRetrait: '987654',
        modeLivraison: 'point_retrait',
      });
      const res = await request(app)
        .get('/client/colis/recus')
        .set('Authorization', await f.jeton(destinataire));

      expect(res.status).toBe(200);
      expect(res.body.data.colis).toHaveLength(1);
      expect(res.body.data.colis[0].reference).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain('987654');
    });
  });
});
