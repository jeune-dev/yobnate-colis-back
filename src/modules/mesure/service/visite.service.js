const { sequelize } = require('../../../models');

/**
 * Mesure d'audience du site vitrine et de l'application (indicateurs marketing du
 * cahier des charges : trafic, pourcentage de visiteurs connus, temps passé,
 * source du trafic).
 *
 * Une session = une ligne, mise à jour à chaque page vue et à chaque présence
 * signalée. Aucune adresse IP, aucun agent utilisateur : seulement des
 * identifiants aléatoires générés par le client et, s'il est connecté, son compte.
 */
class VisiteService {
  /** Une session inactive depuis 30 min est close : le client doit en ouvrir une autre. */
  static INACTIVITE_MINUTES = 30;
  /** Plafond du temps passé par session (onglet oublié ouvert). */
  static DUREE_MAX_SECONDES = 4 * 3600;

  /**
   * Domaines connus, par famille. Un motif terminé par un point (« google. ») vaut
   * pour toutes les extensions (google.fr, google.co.uk…) ; sinon le domaine
   * lui-même ou l'un de ses sous-domaines (m.facebook.com).
   */
  static MOTEURS = ['google.', 'bing.com', 'yahoo.', 'duckduckgo.com', 'qwant.com', 'ecosia.org'];
  static RESEAUX = [
    'facebook.com',
    'fb.com',
    'instagram.com',
    'tiktok.com',
    'linkedin.com',
    'lnkd.in',
    'twitter.com',
    'x.com',
    't.co',
    'whatsapp.com',
    'wa.me',
    'youtube.com',
    'snapchat.com',
    'pinterest.com',
    't.me',
    'telegram.org',
  ];
  static MESSAGERIES = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.'];

  static correspond = (domaine, motifs) =>
    motifs.some((motif) =>
      motif.endsWith('.')
        ? new RegExp(`(^|\\.)${motif.replace(/\./g, '\\.')}`).test(domaine)
        : domaine === motif || domaine.endsWith(`.${motif}`)
    );

  static MEDIUMS_CAMPAGNE = ['cpc', 'ppc', 'paid', 'display', 'ads', 'sponsored', 'banner'];
  static SOURCES_SOCIALES = [
    'facebook',
    'instagram',
    'tiktok',
    'whatsapp',
    'linkedin',
    'twitter',
    'x',
    'youtube',
    'snapchat',
  ];

  /** Domaine du référent, sans « www. » ; null si absent ou illisible. */
  static domaine = (url) => {
    if (!url) return null;
    try {
      return new URL(url).hostname
        .toLowerCase()
        .replace(/^www\./, '')
        .slice(0, 120);
    } catch (_err) {
      return null;
    }
  };

  /** Domaine du site lui-même : une navigation interne n'est pas une source de trafic. */
  static domaineSite = () => VisiteService.domaine(process.env.APP_PUBLIC_URL || '');

  /** Classe la provenance d'une session à partir des paramètres UTM puis du référent. */
  static classerSource = ({ referentDomaine, utmSource, utmMedium, utmCampagne }) => {
    const medium = String(utmMedium || '').toLowerCase();
    const source = String(utmSource || '').toLowerCase();
    if (medium === 'email' || medium === 'newsletter') return 'email';
    if (VisiteService.MEDIUMS_CAMPAGNE.includes(medium)) return 'campagne';
    if (VisiteService.SOURCES_SOCIALES.includes(source) || medium === 'social') {
      return 'reseau_social';
    }
    if (utmCampagne || source) return 'campagne';

    if (!referentDomaine || referentDomaine === VisiteService.domaineSite()) return 'direct';
    // Messageries avant moteurs : mail.google.com n'est pas une recherche Google
    if (VisiteService.correspond(referentDomaine, VisiteService.MESSAGERIES)) return 'email';
    if (VisiteService.correspond(referentDomaine, VisiteService.MOTEURS)) return 'recherche';
    if (VisiteService.correspond(referentDomaine, VisiteService.RESEAUX)) return 'reseau_social';
    return 'site_referent';
  };

  /**
   * Ouvre ou prolonge une session. Une session n'est prolongée que par le visiteur
   * qui l'a ouverte, et tant qu'elle n'a pas expiré ; sinon le client est invité à
   * en ouvrir une nouvelle (`sessionExpiree`).
   */
  static enregistrer = async (donnees, userId = null) => {
    const referentDomaine = VisiteService.domaine(donnees.referent);
    const source = VisiteService.classerSource({ ...donnees, referentDomaine });
    const [lignes] = await sequelize.query(
      `INSERT INTO visites (id, "visiteurId", "userId", plateforme, source, "referentDomaine",
                            "utmSource", "utmMedium", "utmCampagne", "pageEntree", "pagesVues",
                            debut, "derniereActivite", "dureeSecondes")
       VALUES (:sessionId, :visiteurId, :userId, :plateforme, :source, :referentDomaine,
               :utmSource, :utmMedium, :utmCampagne, :page, 1, NOW(), NOW(), 0)
       ON CONFLICT (id) DO UPDATE SET
         "pagesVues" = visites."pagesVues" + :increment,
         "derniereActivite" = NOW(),
         "dureeSecondes" = LEAST(EXTRACT(EPOCH FROM NOW() - visites.debut)::int, :dureeMax),
         "userId" = COALESCE(visites."userId", EXCLUDED."userId")
       WHERE visites."visiteurId" = EXCLUDED."visiteurId"
         AND visites."derniereActivite" > NOW() - make_interval(mins => :inactivite)
       RETURNING id`,
      {
        replacements: {
          sessionId: donnees.sessionId,
          visiteurId: donnees.visiteurId,
          userId: userId || null,
          plateforme: donnees.plateforme || 'web',
          source,
          referentDomaine,
          utmSource: donnees.utmSource || null,
          utmMedium: donnees.utmMedium || null,
          utmCampagne: donnees.utmCampagne || null,
          page: donnees.page || null,
          increment: donnees.evenement === 'ping' ? 0 : 1,
          dureeMax: VisiteService.DUREE_MAX_SECONDES,
          inactivite: VisiteService.INACTIVITE_MINUTES,
        },
      }
    );
    return { enregistree: lignes.length > 0, sessionExpiree: lignes.length === 0 };
  };

  /** Indicateurs marketing d'une période. */
  static statistiques = async ({ debut, fin }) => {
    const replacements = { debut, fin };
    const periode = 'debut BETWEEN :debut AND :fin';
    const [[[totaux]], [parSource], [parPlateforme], [referents], [campagnes], [parJour]] =
      await Promise.all([
        sequelize.query(
          `SELECT COUNT(*)::int AS visites,
                  COUNT(DISTINCT "visiteurId")::int AS visiteurs,
                  COALESCE(SUM("pagesVues"), 0)::int AS "pagesVues",
                  COALESCE(ROUND(AVG("dureeSecondes")), 0)::int AS "dureeMoyenneSecondes",
                  COUNT(*) FILTER (WHERE "pagesVues" <= 1)::int AS rebonds,
                  COUNT(DISTINCT "visiteurId") FILTER (WHERE "userId" IS NOT NULL)::int
                    AS "visiteursConnus"
             FROM visites WHERE ${periode}`,
          { replacements }
        ),
        sequelize.query(
          `SELECT source::text, COUNT(*)::int AS visites,
                  COUNT(DISTINCT "visiteurId")::int AS visiteurs
             FROM visites WHERE ${periode} GROUP BY source ORDER BY visites DESC`,
          { replacements }
        ),
        sequelize.query(
          `SELECT plateforme::text, COUNT(*)::int AS visites
             FROM visites WHERE ${periode} GROUP BY plateforme ORDER BY visites DESC`,
          { replacements }
        ),
        sequelize.query(
          `SELECT "referentDomaine" AS domaine, COUNT(*)::int AS visites
             FROM visites WHERE ${periode} AND "referentDomaine" IS NOT NULL
            GROUP BY "referentDomaine" ORDER BY visites DESC LIMIT 10`,
          { replacements }
        ),
        sequelize.query(
          `SELECT "utmCampagne" AS campagne, "utmSource" AS source, COUNT(*)::int AS visites
             FROM visites WHERE ${periode} AND "utmCampagne" IS NOT NULL
            GROUP BY "utmCampagne", "utmSource" ORDER BY visites DESC LIMIT 10`,
          { replacements }
        ),
        sequelize.query(
          `SELECT to_char(date_trunc('day', debut), 'YYYY-MM-DD') AS jour,
                  COUNT(*)::int AS visites, COUNT(DISTINCT "visiteurId")::int AS visiteurs
             FROM visites WHERE ${periode} GROUP BY 1 ORDER BY 1`,
          { replacements }
        ),
      ]);

    const part = (n, total) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);
    return {
      periode: { debut, fin },
      trafic: {
        visites: totaux.visites,
        visiteursUniques: totaux.visiteurs,
        pagesVues: totaux.pagesVues,
        pagesParVisite: totaux.visites ? Number((totaux.pagesVues / totaux.visites).toFixed(2)) : 0,
        tauxRebond: part(totaux.rebonds, totaux.visites),
        parJour,
      },
      pourcentageVisiteursConnus: part(totaux.visiteursConnus, totaux.visiteurs),
      tempsPasse: {
        moyenneSecondes: totaux.dureeMoyenneSecondes,
      },
      sourcesTrafic: parSource.map((s) => ({ ...s, part: part(s.visites, totaux.visites) })),
      parPlateforme,
      principauxReferents: referents,
      campagnes,
    };
  };

  /** Conservation limitée des sessions (13 mois), appelée par la tâche quotidienne. */
  static purger = async (mois = 13) => {
    const [, meta] = await sequelize.query(
      `DELETE FROM visites WHERE debut < NOW() - make_interval(months => :mois)`,
      { replacements: { mois } }
    );
    return meta?.rowCount || 0;
  };
}

module.exports = VisiteService;
