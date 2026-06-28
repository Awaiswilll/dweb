#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  install.sh — Standalone dweb installer for WSL / Alpine Linux
#
#  Installs dweb-server, opencode CLI, and optionally Ollama on an existing
#  Alpine Linux WSL instance. Can also be adapted for Debian/Ubuntu.
#
#  Usage:
#    curl -fsSL https://dweb.dev/install.sh | bash
#    # or run locally:
#    bash install.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DWEB_REPO="${DWEB_REPO:-https://github.com/dweb/dweb.git}"
DWEB_DIR="${DWEB_DIR:-/opt/dweb}"
DWEB_PORT="${DWEB_PORT:-49737}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-yes}"
INSTALL_OPENCODE="${INSTALL_OPENCODE:-yes}"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ═══════════════════════════════════════════════════════════════════════════════
#  PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════

step "Checking prerequisites"

# Detect package manager
if command -v apk &>/dev/null; then
  PKG_MANAGER="apk"
  PKG_INSTALL="apk add --no-cache"
  PKG_UPDATE="apk update"
elif command -v apt-get &>/dev/null; then
  PKG_MANAGER="apt-get"
  PKG_INSTALL="apt-get install -y"
  PKG_UPDATE="apt-get update"
elif command -v yum &>/dev/null; then
  PKG_MANAGER="yum"
  PKG_INSTALL="yum install -y"
  PKG_UPDATE="yum check-update || true"
else
  err "Unsupported package manager. Install dependencies manually."
  exit 1
fi

info "Detected package manager: $PKG_MANAGER"

# Check if running as root — if not, use sudo
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    SUDO="sudo"
    info "Running as user — will use sudo for system operations"
  else
    err "Please run as root or install sudo"
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Install system dependencies
# ═══════════════════════════════════════════════════════════════════════════════

step "Installing system dependencies"

$SUDO $PKG_UPDATE

case $PKG_MANAGER in
  apk)
    $SUDO $PKG_INSTALL nodejs npm git curl bash sudo openssh \
      ca-certificates openssl
    ;;
  apt-get)
    $SUDO $PKG_INSTALL nodejs npm git curl bash sudo openssh-client \
      ca-certificates openssl
    ;;
  yum)
    $SUDO $PKG_INSTALL nodejs npm git curl bash sudo openssh \
      ca-certificates openssl
    ;;
esac

info "System packages installed"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Clone / copy dweb repo
# ═══════════════════════════════════════════════════════════════════════════════

step "Setting up dweb code"

if [ -d "$DWEB_DIR" ]; then
  warn "$DWEB_DIR already exists"
  read -rp "  Overwrite? (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    info "Skipping dweb code setup"
  else
    $SUDO rm -rf "$DWEB_DIR"
  fi
fi

if [ ! -d "$DWEB_DIR" ]; then
  # Check if we're in the dweb repo already
  if [ -f "./dweb.cjs" ] && [ -d "./dist" ]; then
    info "Found local dweb source — copying to $DWEB_DIR"
    $SUDO mkdir -p "$DWEB_DIR"
    $SUDO cp -r . "$DWEB_DIR"
    $SUDO chown -R $(whoami):$(whoami) "$DWEB_DIR" 2>/dev/null || true
  else
    info "Cloning dweb from $DWEB_REPO"
    git clone --depth 1 "$DWEB_REPO" "$DWEB_DIR" || {
      err "Failed to clone repository. Check: $DWEB_REPO"
      exit 1
    }
  fi
fi

cd "$DWEB_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Install npm dependencies and build
# ═══════════════════════════════════════════════════════════════════════════════

step "Installing npm dependencies"

if [ -f "package.json" ]; then
  npm install
  info "npm dependencies installed"
else
  warn "No package.json found — skipping npm install"
fi

step "Building frontend"

if [ -f "package.json" ]; then
  if [ -f "node_modules/.bin/vite" ] || [ -d "node_modules/vite" ]; then
    npm run build 2>/dev/null || warn "Build failed — using existing dist/ if available"
  else
    warn "vite not found — skipping build"
  fi
fi

info "dweb code ready at $DWEB_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Install opencode CLI
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$INSTALL_OPENCODE" = "yes" ]; then
  step "Installing opencode CLI"

  if command -v opencode &>/dev/null; then
    info "opencode CLI already installed: $(opencode --version 2>/dev/null || echo 'unknown')"
  else
    npm install -g @opencode/cli 2>/dev/null || \
    npm install -g opencode 2>/dev/null || \
    warn "opencode CLI install failed. Check the package name on npm."

    if command -v opencode &>/dev/null; then
      info "opencode CLI installed successfully"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 5: Install Ollama (optional)
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$INSTALL_OLLAMA" = "yes" ]; then
  step "Installing Ollama"

  if command -v ollama &>/dev/null; then
    info "Ollama already installed: $(ollama --version 2>/dev/null || echo 'unknown')"
  else
    curl -fsSL https://ollama.com/install.sh | sh 2>&1 || \
    warn "Ollama install script failed. You can install manually: curl -fsSL https://ollama.com/install.sh | sh"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 6: Set up dweb as a service
# ═══════════════════════════════════════════════════════════════════════════════

step "Setting up dweb service"

# ── OpenRC service (Alpine) ────────────────────────────────────────────
if [ -d "/etc/init.d" ]; then
  $SUDO tee /etc/init.d/dweb > /dev/null <<'SERVICE'
#!/sbin/openrc-run
description="dweb P2P Dev + Hosting Platform"
name="dweb"
command="/usr/bin/node"
command_args="/opt/dweb/dweb.cjs"
command_user="$(id -nu 1000 2>/dev/null || echo dweb)"
pidfile="/run/${RC_SVCNAME}.pid"
command_background=true
output_log="/var/log/dweb.log"
error_log="/var/log/dweb.log"
depend() { need net; }
start_pre() {
  export DISPLAY=:0
  export BROWSER=none
  export NODE_ENV=production
  export PORT=49737
  mkdir -p /var/log /run
  touch /var/log/dweb.log
}
SERVICE
  $SUDO chmod +x /etc/init.d/dweb
  $SUDO rc-update add dweb default 2>/dev/null || true
  info "OpenRC service created"
fi

# ── systemd service ────────────────────────────────────────────────────
if [ -d "/etc/systemd/system" ]; then
  $SUDO tee /etc/systemd/system/dweb.service > /dev/null <<'SYSTEMD'
[Unit]
Description=dweb P2P Dev + Hosting Platform
After=network.target

[Service]
Type=simple
User=dweb
Environment=DISPLAY=:0
Environment=BROWSER=none
Environment=NODE_ENV=production
Environment=PORT=49737
ExecStart=/usr/bin/node /opt/dweb/dweb.cjs
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/dweb.log
StandardError=append:/var/log/dweb.log

[Install]
WantedBy=multi-user.target
SYSTEMD
  $SUDO systemctl daemon-reload 2>/dev/null || true
  $SUDO systemctl enable dweb 2>/dev/null || true
  info "systemd service created"
fi

# ── Create a convenience wrapper ───────────────────────────────────────
$SUDO tee /usr/local/bin/dweb > /dev/null <<'WRAPPER'
#!/bin/sh
# dweb — convenience CLI for managing the dweb server
case "${1:-help}" in
  start|stop|restart)
    if command -v rc-service &>/dev/null; then
      sudo rc-service dweb "$1"
    elif command -v systemctl &>/dev/null; then
      sudo systemctl "$1" dweb
    fi
    ;;
  status)
    curl -sf http://localhost:49737/ping 2>/dev/null && \
      echo "dweb is running on http://localhost:49737" || \
      echo "dweb is not running"
    ;;
  logs)
    tail -f /var/log/dweb.log
    ;;
  url)
    echo "http://localhost:49737"
    ;;
  help|*)
    echo "Usage: dweb {start|stop|restart|status|logs|url}"
    ;;
esac
WRAPPER
$SUDO chmod +x /usr/local/bin/dweb
info "dweb CLI wrapper installed at /usr/local/bin/dweb"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 7: Create dweb user (if not exists)
# ═══════════════════════════════════════════════════════════════════════════════

step "Setting up dweb user"

if ! id -u dweb &>/dev/null; then
  if command -v adduser &>/dev/null; then
    $SUDO adduser -D -h /home/dweb -s /bin/bash dweb 2>/dev/null || \
    $SUDO adduser --disabled-password --gecos "" dweb 2>/dev/null || \
    $SUDO useradd -m -s /bin/bash dweb 2>/dev/null
  fi
  info "Created 'dweb' user"
fi

$SUDO chown -R dweb:dweb "$DWEB_DIR" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 8: Start dweb-server
# ═══════════════════════════════════════════════════════════════════════════════

step "Starting dweb-server"

# Start via service manager
if command -v rc-service &>/dev/null; then
  $SUDO rc-service dweb start 2>/dev/null || warn "Could not start dweb via OpenRC"
elif command -v systemctl &>/dev/null; then
  $SUDO systemctl start dweb 2>/dev/null || warn "Could not start dweb via systemd"
fi

# Fallback: start directly
if ! curl -sf "http://localhost:$DWEB_PORT/ping" &>/dev/null; then
  info "Starting dweb-server directly..."
  cd "$DWEB_DIR"
  nohup node dweb.cjs &>/var/log/dweb.log &
  disown
  sleep 2
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  FINISH
# ═══════════════════════════════════════════════════════════════════════════════

step "Installation complete"

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║          dweb is running!                        ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  Open in your browser:"
echo "    http://localhost:$DWEB_PORT"
echo ""
echo "  Commands:"
echo "    dweb status     — Check if dweb is running"
echo "    dweb logs       — View server logs"
echo "    dweb start|stop — Manage the service"
echo "    opencode        — AI-assisted coding CLI"
echo ""
echo "  Files:"
echo "    Code:       $DWEB_DIR"
echo "    Logs:       /var/log/dweb.log"
echo "    Service:    /etc/init.d/dweb (OpenRC)"
echo "                /etc/systemd/system/dweb.service (systemd)"
echo ""

# Verify it's running
if curl -sf "http://localhost:$DWEB_PORT/ping" &>/dev/null; then
  info "✅ dweb-server is responding on http://localhost:$DWEB_PORT"
else
  warn "dweb-server may not be running yet. Check: dweb logs"
fi
