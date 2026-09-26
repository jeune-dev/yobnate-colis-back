const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Dernière exécution de chaque tâche planifiée (jobs/taches.js).
 *
 * Le serveur tourne en plusieurs processus (PM2 en cluster, plusieurs conteneurs) :
 * sans ce registre, chaque processus exécutait les tâches, et les relances de
 * factures ou les alertes partaient autant de fois qu'il y a de processus. Une tâche
 * n'est lancée que par le processus qui réussit à « réserver » son créneau par un
 * UPDATE conditionnel, atomique dans PostgreSQL.
 */
const TachePlanifiee = sequelize.define(
  'TachePlanifiee',
  {
    nom: { type: DataTypes.STRING(60), primaryKey: true },
    derniereExecution: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: 'taches_planifiees', timestamps: false }
);

module.exports = TachePlanifiee;
