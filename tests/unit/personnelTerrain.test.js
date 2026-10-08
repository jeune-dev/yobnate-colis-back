/**
 * Personnel de terrain : chaque rôle n'enregistre que les événements de sa
 * mission, et seulement ceux qu'autorise l'état actuel du colis.
 */
const { evenementsAutorises, EVENEMENTS_SUIVI } = require('../../src/config/colis');
const ColisService = require('../../src/modules/colis/service/colisAdmin.service');
const { pieceSchema } = require('../../src/modules/colis/validation/colis.validation');

const codes = (colis, role) => ColisService.evenementsPossibles(colis, { role }).map((e) => e.code);

describe('Événements autorisés par rôle', () => {
  it("n'impose aucune restriction aux administrateurs", () => {
    expect(evenementsAutorises('admin')).toBeNull();
    expect(evenementsAutorises('super_admin')).toBeNull();
  });

  it('ne donne rien à un client ni à un rôle inconnu', () => {
    expect(evenementsAutorises('client')).toEqual([]);
    expect(evenementsAutorises('inconnu')).toEqual([]);
  });

  it('réserve la douane et le transit aux administrateurs', () => {
    for (const role of ['coursier', 'agent_point']) {
      for (const code of ['DOUANE_OK', 'DEPART_HUB', 'VALIDE', 'ANNULE']) {
        expect(evenementsAutorises(role)).not.toContain(code);
      }
    }
  });

  it("n'utilise que des codes d'événements existants", () => {
    for (const role of ['coursier', 'agent_point']) {
      for (const code of evenementsAutorises(role)) expect(EVENEMENTS_SUIVI[code]).toBeDefined();
    }
  });
});

describe('Événements possibles sur un colis', () => {
  it('propose au coursier la livraison quand le colis est en livraison', () => {
    const possibles = codes({ statut: 'en_livraison' }, 'coursier');
    expect(possibles).toEqual(expect.arrayContaining(['LIVRE', 'LIV_ECHEC', 'INFO']));
    expect(possibles).not.toContain('ENL_OK');
  });

  it("propose à l'agent la mise à disposition d'un colis arrivé", () => {
    const possibles = codes({ statut: 'arrive' }, 'agent_point');
    expect(possibles).toContain('DISPO');
    expect(possibles).not.toContain('RETIRE');
  });

  it("ne propose plus que de l'information sur un colis livré", () => {
    expect(codes({ statut: 'livre' }, 'coursier')).toEqual([
      'ENL_ECHEC',
      'LIV_ECHEC',
      'RETARD',
      'INFO',
    ]);
  });
});

describe('Dimensions d’un colis', () => {
  const piece = (longueurCm, largeurCm) =>
    pieceSchema.validate({ poidsKg: 2, longueurCm, largeurCm });

  it('refuse une largeur supérieure à la longueur', () => {
    expect(piece(40, 50).error?.message).toBe(
      'La largeur ne peut pas être supérieure à la longueur'
    );
  });

  it('accepte une base carrée ou une largeur plus petite', () => {
    expect(piece(40, 40).error).toBeUndefined();
    expect(piece(50, 40).error).toBeUndefined();
  });

  it('ne contrôle rien si une des deux dimensions manque', () => {
    expect(pieceSchema.validate({ poidsKg: 2, largeurCm: 40 }).error).toBeUndefined();
  });
});
