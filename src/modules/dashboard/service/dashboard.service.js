const { Op } = require('sequelize');
const { sequelize, User, Colis, Ville, ActivityLog, Facture } = require('../../../models');
const cache = require('../../../utils/cache');
const { STATUTS_COLIS } = require('../../../config/colis');
const { PAYS } = require('../../../config/pays');

/**
 * Tableau de bord administrateur.
 * Les agrégats les plus coûteux sont mis en cache une minute : un dashboard est
 * consulté en continu et n'a pas besoin d'une exactitude à la seconde près.
 */

class DashboardService {
  static STATS_TTL = 60 * 1000;

  static startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));
  static startOfWeek = () => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  static startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  /**
   * Indicateurs commerciaux de l'activité expédition sur une période (30 jours
   * par défaut) : ventes et panier moyen par devise, revenu par client, taux de
   * fidélisation, part des commandes passées par de nouveaux clients, répartition
   * par catégorie et demandes en attente d'étude.
   */
  static getKpis = ({ dateDebut, dateFin } = {}) => {
    const fin = dateFin ? new Date(dateFin) : new Date();
    const debut = dateDebut ? new Date(dateDebut) : new Date(fin.getTime() - 30 * 24 * 3600 * 1000);
    const cle = `dashboard:kpis:${debut.toISOString().slice(0, 10)}:${fin.toISOString().slice(0, 10)}`;
    return cache.memoiser(cle, DashboardService.STATS_TTL, () =>
      DashboardService.calculerKpis(debut, fin)
    );
  };

  static calculerKpis = async (debut, fin) => {
    const replacements = { debut, fin };
    const valides = `c."statut" NOT IN ('annule', 'refuse') AND c."createdAt" BETWEEN :debut AND :fin`;

    const [[ventes], [clients], [categories], [etude]] = await Promise.all([
      sequelize.query(
        `SELECT c."devise", COUNT(*)::int AS "commandes",
                COALESCE(SUM(c."montantTotal"), 0)::float AS "chiffreAffaires",
                COALESCE(AVG(NULLIF(c."montantTotal", 0)), 0)::float AS "panierMoyen",
                COUNT(DISTINCT c."userId")::int AS "clients"
           FROM colis c WHERE ${valides} GROUP BY c."devise"`,
        { replacements }
      ),
      sequelize.query(
        `WITH periode AS (
           SELECT c."userId", COUNT(*) AS n FROM colis c WHERE ${valides} GROUP BY c."userId"
         ), premieres AS (
           SELECT "userId", MIN("createdAt") AS premiere FROM colis
            WHERE "statut" NOT IN ('annule', 'refuse') GROUP BY "userId"
         )
         SELECT COUNT(*)::int AS "clientsActifs",
                COUNT(*) FILTER (WHERE p.n >= 2)::int AS "clientsRecurrents",
                COUNT(*) FILTER (WHERE pr.premiere BETWEEN :debut AND :fin)::int AS "nouveauxClients",
                COALESCE(SUM(p.n) FILTER (WHERE pr.premiere BETWEEN :debut AND :fin), 0)::int
                  AS "commandesNouveauxClients",
                COALESCE(SUM(p.n), 0)::int AS "commandes"
           FROM periode p JOIN premieres pr ON pr."userId" = p."userId"`,
        { replacements }
      ),
      sequelize.query(
        `SELECT c."categorie", COUNT(*)::int AS "total" FROM colis c WHERE ${valides}
          GROUP BY c."categorie"`,
        { replacements }
      ),
      sequelize.query(
        `SELECT COUNT(*) FILTER (WHERE "statut" = 'en_attente_validation')::int AS "aEtudier",
                COUNT(*) FILTER (WHERE "statut" = 'en_attente_validation'
                                   AND "dateLimiteEtude" < NOW())::int AS "etudeEnRetard",
                COUNT(*) FILTER (WHERE "statut" = 'devis_propose')::int AS "propositionsEnAttente"
           FROM colis`
      ),
    ]);

    const c = clients[0] || {};
    const taux = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : 0);
    const result = {
      message: 'Indicateurs de performance',
      kpis: {
        periode: { debut, fin },
        ventes: ventes.map((v) => ({
          ...v,
          revenuParClient: v.clients ? Number((v.chiffreAffaires / v.clients).toFixed(2)) : 0,
        })),
        clientsActifs: c.clientsActifs || 0,
        tauxFidelisation: taux(c.clientsRecurrents, c.clientsActifs),
        nouveauxClients: c.nouveauxClients || 0,
        partCommandesNouveauxClients: taux(c.commandesNouveauxClients, c.commandes),
        parCategorie: categories,
        etude: etude[0],
      },
    };
    return result;
  };

  static computeColisParStatut = async () => {
    const rows = await Colis.findAll({
      attributes: ['statut', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      group: ['statut'],
    });
    const counts = Object.fromEntries(rows.map((r) => [r.statut, Number(r.get('total'))]));
    return STATUTS_COLIS.map((statut) => ({ statut, total: counts[statut] || 0 }));
  };

  /**
   * Statistiques globales : comptes, expéditions, chiffre d'affaires par devise.
   *
   * Quatre requêtes agrégées (un seul parcours par table grâce à FILTER) au lieu
   * de dix-sept COUNT lancés simultanément : un seul affichage du tableau de bord
   * mobilisait alors plus de connexions que n'en compte le pool (10), bloquant
   * toutes les autres requêtes de l'API pendant le calcul.
   */
  static getStatsGlobales = () =>
    cache.memoiser('dashboard:stats', DashboardService.STATS_TTL, async () => {
      const replacements = {
        aujourdhui: new Date().toISOString().slice(0, 10),
        debutJour: DashboardService.startOfToday(),
        debutSemaine: DashboardService.startOfWeek(),
        debutMois: DashboardService.startOfMonth(),
      };
      const [[[comptes]], [statuts], [[alertes]], chiffreAffaires] = await Promise.all([
        sequelize.query(
          `SELECT COUNT(*) FILTER (WHERE role = 'client')::int AS "totalClients",
                  COUNT(*) FILTER (WHERE role = 'client' AND "isActive")::int AS "clientsActifs",
                  COUNT(*) FILTER (WHERE role IN ('coursier', 'agent_point'))::int AS "totalPersonnel",
                  COUNT(*) FILTER (WHERE role IN ('admin', 'super_admin'))::int AS "totalAdmins",
                  COUNT(*) FILTER (WHERE role = 'client' AND "createdAt" >= :debutJour)::int AS "nouveauxJour",
                  COUNT(*) FILTER (WHERE role = 'client' AND "createdAt" >= :debutSemaine)::int AS "nouveauxSemaine",
                  COUNT(*) FILTER (WHERE role = 'client' AND "createdAt" >= :debutMois)::int AS "nouveauxMois"
             FROM users`,
          { replacements }
        ),
        sequelize.query(
          `SELECT statut::text AS statut, COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE "dateLivraisonEstimee" < :aujourdhui
                    AND statut NOT IN ('livre', 'recupere', 'retourne', 'annule'))::int AS "enRetard",
                  COUNT(*) FILTER (WHERE statut = 'disponible_retrait'
                    AND "dateLimiteRetrait" < :aujourdhui)::int AS "enSouffrance",
                  COUNT(*) FILTER (WHERE "createdAt" >= :debutJour)::int AS "nouveauxJour",
                  COUNT(*) FILTER (WHERE "createdAt" >= :debutSemaine)::int AS "nouveauxSemaine",
                  COUNT(*) FILTER (WHERE "createdAt" >= :debutMois)::int AS "nouveauxMois"
             FROM colis GROUP BY statut`,
          { replacements }
        ),
        sequelize.query(
          `SELECT (SELECT COUNT(*) FROM reclamations
                    WHERE statut NOT IN ('resolue', 'rejetee', 'cloturee'))::int AS "reclamationsOuvertes",
                  (SELECT COUNT(*) FROM demandes_enlevement
                    WHERE statut IN ('demande', 'planifie'))::int AS "enlevementsEnAttente"`
        ),
        Facture.findAll({
          attributes: ['devise', [sequelize.fn('SUM', sequelize.col('montantPaye')), 'total']],
          group: ['devise'],
          raw: true,
        }),
      ]);

      const somme = (champ) => statuts.reduce((total, ligne) => total + ligne[champ], 0);
      const counts = Object.fromEntries(statuts.map((l) => [l.statut, l.total]));
      const parStatut = STATUTS_COLIS.map((statut) => ({ statut, total: counts[statut] || 0 }));
      const totalColis = somme('total');
      const taux = (n) => (totalColis ? Number(((n / totalColis) * 100).toFixed(1)) : 0);

      return {
        message: 'Statistiques globales',
        stats: {
          clients: {
            total: comptes.totalClients,
            actifs: comptes.clientsActifs,
            nouveauxAujourdhui: comptes.nouveauxJour,
            nouveauxCetteSemaine: comptes.nouveauxSemaine,
            nouveauxCeMois: comptes.nouveauxMois,
          },
          equipe: { personnel: comptes.totalPersonnel, administrateurs: comptes.totalAdmins },
          colis: {
            total: totalColis,
            parStatut,
            enRetard: somme('enRetard'),
            enSouffrance: somme('enSouffrance'),
            nouveauxAujourdhui: somme('nouveauxJour'),
            nouveauxCetteSemaine: somme('nouveauxSemaine'),
            nouveauxCeMois: somme('nouveauxMois'),
            tauxLivraison: taux(counts.livre || 0),
            tauxRecuperation: taux(counts.recupere || 0),
            tauxAnnulation: taux(counts.annule || 0),
          },
          chiffreAffaires: chiffreAffaires.map((r) => ({
            devise: r.devise,
            encaisse: Number(r.total || 0),
          })),
          alertes: {
            reclamationsOuvertes: alertes.reclamationsOuvertes,
            enlevementsEnAttente: alertes.enlevementsEnAttente,
          },
        },
      };
    });

  static getColisParStatut = async () => ({
    message: 'Répartition des expéditions par statut',
    parStatut: await DashboardService.computeColisParStatut(),
  });

  /**
   * Vue par pays : volumétrie et état du réseau, France et Sénégal côte à côte.
   * Trois requêtes groupées par pays au lieu de cinq COUNT par pays.
   */
  static getVueParPays = () =>
    cache.memoiser('dashboard:pays', DashboardService.STATS_TTL, async () => {
      const [[flux], [points], [clients]] = await Promise.all([
        sequelize.query(
          `SELECT 'depart' AS sens, "paysDepart"::text AS pays, COUNT(*)::int AS total
             FROM colis GROUP BY "paysDepart"
           UNION ALL
           SELECT 'arrivee', "paysArrivee"::text, COUNT(*)::int FROM colis GROUP BY "paysArrivee"`
        ),
        sequelize.query(
          `SELECT pays::text AS pays, COUNT(*) FILTER (WHERE "isActive")::int AS actifs,
                  COALESCE(SUM("colisEnStock"), 0)::int AS stock
             FROM points_collecte GROUP BY pays`
        ),
        sequelize.query(
          `SELECT pays::text AS pays, COUNT(*)::int AS total FROM users
            WHERE role = 'client' GROUP BY pays`
        ),
      ]);
      const trouver = (lignes, filtre) => lignes.find(filtre) || {};

      const pays = Object.keys(PAYS).map((code) => ({
        pays: code,
        libelle: PAYS[code].libelle,
        devise: PAYS[code].devise,
        expeditionsDepart: trouver(flux, (l) => l.sens === 'depart' && l.pays === code).total || 0,
        expeditionsArrivee:
          trouver(flux, (l) => l.sens === 'arrivee' && l.pays === code).total || 0,
        pointsActifs: trouver(points, (l) => l.pays === code).actifs || 0,
        colisEnStock: trouver(points, (l) => l.pays === code).stock || 0,
        clients: trouver(clients, (l) => l.pays === code).total || 0,
      }));
      return { message: 'Vue par pays', pays };
    });

  /** Agrégat sur toute la table des colis (170 ms mesurées sur 200 000 lignes) : mis en cache. */
  /** `limit` vient de la query string : borné pour ne pas multiplier les clés de cache. */
  static borner = (limit) => Math.min(Math.max(Number(limit) || 10, 1), 100);

  static getUtilisateursActifs = (limit = 10) => {
    const n = DashboardService.borner(limit);
    return cache.memoiser(`dashboard:actifs:${n}`, DashboardService.STATS_TTL, () =>
      DashboardService.calculerUtilisateursActifs(n)
    );
  };

  static calculerUtilisateursActifs = async (limit) => {
    const rows = await Colis.findAll({
      attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('Colis.id')), 'nbColis']],
      include: [
        { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email', 'typeCompte'] },
      ],
      group: ['userId', 'client.id'],
      order: [[sequelize.literal('"nbColis"'), 'DESC']],
      limit,
    });
    return {
      message: 'Clients les plus actifs',
      utilisateurs: rows.map((r) => ({ client: r.client, nbColis: Number(r.get('nbColis')) })),
    };
  };

  static getVillesFrequentes = (field, limit = 10) => {
    const n = DashboardService.borner(limit);
    return cache.memoiser(`dashboard:villes:${field}:${n}`, DashboardService.STATS_TTL, () =>
      DashboardService.calculerVillesFrequentes(field, n)
    );
  };

  static calculerVillesFrequentes = async (field, limit) => {
    const alias = field === 'villeDepartId' ? 'villeDepart' : 'villeArrivee';
    const rows = await Colis.findAll({
      attributes: [field, [sequelize.fn('COUNT', sequelize.col('Colis.id')), 'total']],
      include: [{ model: Ville, as: alias, attributes: ['id', 'nom', 'pays'] }],
      group: [field, `${alias}.id`],
      order: [[sequelize.literal('"total"'), 'DESC']],
      limit,
    });
    const villes = rows.map((r) => ({ ville: r[alias], total: Number(r.get('total')) }));
    return {
      message:
        field === 'villeDepartId'
          ? 'Villes de départ les plus utilisées'
          : 'Destinations les plus fréquentes',
      villes,
    };
  };

  static getDernieresActivites = async (limit = 20) => {
    const activites = await ActivityLog.findAll({
      include: [{ model: User, attributes: ['id', 'nom', 'prenom', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit,
    });
    return { message: 'Dernières activités', activites };
  };

  static getDerniersUtilisateurs = async (limit = 10) => {
    const utilisateurs = await User.findAll({
      where: { role: 'client' },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit,
    });
    return { message: 'Derniers clients inscrits', utilisateurs };
  };

  static getDerniersColis = async (limit = 10) => {
    const colis = await Colis.findAll({
      include: [
        { model: User, as: 'client', attributes: ['id', 'nom', 'prenom'] },
        { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });
    return { message: 'Dernières expéditions créées', colis };
  };

  /** Expéditions requérant une action immédiate : retard, souffrance, douane bloquée. */
  static getPointsAttention = async (limit = 20) => {
    const aujourdhui = new Date().toISOString().slice(0, 10);

    const [enRetard, enSouffrance] = await Promise.all([
      Colis.findAll({
        where: {
          dateLivraisonEstimee: { [Op.lt]: aujourdhui },
          statut: { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule'] },
        },
        attributes: ['id', 'reference', 'statut', 'destinataireNom', 'dateLivraisonEstimee'],
        order: [['dateLivraisonEstimee', 'ASC']],
        limit,
      }),
      Colis.findAll({
        where: { statut: 'disponible_retrait', dateLimiteRetrait: { [Op.lt]: aujourdhui } },
        attributes: ['id', 'reference', 'destinataireNom', 'dateLimiteRetrait'],
        order: [['dateLimiteRetrait', 'ASC']],
        limit,
      }),
    ]);

    return {
      message: "Points d'attention",
      pointsAttention: {
        colisEnRetard: enRetard,
        colisEnSouffrance: enSouffrance,
      },
    };
  };
}

module.exports = DashboardService;
