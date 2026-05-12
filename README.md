# MaeSuai Cloud Monitor

Network uptime monitoring system built with Node.js + SQLite + Socket.IO

## Features
- HTTP / HTTPS / PING / TCP monitoring
- Real-time dashboard with WebSocket
- Telegram notifications
- Import / Export monitors
- Incident tracking
- Galaxy animated background

---

## Installation Method 1 — Standard (Ubuntu/Debian)

```bash
apt-get install -y git curl
git clone https://github.com/maxspeedcom/MaeSuai-Monitor.git
cd MaeSuai-Monitor
chmod +x install.sh
bash install.sh
```

---

## Installation Method 2 — Docker

### Requirements
- Docker
- Docker Compose

### Install Docker (if not installed)
```bash
curl -fsSL https://get.docker.com | sh
```

### Run with Docker Compose
```bash
git clone https://github.com/maxspeedcom/MaeSuai-Monitor.git
cd MaeSuai-Monitor
docker compose up -d --build
```

### Useful Docker commands
```bash
# View logs
docker compose logs -f

# Stop
docker compose down

# Restart
docker compose restart

# Update
git pull
docker compose up -d --build
```

---

## Access
| URL | Description |
|-----|-------------|
| `http://YOUR_IP:3000` | Public Status Page |
| `http://YOUR_IP:3000/admin` | Admin Dashboard |

## Default Login
- **Username:** admin
- **Password:** admin1234

> ⚠️ Please change password after first login: Admin → Settings → Password

---

## Requirements (Standard)
- Ubuntu 20.04+ / Debian 11+
- Node.js 20+
- RAM: 512MB+
- Disk: 1GB+

## Requirements (Docker)
- Docker 20+
- Docker Compose v2+
- RAM: 512MB+
- Disk: 1GB+
