#!/bin/bash
set -e

echo "🚀 MaeSuai Cloud Monitor - Auto Installer"
echo "==========================================="

# Check root
if [ "$EUID" -ne 0 ]; then echo "❌ Please run as root"; exit 1; fi

# Check OS
OS=$(cat /etc/os-release | grep "^ID=" | cut -d= -f2 | tr -d '"')
echo "✅ OS: $OS"

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1
echo "✅ Node.js $(node -v)"

# Install dependencies
echo "📦 Installing system packages..."
apt-get install -y git iputils-ping > /dev/null 2>&1

# Clone or copy project
INSTALL_DIR="/opt/maeSuai-monitor"
if [ -d "$INSTALL_DIR" ]; then
  echo "⚠️  Directory exists, backing up..."
  mv $INSTALL_DIR ${INSTALL_DIR}.bak.$(date +%Y%m%d%H%M%S)
fi

echo "📂 Installing to $INSTALL_DIR..."
mkdir -p $INSTALL_DIR
cp -r . $INSTALL_DIR/
cd $INSTALL_DIR

# Remove old DB (fresh install)
rm -f data/monitor.db

# Install npm packages
echo "📦 Installing npm packages..."
npm install --omit=dev > /dev/null 2>&1
echo "✅ npm packages installed"

# Create data directory
mkdir -p data

# Create systemd service
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/maeSuai-monitor.service << 'SERVICE'
[Unit]
Description=MaeSuai Cloud Monitor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/maeSuai-monitor
ExecStart=/usr/bin/node /opt/maeSuai-monitor/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable maeSuai-monitor
systemctl restart maeSuai-monitor
sleep 3

# Check service
if systemctl is-active --quiet maeSuai-monitor; then
  IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo "✅ Installation complete!"
  echo "==========================================="
  echo "🌐 Public  : http://$IP:3000"
  echo "🔐 Admin   : http://$IP:3000/admin"
  echo "👤 Username: admin"
  echo "🔑 Password: admin1234"
  echo "==========================================="
  echo "⚠️  Please change password after first login!"
else
  echo "❌ Service failed to start"
  journalctl -u maeSuai-monitor -n 20 --no-pager
fi
