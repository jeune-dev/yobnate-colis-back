jest.mock('../../src/models', () => ({
  Reclamation: { findByPk: jest.fn() },
  User: { findByPk: jest.fn() },
}));
jest.mock('../../src/modules/activityLog/service/activityLog.service', () => ({
  logActivity: jest.fn().mockResolvedValue(),
}));

const { Reclamation, User } = require('../../src/models');
const {
  assignerSchema,
} = require('../../src/modules/reclamation/validation/reclamation.validation');
const ReclamationService = require('../../src/modules/reclamation/service/reclamation.service');

describe('assignation des réclamations', () => {
  it('le schéma accepte null pour retirer l’assignation', () => {
    expect(assignerSchema.validate({ agentId: null }).error).toBeUndefined();
    expect(assignerSchema.validate({}).error).toBeDefined();
    expect(assignerSchema.validate({ agentId: 'x' }).error).toBeDefined();
  });

  it('agentId null retire l’agent sans notifier personne', async () => {
    const reclamation = {
      assigneA: 'a1',
      statut: 'en_cours',
      update: jest.fn().mockResolvedValue(),
    };
    Reclamation.findByPk.mockResolvedValue(reclamation);
    const r = await ReclamationService.assigner('r1', null, 'admin1');
    expect(reclamation.update).toHaveBeenCalledWith({ assigneA: null });
    expect(User.findByPk).not.toHaveBeenCalled();
    expect(r.message).toMatch(/retirée/);
  });
});
