const { Op } = require('sequelize');
const { sequelize, SimulationDevis } = require('../../../models');
const logger = require('../../../utils/logger');

/**
 * Taux de conversion (cahier des charges, tableau de bord) : chaque simulation de
 * devis est conservée, puis rattachée à l'expédition qu'elle a fait naître.
 *
 * Rattachement : la simulation désignée par le client (`simulationId`), sinon la
 * dernière simulation non convertie du même compte ou du même visiteur sur les
 * 30 derniers jours. L'enregistrement ne doit jamais faire échouer la simulation ni
 * la commande : les erreurs sont journalisées et absorbées.
 */
class SimulationService {
  static FENETRE_JOURS = 30;

  static enregistrer = async ({ userId = null, visiteurId = null, params = {}, devis }) => {
    try {
      const meilleure = devis?.offres?.[0];
      const simulation = await SimulationDevis.create({
        userId,
        visiteurId,
        categorie: params.categorie || devis?.categorie?.code || null,
        paysDepart: devis?.origine?.pays || null,
        paysArrivee: devis?.destination?.pays || null,
        montantEstime: meilleure?.montants?.total ?? null,
        devise: meilleure?.devise || null,
        nbOffres: devis?.offres?.length || 0,
      });
      return simulation.id;
    } catch (err) {
      logger.warn('Simulation non enregistrée', { message: err.message });
      return null;
    }
  };

  /** Rattache une expédition à la simulation dont elle est issue. */
  static rattacher = async ({ colisId, userId, visiteurId = null, simulationId = null }) => {
    try {
      const depuis = new Date(Date.now() - SimulationService.FENETRE_JOURS * 24 * 3600 * 1000);
      const auteur = [{ userId }];
      if (visiteurId) auteur.push({ visiteurId });
      const candidate =
        (simulationId &&
          (await SimulationDevis.findOne({
            where: { id: simulationId, colisId: null, [Op.or]: [...auteur, { userId: null }] },
            attributes: ['id'],
          }))) ||
        (await SimulationDevis.findOne({
          where: { colisId: null, createdAt: { [Op.gte]: depuis }, [Op.or]: auteur },
          attributes: ['id'],
          order: [['createdAt', 'DESC']],
        }));
      if (!candidate) return false;
      // Condition « encore libre » : deux commandes simultanées ne se partagent pas une simulation
      const [nb] = await SimulationDevis.update(
        { colisId, convertiLe: new Date(), userId },
        { where: { id: candidate.id, colisId: null } }
      );
      return nb === 1;
    } catch (err) {
      logger.warn('Simulation non rattachée à la commande', { colisId, message: err.message });
      return false;
    }
  };

  /** Indicateurs de conversion d'une période. */
  static statistiques = async ({ debut, fin }) => {
    const replacements = { debut, fin };
    const [[[simulations]], [[commandes]], [[visiteurs]], [parCategorie]] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "colisId" IS NOT NULL)::int AS converties,
                COUNT(*) FILTER (WHERE "userId" IS NULL AND "colisId" IS NULL)::int
                  AS "sansCompteNonConverties"
           FROM simulations_devis WHERE "createdAt" BETWEEN :debut AND :fin`,
        { replacements }
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(s.id)::int AS "issuesDeSimulation"
           FROM colis c
           LEFT JOIN simulations_devis s ON s."colisId" = c.id
          WHERE c."createdAt" BETWEEN :debut AND :fin AND c.statut <> 'brouillon'`,
        { replacements }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT v."visiteurId")::int AS visiteurs,
                (SELECT COUNT(DISTINCT s."visiteurId") FROM simulations_devis s
                  WHERE s."visiteurId" IS NOT NULL AND s."colisId" IS NOT NULL
                    AND s."createdAt" BETWEEN :debut AND :fin)::int AS "visiteursConvertis"
           FROM visites v WHERE v.debut BETWEEN :debut AND :fin`,
        { replacements }
      ),
      sequelize.query(
        `SELECT categorie, COUNT(*)::int AS simulations,
                COUNT(*) FILTER (WHERE "colisId" IS NOT NULL)::int AS converties
           FROM simulations_devis WHERE "createdAt" BETWEEN :debut AND :fin
          GROUP BY categorie ORDER BY simulations DESC`,
        { replacements }
      ),
    ]);
    const taux = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);
    return {
      periode: { debut, fin },
      simulations: simulations.total,
      simulationsConverties: simulations.converties,
      simulationsSansCompteAbandonnees: simulations.sansCompteNonConverties,
      tauxConversionSimulations: taux(simulations.converties, simulations.total),
      commandes: commandes.total,
      partCommandesIssuesDeSimulation: taux(commandes.issuesDeSimulation, commandes.total),
      visiteurs: visiteurs.visiteurs,
      tauxConversionVisiteurs: taux(visiteurs.visiteursConvertis, visiteurs.visiteurs),
      parCategorie: parCategorie.map((c) => ({
        ...c,
        tauxConversion: taux(c.converties, c.simulations),
      })),
    };
  };

  /** Conservation limitée (13 mois), comme les visites. */
  static purger = (mois = 13) =>
    SimulationDevis.destroy({
      where: {
        createdAt: { [Op.lt]: new Date(Date.now() - mois * 30.5 * 24 * 3600 * 1000) },
      },
    });
}

module.exports = SimulationService;
