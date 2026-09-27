/**
 * PM2 — déploiement hors Docker (bash deploy/deploy.sh pm2).
 *
 * - Les variables sont lues dans .env.prod (-r dotenv/config + DOTENV_CONFIG_PATH).
 * - Mode cluster : chaque tâche planifiée n'est exécutée que par un seul worker à
 *   chaque créneau (réservation atomique en base, src/jobs/taches.js) ; renseigner
 *   REDIS_URL pour que les limiteurs de débit soient partagés entre les workers.
 * - PM2_INSTANCES : « max » ouvre un worker par cœur, soit jusqu'à cœurs × DB_POOL_MAX
 *   connexions PostgreSQL (16 cœurs × 10 = 160 > 100, max_connections par défaut :
 *   « too many clients »). Fixer PM2_INSTANCES explicitement en production.
 */
module.exports = {
  apps: [
    {
      name: 'yobante-colis-api',
      script: 'src/server.js',
      node_args: '-r dotenv/config',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,
      // Supérieur à l'arrêt gracieux de l'application (requêtes, envois en attente, pool)
      kill_timeout: 15000,
      listen_timeout: 10000,
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: '.env.prod',
        // Chaque worker ouvre jusqu'à DB_POOL_MAX connexions : total = workers × DB_POOL_MAX,
        // à garder sous max_connections de PostgreSQL (100 par défaut). Réglez
        // PM2_INSTANCES et DB_POOL_MAX ensemble (ex. 4 workers × 15 = 60).
      },
    },
  ],
};
