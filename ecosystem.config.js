module.exports = {
  apps: [
    {
      name: 'yobante-colis-api',
      script: 'src/server.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,
      // Arrêt propre : le serveur attend jusqu'à 10 s les requêtes et envois en cours
      kill_timeout: 15000,
      listen_timeout: 8000,
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_file: 'logs/pm2-combined.log',
      time: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        // Chaque worker ouvre jusqu'à DB_POOL_MAX connexions : total = workers × DB_POOL_MAX,
        // à garder sous max_connections de PostgreSQL (100 par défaut). Réglez
        // PM2_INSTANCES et DB_POOL_MAX ensemble (ex. 4 workers × 15 = 60).
      },
    },
  ],
};
