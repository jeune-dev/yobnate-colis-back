/**
 * Envoi des emails par Resend (sur le modèle de sign-back) et contenu des gabarits :
 * version texte jointe, dates au format français, adresse de réponse.
 * Client Resend simulé : aucun appel réseau.
 */

/** Charge les modules d'envoi avec un client Resend remplacé par un double. */
const charger = ({ cle = 're_test_cle', repondreA = '', reponse = null } = {}) => {
  const envois = [];
  let modules;
  jest.isolateModules(() => {
    process.env.RESEND_API_KEY = cle;
    process.env.MAIL_FROM = 'Yobante Colis <noreply@yobante.test>';
    process.env.MAIL_REPLY_TO = repondreA;
    jest.doMock('resend', () => ({
      Resend: class {
        constructor() {
          this.emails = {
            send: (m) => {
              envois.push(m);
              return Promise.resolve(reponse || { data: { id: 'id-resend' }, error: null });
            },
          };
        }
      },
    }));
    // Envoi en arrière-plan exécuté sur-le-champ, modèles personnalisés absents
    jest.doMock('../../src/utils/arrierePlan', () => ({ lancer: (_canal, tache) => tache() }));
    jest.doMock('../../src/models', () => ({
      ModeleEmail: { findAll: () => Promise.resolve([]) },
    }));
    modules = {
      resend: require('../../src/infrastructure/resend.service'),
      mailer: require('../../src/infrastructure/mailer'),
    };
  });
  return { ...modules, envois };
};

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_REPLY_TO;
});

describe('resend.service', () => {
  test('sans clé : erreur explicite, rien n est envoyé', async () => {
    const { resend, envois } = charger({ cle: '' });
    await expect(
      resend.envoyerEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' })
    ).rejects.toThrow('RESEND_API_KEY');
    expect(envois).toHaveLength(0);
  });

  test('joint une version texte déduite du HTML, liens compris', async () => {
    const { resend, envois } = charger();
    await resend.envoyerEmail({
      to: 'a@b.test',
      subject: 'Sujet',
      html: '<p>Bonjour A&amp;B,</p><p><a href="https://x.test/p?a=1&amp;b=2">Payer</a></p>',
    });
    expect(envois[0].from).toBe('Yobante Colis <noreply@yobante.test>');
    expect(envois[0].text).toBe('Bonjour A&B,\n\nPayer : https://x.test/p?a=1&b=2');
    expect(envois[0].replyTo).toBeUndefined();
  });

  test('refus de Resend : erreur avec le statut, non retentée si 4xx', async () => {
    const { resend } = charger({
      reponse: {
        data: null,
        error: { name: 'validation_error', message: 'Domaine non vérifié', statusCode: 403 },
      },
    });
    const err = await resend
      .envoyerEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' })
      .catch((e) => e);
    expect(err.statusCode).toBe(403);
    expect(resend.erreurTransitoire(err)).toBe(false);
    expect(resend.erreurTransitoire({ statusCode: 429 })).toBe(true);
    expect(resend.erreurTransitoire({ statusCode: 503 })).toBe(true);
    expect(resend.erreurTransitoire({ statusCode: null })).toBe(true);
  });
});

describe('gabarits', () => {
  test('les dates des modèles sont affichées au format français', async () => {
    const { mailer, envois } = charger();
    await mailer.envoyerModele(
      'facture_lien_paiement',
      'client@b.test',
      {
        prenom: 'Awa',
        reference: 'YC-1',
        facture: 'F-1',
        montant: '10 €',
        dateLimite: '2026-10-15',
      },
      { immediat: true }
    );
    expect(envois[0].html).toContain('15/10/2026');
    expect(envois[0].html).not.toContain('2026-10-15');
  });

  test('les dates des gabarits fixes sont au format français', async () => {
    const { mailer, envois } = charger();
    await mailer.sendFactureEmail(
      { email: 'c@b.test', prenom: 'Awa' },
      { reference: 'F-2', montantTotal: 10, devise: 'EUR', dateLimitePaiement: '2026-11-03' }
    );
    expect(envois[0].html).toContain('03/11/2026');
  });

  test('réponse à une demande de contact : répondable vers MAIL_REPLY_TO', async () => {
    const { mailer, envois } = charger({ repondreA: 'contact@yobante.test' });
    await mailer.sendReponseDemandeContactEmail(
      { email: 'c@b.test', prenom: 'Awa', message: 'Bonjour' },
      { objet: 'Votre demande', reponse: 'Merci' }
    );
    expect(envois[0].replyTo).toBe('contact@yobante.test');
    expect(envois[0].html).not.toContain('ne pas y répondre');
    expect(envois[0].html).toContain('répondre directement');
  });

  test('sans MAIL_REPLY_TO, la réponse de contact oriente vers le formulaire', async () => {
    const { mailer, envois } = charger();
    await mailer.sendReponseDemandeContactEmail(
      { email: 'c@b.test', prenom: 'Awa', message: 'Bonjour' },
      { objet: 'Votre demande', reponse: 'Merci' }
    );
    expect(envois[0].replyTo).toBeUndefined();
    expect(envois[0].html).not.toContain('ne pas y répondre');
  });
});
