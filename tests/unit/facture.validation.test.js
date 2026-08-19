const { appliquerRemiseSchema } = require('../../src/validations/facture.validation');

describe('appliquerRemiseSchema', () => {
  it('accepte une remise positive', () => {
    const { error, value } = appliquerRemiseSchema.validate({ remise: 500 });
    expect(error).toBeUndefined();
    expect(value.remise).toBe(500);
  });

  it('accepte une remise nulle', () => {
    const { error } = appliquerRemiseSchema.validate({ remise: 0 });
    expect(error).toBeUndefined();
  });

  it('rejette une remise négative', () => {
    const { error } = appliquerRemiseSchema.validate({ remise: -100 });
    expect(error).toBeDefined();
  });

  it('rejette une remise manquante', () => {
    const { error } = appliquerRemiseSchema.validate({});
    expect(error).toBeDefined();
  });

  it('rejette une remise non numérique', () => {
    const { error } = appliquerRemiseSchema.validate({ remise: 'gratuit' });
    expect(error).toBeDefined();
  });
});
