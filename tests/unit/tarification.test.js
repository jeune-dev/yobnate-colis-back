/**
 * Moteur de tarification : parcours des trois catégories du cahier des charges.
 * Les modèles Sequelize sont simulés, aucune base de données n'est nécessaire.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'y'.repeat(40);

const mockArticle = (champs) => ({
  isActive: true,
  paysDepart: 'FR',
  paysArrivee: 'SN',
  modeTransport: 'maritime',
  devise: 'EUR',
  prixAPartirDe: false,
  poidsMaxKg: null,
  prixPour(zoneDakar) {
    return Number(zoneDakar ? this.prixDakar : this.prixAutresRegions);
  },
  ...champs,
});

const mockArticles = [
  mockArticle({
    id: 'a-doc',
    code: 'DOC',
    libelle: 'Enveloppe',
    categorie: 'documents',
    prixDakar: 25,
    prixAutresRegions: 30,
    poidsMaxKg: 0.5,
  }),
  mockArticle({
    id: 'a-valise',
    code: 'VALISE-23',
    libelle: 'Valise 23 kg',
    categorie: 'colis_moyen',
    prixDakar: 40,
    prixAutresRegions: 50,
    poidsMaxKg: 23,
  }),
  mockArticle({
    id: 'a-frigo',
    code: 'FRIGO',
    libelle: 'Frigo',
    categorie: 'colis_xxl',
    prixDakar: 130,
    prixAutresRegions: 150,
    prixAPartirDe: true,
  }),
];

jest.mock('../../src/models', () => ({
  Tarif: { findAll: jest.fn(() => Promise.resolve([])) },
  Surcharge: { findAll: jest.fn(() => Promise.resolve([])) },
  ServiceExpedition: { findAll: jest.fn(() => Promise.resolve([])) },
  Ville: { findByPk: jest.fn() },
  Zone: {},
  ArticleTarif: {
    findAll: jest.fn(({ where }) =>
      Promise.resolve(mockArticles.filter((a) => where.id.includes(a.id)))
    ),
    findOne: jest.fn(() => Promise.resolve(mockArticles[0])),
  },
  Emballage: {
    findAll: jest.fn(() =>
      Promise.resolve([
        {
          id: 'e-barigot',
          code: 'BARIGOT',
          libelle: 'Barigot',
          isActive: true,
          prix: 24,
          devise: 'EUR',
          stock: 5,
          categoriesEligibles: ['colis_moyen', 'colis_xxl'],
        },
      ])
    ),
  },
  ParametreSysteme: { findAll: jest.fn(() => Promise.resolve([])) },
}));

jest.mock('../../src/utils/delais', () => ({
  calculerDateLivraisonEstimee: jest.fn(() =>
    Promise.resolve({
      dateEstimee: new Date('2026-10-20'),
      dateAuPlusTot: new Date('2026-10-10'),
      delaiApplique: 25,
      departReporte: false,
    })
  ),
}));

const tarification = require('../../src/modules/tarification/service/tarification.service');
const parametreService = require('../../src/modules/parametre/service/parametre.service');

const parametres = parametreService.valeursParDefaut();
const maritime = {
  id: 's-std',
  code: 'STD',
  nom: 'Standard',
  modeTransport: 'maritime',
  coefficientVolumetrique: 5000,
  poidsMaxKg: 100,
  typesContenuAutorises: [],
  joursOuvresUniquement: true,
};
const paris = { id: 'v-paris', nom: 'Paris', pays: 'FR', zone: null };
const dakar = { id: 'v-dakar', nom: 'Dakar', pays: 'SN', zoneTarifDakar: true, zone: null };
const thies = { id: 'v-thies', nom: 'Thiès', pays: 'SN', zoneTarifDakar: false, zone: null };

const devis = (options) =>
  tarification.calculerDevis({
    service: maritime,
    villeDepart: paris,
    villeArrivee: dakar,
    modeDepot: 'point_collecte',
    parametres,
    ...options,
  });

describe('Grille forfaitaire (catégories 1 et 2)', () => {
  test('le prix affiché TTC est exactement le prix payé, colonne Dakar', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      articles: [{ articleTarifId: 'a-valise', quantite: 2 }],
    });
    expect(d.modeTarification).toBe('forfait');
    expect(d.montants.total).toBe(80);
    expect(d.montants.totalHt + d.montants.tva).toBeCloseTo(80, 2);
    expect(d.piecesRetenues).toHaveLength(2);
    expect(d.corridor.zoneTarifaire).toBe('dakar');
  });

  test('colonne « autres régions » hors de la zone Dakar', async () => {
    const d = await devis({
      villeArrivee: thies,
      categorie: 'colis_moyen',
      articles: [{ articleTarifId: 'a-valise' }],
    });
    expect(d.montants.total).toBe(50);
    expect(d.corridor.zoneTarifaire).toBe('autres_regions');
  });

  test('catégorie 1 : forfait documents retenu d’office', async () => {
    const d = await devis({ categorie: 'documents', modeDepot: 'envoi_postal' });
    expect(d.lignesForfait[0].code).toBe('DOC');
    expect(d.montants.total).toBe(25);
    expect(d.categorie.paiement).toBe('a_la_commande');
  });

  test('la collecte à domicile n’est pas proposée pour des documents', async () => {
    await expect(
      devis({ categorie: 'documents', modeDepot: 'enlevement_domicile' })
    ).rejects.toThrow(/mode de remise/);
  });

  test('un article maritime est refusé en fret aérien', async () => {
    await expect(
      devis({
        service: { ...maritime, modeTransport: 'aerien' },
        categorie: 'colis_moyen',
        articles: [{ articleTarifId: 'a-valise' }],
      })
    ).rejects.toThrow(/fret aerien/);
  });
});

describe('Prestations annexes', () => {
  test('collecte à domicile en France facturée selon la grille (2 colis = 4,70 € HT)', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      modeDepot: 'enlevement_domicile',
      articles: [{ articleTarifId: 'a-valise', quantite: 2 }],
    });
    const collecte = d.detailAnnexes.find((a) => a.code === 'COLLECTE');
    expect(collecte.montant).toBe(4.7);
    expect(d.montants.total).toBeCloseTo(80 + 4.7 * 1.2, 2);
  });

  test('étiquette Colissimo par colis selon son poids (23 kg = 31,33 € HT)', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      modeDepot: 'envoi_postal',
      optionColissimo: true,
      articles: [{ articleTarifId: 'a-valise' }],
    });
    expect(d.detailAnnexes.find((a) => a.code === 'COLISSIMO').montant).toBe(31.33);
  });

  test('achat d’un barigot ajouté au devis', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      articles: [{ articleTarifId: 'a-valise' }],
      emballages: [{ emballageId: 'e-barigot', quantite: 1 }],
    });
    expect(d.detailAnnexes.find((a) => a.emballageId === 'e-barigot')).toBeTruthy();
    expect(d.montants.total).toBeCloseTo(40 + 24, 2);
  });
});

describe('Remises et parrainage', () => {
  test('bonus filleul de 10 % sur le fret', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      articles: [{ articleTarifId: 'a-valise' }],
      remiseParrainagePourcent: 10,
    });
    expect(d.montants.total).toBeCloseTo(36, 1);
    expect(d.montants.remiseParrainage).toBeGreaterThan(0);
  });

  test('crédit de parrainage imputé TTC', async () => {
    const d = await devis({
      categorie: 'colis_moyen',
      articles: [{ articleTarifId: 'a-valise' }],
      creditParrainage: 5,
    });
    expect(d.montants.total).toBeCloseTo(35, 1);
    expect(d.creditParrainageUtiliseEur).toBeCloseTo(5, 1);
  });
});

describe('Catégorie 3 (sur devis)', () => {
  test('estimation indicative, sans erreur en l’absence de grille au poids', async () => {
    const d = await devis({
      categorie: 'colis_xxl',
      pieces: [{ poidsKg: 80, longueurCm: 180, largeurCm: 70, hauteurCm: 70 }],
    });
    expect(d.surDevis).toBe(true);
    expect(d.modeTarification).toBe('sur_devis');
    expect(d.messageTarification).toMatch(/24 h/);
  });

  test('un frigo « à partir de » donne une estimation depuis la grille', async () => {
    const d = await devis({ categorie: 'colis_xxl', articles: [{ articleTarifId: 'a-frigo' }] });
    expect(d.surDevis).toBe(true);
    expect(d.montants.total).toBe(130);
  });
});
