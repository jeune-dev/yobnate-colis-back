const { phone } = require('../../src/validations/shared');

const validate = (value) => phone.required().validate(value);

describe('validation téléphone (France / Sénégal uniquement)', () => {
  it('accepte un numéro mobile sénégalais valide', () => {
    const { error, value } = validate('+221771234567');
    expect(error).toBeUndefined();
    expect(value).toBe('+221771234567');
  });

  it('accepte un numéro mobile français valide', () => {
    const { error, value } = validate('+33612345678');
    expect(error).toBeUndefined();
    expect(value).toBe('+33612345678');
  });

  it('rejette un pays hors périmètre (FR/SN)', () => {
    const { error } = validate('+12025550123');
    expect(error).toBeDefined();
  });

  it('rejette un numéro local sans indicatif pays', () => {
    const { error } = validate('0612345678');
    expect(error).toBeDefined();
  });

  it('rejette une chaîne qui n\'est pas un numéro', () => {
    const { error } = validate('pas-un-numero');
    expect(error).toBeDefined();
  });

  it('rejette un numéro structurellement invalide malgré un indicatif valide', () => {
    const { error } = validate('+221123');
    expect(error).toBeDefined();
  });
});
