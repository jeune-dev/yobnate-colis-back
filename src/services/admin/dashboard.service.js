const { Op } = require('sequelize');
const { sequelize, User, Colis, Ville, ActivityLog } = require('../../models');

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));
const startOfWeek = () => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const COLIS_STATUTS = ['en_attente', 'en_preparation', 'en_transit', 'arrive', 'recupere', 'livre', 'annule'];

const computeColisParStatut = async () => {
  const rows = await Colis.findAll({
    attributes: ['statut', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    group: ['statut']
  });
  const counts = Object.fromEntries(rows.map((r) => [r.statut, Number(r.get('total'))]));
  return COLIS_STATUTS.map((statut) => ({ statut, total: counts[statut] || 0 }));
};

const getStatsGlobales = async () => {
  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    totalAdmins,
    activeAdmins,
    totalColis,
    colisEnRetard,
    nouveauxUsersToday,
    nouveauxUsersWeek,
    nouveauxUsersMonth,
    nouveauxColisToday,
    nouveauxColisWeek,
    nouveauxColisMonth
  ] = await Promise.all([
    User.count({ where: { role: 'client' } }),
    User.count({ where: { role: 'client', isActive: true } }),
    User.count({ where: { role: 'client', isActive: false } }),
    User.count({ where: { role: { [Op.in]: ['admin', 'super_admin'] } } }),
    User.count({ where: { role: { [Op.in]: ['admin', 'super_admin'] }, isActive: true } }),
    Colis.count(),
    Colis.count({
      where: {
        dateLivraisonEstimee: { [Op.lt]: new Date() },
        statut: { [Op.notIn]: ['livre', 'recupere', 'annule'] }
      }
    }),
    User.count({ where: { role: 'client', createdAt: { [Op.gte]: startOfToday() } } }),
    User.count({ where: { role: 'client', createdAt: { [Op.gte]: startOfWeek() } } }),
    User.count({ where: { role: 'client', createdAt: { [Op.gte]: startOfMonth() } } }),
    Colis.count({ where: { createdAt: { [Op.gte]: startOfToday() } } }),
    Colis.count({ where: { createdAt: { [Op.gte]: startOfWeek() } } }),
    Colis.count({ where: { createdAt: { [Op.gte]: startOfMonth() } } })
  ]);

  const parStatut = await computeColisParStatut();
  const statutCount = (statut) => parStatut.find((s) => s.statut === statut)?.total || 0;
  const livres = statutCount('livre');
  const recuperes = statutCount('recupere');
  const annules = statutCount('annule');

  return {
    message: 'Statistiques globales du tableau de bord',
    stats: {
      utilisateurs: {
        total: totalUsers,
        actifs: activeUsers,
        desactives: inactiveUsers,
        nouveauxAujourdhui: nouveauxUsersToday,
        nouveauxCetteSemaine: nouveauxUsersWeek,
        nouveauxCeMois: nouveauxUsersMonth
      },
      administrateurs: { total: totalAdmins, actifs: activeAdmins },
      colis: {
        total: totalColis,
        parStatut,
        enRetard: colisEnRetard,
        nouveauxAujourdhui: nouveauxColisToday,
        nouveauxCetteSemaine: nouveauxColisWeek,
        nouveauxCeMois: nouveauxColisMonth,
        tauxLivraison: totalColis ? Number(((livres / totalColis) * 100).toFixed(1)) : 0,
        tauxRecuperation: totalColis ? Number(((recuperes / totalColis) * 100).toFixed(1)) : 0,
        tauxAnnulation: totalColis ? Number(((annules / totalColis) * 100).toFixed(1)) : 0
      }
    }
  };
};

const getColisParStatut = async () => ({
  message: 'Répartition des colis par statut',
  parStatut: await computeColisParStatut()
});

const getUtilisateursActifs = async (limit = 10) => {
  const rows = await Colis.findAll({
    attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('Colis.id')), 'nbColis']],
    include: [{ model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email'] }],
    group: ['userId', 'client.id'],
    order: [[sequelize.literal('"nbColis"'), 'DESC']],
    limit
  });
  return {
    message: 'Utilisateurs les plus actifs',
    utilisateurs: rows.map((r) => ({ client: r.client, nbColis: Number(r.get('nbColis')) }))
  };
};

const getVillesFrequentes = async (field, limit = 10) => {
  const rows = await Colis.findAll({
    attributes: [field, [sequelize.fn('COUNT', sequelize.col('Colis.id')), 'total']],
    include: [{ model: Ville, as: field === 'villeDepartId' ? 'villeDepart' : 'villeArrivee', attributes: ['id', 'nom'] }],
    group: [field, field === 'villeDepartId' ? 'villeDepart.id' : 'villeArrivee.id'],
    order: [[sequelize.literal('"total"'), 'DESC']],
    limit
  });
  const villes = rows.map((r) => ({
    ville: field === 'villeDepartId' ? r.villeDepart : r.villeArrivee,
    total: Number(r.get('total'))
  }));
  return {
    message: field === 'villeDepartId' ? 'Villes de départ les plus utilisées' : 'Destinations les plus fréquentes',
    villes
  };
};

const getDernieresActivites = async (limit = 20) => {
  const activites = await ActivityLog.findAll({
    include: [{ model: User, attributes: ['id', 'nom', 'prenom', 'role'] }],
    order: [['createdAt', 'DESC']],
    limit
  });
  return { message: 'Dernières activités', activites };
};

const getDerniersUtilisateurs = async (limit = 10) => {
  const utilisateurs = await User.findAll({
    where: { role: 'client' },
    attributes: { exclude: ['password'] },
    order: [['createdAt', 'DESC']],
    limit
  });
  return { message: 'Derniers utilisateurs inscrits', utilisateurs };
};

const getDerniersColis = async (limit = 10) => {
  const colis = await Colis.findAll({
    include: [
      { model: User, as: 'client', attributes: ['id', 'nom', 'prenom'] },
      { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
      { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] }
    ],
    order: [['createdAt', 'DESC']],
    limit
  });
  return { message: 'Derniers colis créés', colis };
};

module.exports = {
  getStatsGlobales,
  getColisParStatut,
  getUtilisateursActifs,
  getVillesFrequentes,
  getDernieresActivites,
  getDerniersUtilisateurs,
  getDerniersColis
};
