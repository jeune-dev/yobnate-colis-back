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
echo "Prochaine étape : cloner le projet, copier .env.prod, puis bash deploy/deploy.sh --mode pm2"
