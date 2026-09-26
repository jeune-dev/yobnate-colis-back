const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Colis,
  Ville,
  ActivityLog,
  Facture,
  PointCollecte,
  Reclamation,
  DemandeEnlevement,
} = require('../../../models');
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
  static getKpis = async ({ dateDebut, dateFin } = {}) => {
    const fin = dateFin ? new Date(dateFin) : new Date();
    const debut = dateDebut ? new Date(dateDebut) : new Date(fin.getTime() - 30 * 24 * 3600 * 1000);
    const cle = `dashboard:kpis:${debut.toISOString().slice(0, 10)}:${fin.toISOString().slice(0, 10)}`;
    const enCache = cache.get(cle);
    if (enCache) return enCache;

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
    cache.set(cle, result, DashboardService.STATS_TTL);
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

  /** Statistiques globales : comptes, expéditions, chiffre d'affaires par devise. */
  static getStatsGlobales = async () => {
    const cached = cache.get('dashboard:stats');
    if (cached) return cached;

    const [
      totalClients,
      clientsActifs,
      totalPersonnel,
      totalAdmins,
      totalColis,
      colisEnRetard,
      colisEnSouffrance,
      nouveauxClientsToday,
      nouveauxClientsWeek,
      nouveauxClientsMois,
      nouveauxColisToday,
      nouveauxColisWeek,
      nouveauxColisMois,
      reclamationsOuvertes,
      enlevementsEnAttente,
      parStatut,
      chiffreAffaires,
    ] = await Promise.all([
      User.count({ where: { role: 'client' } }),
      User.count({ where: { role: 'client', isActive: true } }),
      User.count({ where: { role: { [Op.in]: ['coursier', 'agent_point'] } } }),
      User.count({ where: { role: { [Op.in]: ['admin', 'super_admin'] } } }),
      Colis.count(),
      Colis.count({
        where: {
          dateLivraisonEstimee: { [Op.lt]: new Date().toISOString().slice(0, 10) },
          statut: { [Op.notIn]: ['livre', 'recupere', 'retourne', 'annule'] },
        },
      }),
      Colis.count({
        where: {
          statut: 'disponible_retrait',
          dateLimiteRetrait: { [Op.lt]: new Date().toISOString().slice(0, 10) },
        },
      }),
      User.count({
        where: { role: 'client', createdAt: { [Op.gte]: DashboardService.startOfToday() } },
      }),
      User.count({
        where: { role: 'client', createdAt: { [Op.gte]: DashboardService.startOfWeek() } },
      }),
      User.count({
        where: { role: 'client', createdAt: { [Op.gte]: DashboardService.startOfMonth() } },
      }),
      Colis.count({ where: { createdAt: { [Op.gte]: DashboardService.startOfToday() } } }),
      Colis.count({ where: { createdAt: { [Op.gte]: DashboardService.startOfWeek() } } }),
      Colis.count({ where: { createdAt: { [Op.gte]: DashboardService.startOfMonth() } } }),
      Reclamation.count({ where: { statut: { [Op.notIn]: ['resolue', 'rejetee', 'cloturee'] } } }),
      DemandeEnlevement.count({ where: { statut: { [Op.in]: ['demande', 'planifie'] } } }),
      DashboardService.computeColisParStatut(),
      Facture.findAll({
        attributes: ['devise', [sequelize.fn('SUM', sequelize.col('montantPaye')), 'total']],
        group: ['devise'],
        raw: true,
      }),
    ]);

    const statutCount = (statut) => parStatut.find((s) => s.statut === statut)?.total || 0;
    const livres = statutCount('livre');
    const recuperes = statutCount('recupere');
    const annules = statutCount('annule');

    const result = {
      message: 'Statistiques globales',
      stats: {
        clients: {
          total: totalClients,
          actifs: clientsActifs,
          nouveauxAujourdhui: nouveauxClientsToday,
          nouveauxCetteSemaine: nouveauxClientsWeek,
          nouveauxCeMois: nouveauxClientsMois,
        },
        equipe: { personnel: totalPersonnel, administrateurs: totalAdmins },
        colis: {
          total: totalColis,
          parStatut,
          enRetard: colisEnRetard,
          enSouffrance: colisEnSouffrance,
          nouveauxAujourdhui: nouveauxColisToday,
          nouveauxCetteSemaine: nouveauxColisWeek,
          nouveauxCeMois: nouveauxColisMois,
          tauxLivraison: totalColis ? Number(((livres / totalColis) * 100).toFixed(1)) : 0,
          tauxRecuperation: totalColis ? Number(((recuperes / totalColis) * 100).toFixed(1)) : 0,
          tauxAnnulation: totalColis ? Number(((annules / totalColis) * 100).toFixed(1)) : 0,
        },
        chiffreAffaires: chiffreAffaires.map((r) => ({
          devise: r.devise,
          encaisse: Number(r.total || 0),
        })),
        alertes: { reclamationsOuvertes, enlevementsEnAttente },
      },
    };

    cache.set('dashboard:stats', result, DashboardService.STATS_TTL);
    return result;
  };

  static getColisParStatut = async () => ({
    message: 'Répartition des expéditions par statut',
    parStatut: await DashboardService.computeColisParStatut(),
  });

  /** Vue par pays : volumétrie et état du réseau, France et Sénégal côte à côte. */
  static getVueParPays = async () => {
    const cached = cache.get('dashboard:pays');
    if (cached) return cached;

    const resultat = await Promise.all(
      Object.keys(PAYS).map(async (code) => {
        const [expeditionsDepart, expeditionsArrivee, points, colisEnStock, clients] =
          await Promise.all([
            Colis.count({ where: { paysDepart: code } }),
            Colis.count({ where: { paysArrivee: code } }),
            PointCollecte.count({ where: { pays: code, isActive: true } }),
            PointCollecte.sum('colisEnStock', { where: { pays: code } }),
            User.count({ where: { role: 'client', pays: code } }),
          ]);
        return {
          pays: code,
          libelle: PAYS[code].libelle,
          devise: PAYS[code].devise,
          expeditionsDepart,
          expeditionsArrivee,
          pointsActifs: points,
          colisEnStock: Number(colisEnStock || 0),
          clients,
        };
      })
    );

    const result = { message: 'Vue par pays', pays: resultat };
    cache.set('dashboard:pays', result, DashboardService.STATS_TTL);
    return result;
  };

  static getUtilisateursActifs = async (limit = 10) => {
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

  static getVillesFrequentes = async (field, limit = 10) => {
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
