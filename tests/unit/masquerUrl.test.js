const masquerUrl = require('../../src/utils/masquerUrl');

describe('masquerUrl — aucun jeton en clair dans les journaux', () => {
  test.each([
    ['/auth/verify-email/abc123def', '/auth/verify-email/[MASQUÉ]'],
    ['/public/desabonnement/jeton-secret?x=1', '/public/desabonnement/[MASQUÉ]?x=1'],
    ['/verifier-email?token=abc&page=2', '/verifier-email?token=[MASQUÉ]&page=2'],
    ['/x?refreshToken=r1', '/x?refreshToken=[MASQUÉ]'],
  ])('%s', (url, attendu) => {
    expect(masquerUrl(url)).toBe(attendu);
  });

  test('une URL sans secret est inchangée', () => {
    expect(masquerUrl('/client/colis?page=2&statut=livre')).toBe(
      '/client/colis?page=2&statut=livre'
    );
  });

  test('valeur absente → chaîne vide', () => {
    expect(masquerUrl(undefined)).toBe('');
  });
});
