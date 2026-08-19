jest.mock('../../src/models', () => ({
  Paiement: { create: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn() },
  Facture: { findByPk: jest.fn(), update: jest.fn() },
  User: {},
  Notification: { create: jest.fn().mockResolvedValue({}) }
}));
jest.mock('../../src/services/activityLog.service', () => ({ logActivity: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/utils/mailer', () => ({ sendPaiementConfirmeEmail: jest.fn().mockResolvedValue({}) }));

const { Paiement, Facture } = require('../../src/models');
const paiementService = require('../../src/services/admin/paiement.service');

const baseFacture = (overrides = {}) => ({
  id: 'facture-1',
  userId: 'user-1',
  statut: 'en_attente',
  montantTotal: 5000,
  Paiement: null,
  User: { id: 'user-1', nom: 'Diop', prenom: 'Aminata', email: 'aminata@test.com' },
  update: jest.fn().mockResolvedValue({}),
  ...overrides
});

describe('enregistrerPaiement', () => {
  it('rejette si la facture est introuvable', async () => {
    Facture.findByPk.mockResolvedValue(null);
    await expect(
      paiementService.enregistrerPaiement('facture-1', { methode: 'cash', montant: 5000 }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejette si la facture n\'est pas en attente', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture({ statut: 'payee' }));
    await expect(
      paiementService.enregistrerPaiement('facture-1', { methode: 'cash', montant: 5000 }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejette si un paiement existe déjà pour cette facture', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture({ Paiement: { id: 'p1' } }));
    await expect(
      paiementService.enregistrerPaiement('facture-1', { methode: 'cash', montant: 5000 }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejette si le montant ne correspond pas au montant de la facture', async () => {
    Facture.findByPk.mockResolvedValue(baseFacture({ montantTotal: 5000 }));
    await expect(
      paiementService.enregistrerPaiement('facture-1', { methode: 'cash', montant: 4000 }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(Paiement.create).not.toHaveBeenCalled();
  });

  it('enregistre le paiement et marque la facture payée quand le montant correspond', async () => {
    const facture = baseFacture({ montantTotal: 5000 });
    Facture.findByPk.mockResolvedValue(facture);
    Paiement.create.mockResolvedValue({ id: 'paiement-1', montant: 5000 });

    const result = await paiementService.enregistrerPaiement(
      'facture-1',
      { methode: 'cash', montant: 5000, reference: 'REF-1' },
      'admin-1'
    );

    expect(Paiement.create).toHaveBeenCalledWith(
      expect.objectContaining({ factureId: 'facture-1', montant: 5000, statut: 'succes' })
    );
    expect(facture.update).toHaveBeenCalledWith({ statut: 'payee' });
    expect(result.message).toBe('Paiement enregistré.');
  });
});
