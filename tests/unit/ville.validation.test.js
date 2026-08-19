const { createVilleSchema, updateVilleSchema } = require('../../src/validations/ville.validation');

describe('createVilleSchema', () => {
  it('accepte une ville valide avec pays FR', () => {
    const { error, value } = createVilleSchema.validate({ nom: 'Paris', pays: 'FR' });
    expect(error).toBeUndefined();
    expect(value.isActive).toBe(true); // valeur par défaut
  });

  it('accepte une ville valide avec pays SN', () => {
    const { error } = createVilleSchema.validate({ nom: 'Dakar', pays: 'SN' });
    expect(error).toBeUndefined();
  });

  it('rejette un pays hors FR/SN', () => {
    const { error } = createVilleSchema.validate({ nom: 'Berlin', pays: 'DE' });
    expect(error).toBeDefined();
  });

  it('rejette une ville sans pays (requis)', () => {
    const { error } = createVilleSchema.validate({ nom: 'Paris' });
    expect(error).toBeDefined();
  });

  it('rejette une ville sans nom', () => {
    const { error } = createVilleSchema.validate({ pays: 'FR' });
    expect(error).toBeDefined();
  });
});

describe('updateVilleSchema', () => {
  it('accepte une mise à jour partielle (pays seul)', () => {
    const { error } = updateVilleSchema.validate({ pays: 'SN' });
    expect(error).toBeUndefined();
  });

  it('rejette un objet vide (au moins un champ requis)', () => {
    const { error } = updateVilleSchema.validate({});
    expect(error).toBeDefined();
  });

  it('rejette un pays invalide', () => {
    const { error } = updateVilleSchema.validate({ pays: 'US' });
    expect(error).toBeDefined();
  });
});
