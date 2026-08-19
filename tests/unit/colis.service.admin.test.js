jest.mock('../../src/models', () => ({
  Colis: { findByPk: jest.fn(), findAndCountAll: jest.fn(), sequelize: { fn: jest.fn(), col: jest.fn() } },
  SuiviColis: { create: jest.fn().mockResolvedValue({}) },
  Ville: {},
  User: {},
  Facture: { update: jest.fn() },
  Paiement: {},
  Tarif: { findOne: jest.fn() },
  Notification: { create: jest.fn().mockResolvedValue({}) }
}));
jest.mock('../../src/services/activityLog.service', () => ({ logActivity: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/utils/mailer', () => ({ sendColisStatutEmail: jest.fn().mockResolvedValue({}) }));

const { Colis, SuiviColis } = require('../../src/models');
const { sendColisStatutEmail } = require('../../src/utils/mailer');
const colisService = require('../../src/services/admin/colis.service');

const baseColis = (statut, overrides = {}) => ({
  id: 'colis-1',
  statut,
  client: { id: 'client-1', email: 'client@test.com' },
  update: jest.fn().mockResolvedValue({}),
  ...overrides
});

describe('updateStatutColis — machine à états', () => {
  it('rejette si le colis est introuvable', async () => {
    Colis.findByPk.mockResolvedValue(null);
    await expect(colisService.updateStatutColis('colis-1', { statut: 'en_transit' }, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejette une transition non autorisée (en_attente -> en_transit)', async () => {
    Colis.findByPk.mockResolvedValue(baseColis('en_attente'));
    await expect(colisService.updateStatutColis('colis-1', { statut: 'en_transit' }, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejette toute transition depuis un état terminal (livre)', async () => {
    Colis.findByPk.mockResolvedValue(baseColis('livre'));
    await expect(colisService.updateStatutColis('colis-1', { statut: 'annule' }, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('autorise en_attente -> en_preparation sans toucher dateLivraisonEffective', async () => {
    const colis = baseColis('en_attente');
    Colis.findByPk.mockResolvedValue(colis);

    await colisService.updateStatutColis('colis-1', { statut: 'en_preparation' }, 'admin-1');

    expect(colis.update).toHaveBeenCalledWith({ statut: 'en_preparation' });
    expect(SuiviColis.create).toHaveBeenCalledWith(
      expect.objectContaining({ colisId: 'colis-1', statut: 'en_preparation' })
    );
  });

  it('renseigne dateLivraisonEffective sur une livraison (arrive -> livre)', async () => {
    const colis = baseColis('arrive');
    Colis.findByPk.mockResolvedValue(colis);

    await colisService.updateStatutColis('colis-1', { statut: 'livre' }, 'admin-1');

    expect(colis.update).toHaveBeenCalledWith(
      expect.objectContaining({ statut: 'livre', dateLivraisonEffective: expect.any(Date) })
    );
  });

  it('renseigne annuleMotif sur une annulation, avec repli sur le commentaire', async () => {
    const colis = baseColis('en_preparation');
    Colis.findByPk.mockResolvedValue(colis);

    await colisService.updateStatutColis(
      'colis-1',
      { statut: 'annule', commentaire: 'Client indisponible' },
      'admin-1'
    );

    expect(colis.update).toHaveBeenCalledWith({ statut: 'annule', annuleMotif: 'Client indisponible' });
  });

  it('notifie le client par email quand le colis a un client rattaché', async () => {
    const colis = baseColis('en_attente');
    Colis.findByPk.mockResolvedValue(colis);

    await colisService.updateStatutColis('colis-1', { statut: 'en_preparation' }, 'admin-1');

    expect(sendColisStatutEmail).toHaveBeenCalledWith(colis.client, colis);
  });
});
