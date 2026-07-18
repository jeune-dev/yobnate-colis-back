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
      kill_timeout: 10000,
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
      },
    },
  ],
};
