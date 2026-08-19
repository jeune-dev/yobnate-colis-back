const { createColisSchema, updateColisSchema } = require('../../src/validations/colis.validation');

const VILLE_ID = '11111111-1111-1111-1111-111111111111';
const AUTRE_VILLE_ID = '22222222-2222-2222-2222-222222222222';

const validColis = {
  expediteurNom: 'Aminata Diop',
  expediteurTelephone: '+221771234567',
  villeDepartId: VILLE_ID,
  destinataireNom: 'Jean Dupont',
  destinataireTelephone: '+33612345678',
  villeArriveeId: AUTRE_VILLE_ID,
  adresseLivraison: '12 rue de la Paix, Paris',
  poids: 2.5
};

describe('createColisSchema', () => {
  it('accepte une déclaration de colis complète et valide', () => {
    const { error } = createColisSchema.validate(validColis);
    expect(error).toBeUndefined();
  });

  it('rejette un poids négatif ou nul', () => {
    const { error } = createColisSchema.validate({ ...validColis, poids: 0 });
    expect(error).toBeDefined();
  });

  it('rejette un villeDepartId qui n\'est pas un UUID', () => {
    const { error } = createColisSchema.validate({ ...validColis, villeDepartId: 'pas-un-uuid' });
    expect(error).toBeDefined();
  });

  it('rejette un téléphone hors périmètre FR/SN', () => {
    const { error } = createColisSchema.validate({ ...validColis, expediteurTelephone: '+12025550123' });
    expect(error).toBeDefined();
  });
});

describe('updateColisSchema', () => {
  it('accepte un changement de villeDepartId / villeArriveeId (recalcul du tarif côté service)', () => {
    const { error, value } = updateColisSchema.validate({ villeDepartId: VILLE_ID, villeArriveeId: AUTRE_VILLE_ID });
    expect(error).toBeUndefined();
    expect(value.villeDepartId).toBe(VILLE_ID);
    expect(value.villeArriveeId).toBe(AUTRE_VILLE_ID);
  });

  it('rejette un objet vide (au moins un champ requis)', () => {
    const { error } = updateColisSchema.validate({});
    expect(error).toBeDefined();
  });
});
