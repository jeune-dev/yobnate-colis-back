const verrouOptimiste = require('../../src/middlewares/verrouOptimiste.middleware');

/** Exécute le middleware et renvoie l'argument transmis à next(). */
const executer = (Model, entetes = {}, params = { id: 'a1' }, options) =>
  new Promise((resolve) => {
    const req = { params, get: (nom) => entetes[nom] };
    verrouOptimiste(Model, options)(req, {}, resolve);
  });

const modele = (updatedAt) => ({
  findOne: jest.fn().mockResolvedValue(updatedAt ? { updatedAt } : null),
});

describe('verrouOptimiste', () => {
  const version = '2026-09-29T10:00:00.123Z';

  it('laisse passer une requête sans en-tête X-Version (clients existants)', async () => {
    const Model = modele(new Date());
    expect(await executer(Model)).toBeUndefined();
    expect(Model.findOne).not.toHaveBeenCalled();
  });

  it('laisse passer quand la version correspond', async () => {
    expect(await executer(modele(new Date(version)), { 'X-Version': version })).toBeUndefined();
  });

  it('refuse en 409 une version périmée (modifiée entre-temps)', async () => {
    const err = await executer(modele(new Date('2026-09-29T10:05:00.000Z')), {
      'X-Version': version,
    });
    expect(err).toMatchObject({ statusCode: 409 });
  });

  it('refuse en 400 un en-tête illisible', async () => {
    expect(await executer(modele(new Date()), { 'X-Version': 'pas-une-date' })).toMatchObject({
      statusCode: 400,
    });
  });

  it('laisse le service répondre 404 si la ligne n’existe pas', async () => {
    expect(await executer(modele(null), { 'X-Version': version })).toBeUndefined();
  });

  it('peut chercher par une autre clé (modèles d’email par code)', async () => {
    const Model = modele(new Date(version));
    await executer(
      Model,
      { 'X-Version': version },
      { code: 'bienvenue' },
      { param: 'code', cle: 'code' }
    );
    expect(Model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'bienvenue' } })
    );
  });
});
