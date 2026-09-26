/**
 * PM2 — déploiement hors Docker (bash deploy/deploy.sh pm2).
 *
 * - Les variables sont lues dans .env.prod (-r dotenv/config + DOTENV_CONFIG_PATH).
 * - Mode cluster : les tâches planifiées ne tournent que sur l'instance 0
 *   (src/jobs/index.js) ; renseigner REDIS_URL pour que les limiteurs de débit
 *   soient partagés entre les workers.
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
      // Supérieur au délai d'arrêt gracieux de l'application (SHUTDOWN_TIMEOUT_MS)
      kill_timeout: 12000,
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
      },
    },
  ],
};
