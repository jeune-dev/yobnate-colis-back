#!/bin/bash
# ─── setup-server.sh — Configuration initiale du VPS Ubuntu ─────────────────
# Exécuter une seule fois sur un serveur vierge.
set -euo pipefail

echo "=== 1. Mise à jour système ==="
apt-get update && apt-get upgrade -y

echo "=== 2. Installation Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "=== 3. Installation PM2 ==="
npm install -g pm2
pm2 startup systemd -u "$USER" --hp "$HOME"

echo "=== 4. Installation Docker ==="
apt-get install -y ca-certificates curl gnupg lsb-release
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker "$USER"

echo "=== 5. Installation Nginx ==="
apt-get install -y nginx

echo "=== 6. Installation Certbot ==="
apt-get install -y certbot python3-certbot-nginx

echo "=== 7. Pare-feu UFW ==="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== 8. Création utilisateur nodeapp ==="
id nodeapp &>/dev/null || useradd -m -s /bin/bash nodeapp

echo ""
echo "✔ Serveur configuré."
echo "Étapes suivantes :"
echo "  1. git clone <dépôt> /var/www/yobante-colis && cd /var/www/yobante-colis"
echo "  2. cp .env.example .env.prod  (remplir : secrets JWT, DB_PASSWORD, CORS_ORIGIN, RESEND_API_KEY…)"
echo "     chmod 600 .env.prod"
echo "  3. Nginx : cp deploy/nginx.conf /etc/nginx/sites-available/yobante-colis (adapter server_name)"
echo "     ln -s /etc/nginx/sites-available/yobante-colis /etc/nginx/sites-enabled/"
echo "     certbot --nginx -d api.votre-domaine.com && nginx -t && systemctl reload nginx"
echo "  4. bash deploy/deploy.sh docker"
echo "  5. docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend npm run seed"
echo "  6. Sauvegarde quotidienne (crontab -e) :"
echo "     30 2 * * * cd /var/www/yobante-colis && bash deploy/backup-postgres.sh >> /var/log/yobante-backup.log 2>&1"
