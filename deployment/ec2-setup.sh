#!/bin/bash
# Fleet Hub - EC2 Setup Script
# Run on existing EC2 instance (16.28.64.221) alongside AM project
# Usage: sudo bash ec2-setup.sh

set -e

echo "=========================================="
echo "1PWR Fleet Hub - EC2 Setup"
echo "=========================================="

# Install Node.js 20 LTS if not present
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
    echo "Installing Node.js 20..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Install Nginx if not present (will reverse proxy to Next.js)
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    sudo yum install -y nginx || sudo amazon-linux-extras install nginx1 -y
    sudo systemctl enable nginx
fi

# Install certbot for SSL
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo yum install -y certbot python3-certbot-nginx || \
    sudo amazon-linux-extras install epel -y && sudo yum install -y certbot python3-certbot-nginx
fi

# Create app directory structure
echo "Creating app directories..."
sudo mkdir -p /var/www/fleet-hub/data
sudo mkdir -p /var/www/fleet-hub/logs
sudo mkdir -p /var/www/fleet-hub/public/uploads
sudo chown -R ec2-user:ec2-user /var/www/fleet-hub

# Clone repo if not already present
if [ ! -d /var/www/fleet-hub/.git ]; then
    echo "Cloning repository..."
    cd /var/www/fleet-hub
    git init
    git remote add origin https://github.com/mso9999/1pwr-fleet-hub.git
    git fetch origin
    git checkout -b main origin/main
else
    echo "Repository already exists, pulling latest..."
    cd /var/www/fleet-hub
    git fetch origin
    git reset --hard origin/main
fi

# Install dependencies and build
echo "Installing dependencies..."
cd /var/www/fleet-hub
npm ci --production=false
echo "Building Next.js app..."
npm run build

# Set up Nginx virtual host for fm.1pwrafrica.com
echo "Configuring Nginx..."
sudo tee /etc/nginx/conf.d/fleet-hub.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name fm.1pwrafrica.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_for_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    location /uploads/ {
        alias /var/www/fleet-hub/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Test and reload Nginx
sudo nginx -t
sudo systemctl restart nginx

# Start app with PM2
echo "Starting Fleet Hub with PM2..."
cd /var/www/fleet-hub
pm2 delete fleet-hub 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Set PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

echo "=========================================="
echo "Fleet Hub setup complete!"
echo "=========================================="
echo ""
echo "App running on port 3100 (proxied via Nginx)"
echo "Database: /var/www/fleet-hub/data/fleet-hub.db"
echo "Logs: /var/www/fleet-hub/logs/"
echo ""
echo "Next steps:"
echo "1. Point fm.1pwrafrica.com A record to this server's IP"
echo "2. Run: sudo certbot --nginx -d fm.1pwrafrica.com"
echo "3. Set up GitHub secrets for auto-deploy"
echo ""
echo "Test: curl http://localhost:3100/api/dashboard"
