jest.mock('../../src/models', () => ({
  Facture: { findByPk: jest.fn(), findAndCountAll: jest.fn(), update: jest.fn() },
  Colis: {},
  User: {},
  Paiement: {}
}));
jest.mock('../../src/services/activityLog.service', () => ({ logActivity: jest.fn().mockResolvedValue({}) }));

const { Facture } = require('../../src/models');
const factureService = require('../../src/services/admin/facture.service');

const baseFacture = (overrides = {}) => ({
  id: 'facture-1',
  statut: 'en_attente',
  montantTransport: 10000,
  remise: 0,
  montantTotal: 10000,
  update: jest.fn().mockResolvedValue({}),
  ...overrides
});

describe('appliquerRemise', () => {
  it('rejette une remise sur une facture qui n\'est pas en attente', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture({ statut: 'payee' }));
    await expect(factureService.appliquerRemise('facture-1', 1000, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejette une remise négative', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture());
    await expect(factureService.appliquerRemise('facture-1', -1, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejette une remise supérieure au montant de transport', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture({ montantTransport: 5000 }));
    await expect(factureService.appliquerRemise('facture-1', 6000, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('applique la remise et recalcule montantTotal', async () => {
    const facture = baseFacture({ montantTransport: 10000 });
    Facture.findByPk.mockResolvedValue(facture);

    const result = await factureService.appliquerRemise('facture-1', 1500, 'admin-1');

    expect(facture.update).toHaveBeenCalledWith({ remise: 1500, montantTotal: 8500 });
    expect(result.message).toContain('1500 FCFA appliquée');
  });
});
