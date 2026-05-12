# MaeSuai Cloud Monitor

Network uptime monitoring system - Uptime Kuma style

## Features
- HTTP/HTTPS/PING/TCP monitoring
- Real-time dashboard with WebSocket
- Telegram notifications
- Import/Export monitors
- Galaxy animated background
- Incident tracking

## Quick Install (Ubuntu/Debian)

```bash
git clone https://github.com/YOUR_USERNAME/maeSuai-monitor.git
cd maeSuai-monitor
chmod +x install.sh
sudo bash install.sh
```

## Manual Install

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs iputils-ping

# Install dependencies
cd /opt/maeSuai-monitor
npm install --omit=dev

# Start service
sudo systemctl enable --now maeSuai-monitor
```

## Access
- Public: `http://YOUR_IP:3000`
- Admin: `http://YOUR_IP:3000/admin`
- Default login: `admin` / `admin1234`

## Requirements
- Ubuntu 20.04+ / Debian 11+
- Node.js 20+
- RAM: 512MB+
- Disk: 1GB+

## Change Password
Login to Admin → Settings → Password
# MaeSuai-Monitor
