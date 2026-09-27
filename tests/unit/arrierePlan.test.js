/**
 * File d'envois en arrière-plan : un canal en panne ne retient pas les autres, et
 * une erreur passagère est retentée.
 */
process.env.ARRIERE_PLAN_CONCURRENCE = '2';
process.env.ARRIERE_PLAN_DELAI_REESSAI_MS = '20';

const arrierePlan = require('../../src/utils/arrierePlan');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

describe('File d’envois en arrière-plan', () => {
  test('un canal saturé (prestataire muet) ne retarde pas les emails', async () => {
    for (let i = 0; i < 10; i += 1) arrierePlan.lancer('push', () => attendre(200));
    const debut = Date.now();
    let envoyeApres = null;
    arrierePlan.lancer('email', async () => {
      envoyeApres = Date.now() - debut;
    });
    await attendre(20);
    expect(envoyeApres).not.toBeNull();
    expect(envoyeApres).toBeLessThan(20);
    expect(await arrierePlan.vider(5000)).toBe(true);
  });

  test('une erreur passagère est retentée, une erreur définitive ne l’est pas', async () => {
    let appels = 0;
    const echecs = [];
    arrierePlan.lancer(
      'email',
      async () => {
        appels += 1;
        if (appels < 3)
          throw Object.assign(new Error('SMTP indisponible'), { code: 'ECONNECTION' });
      },
      {
        tentatives: 3,
        estTransitoire: (e) => e.code === 'ECONNECTION',
        surEchec: (e) => echecs.push(e),
      }
    );
    expect(await arrierePlan.vider(5000)).toBe(true);
    expect(appels).toBe(3);
    expect(echecs).toHaveLength(0);

    let definitif = 0;
    arrierePlan.lancer(
      'email',
      async () => {
        definitif += 1;
        throw Object.assign(new Error('Adresse refusée'), { responseCode: 550 });
      },
      {
        tentatives: 3,
        estTransitoire: (e) => e.responseCode < 500,
        surEchec: (e) => echecs.push(e),
      }
    );
    expect(await arrierePlan.vider(5000)).toBe(true);
    expect(definitif).toBe(1);
    expect(echecs.map((e) => e.message)).toEqual(['Adresse refusée']);
  });
});
