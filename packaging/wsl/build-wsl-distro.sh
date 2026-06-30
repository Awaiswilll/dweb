#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  build-wsl-distro.sh — Build a WSL-ready dweb distro tarball
#
#  Creates a minimal Alpine Linux rootfs with:
#    - Node.js + npm
#    - dweb-server (pre-built frontend + tools)
#    - opencode CLI (global npm install)
#    - Ollama (local AI, downloaded but not running during build)
#    - WSL init scripts for auto-start
#
#  Output: dweb-wsl-rootfs.tar.gz  (importable with `wsl --import`)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR"
BUILD_DIR=$(mktemp -d)
ROOTFS="$BUILD_DIR/rootfs"
RELEASE="3.20"
MIRROR="https://dl-cdn.alpinelinux.org/alpine"
TARBALL_OUT="$OUTPUT_DIR/dweb-wsl-rootfs.tar.gz"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════════════════════
#  PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════

info "Checking prerequisites..."

# Option A: Docker-based build (preferred)
USE_DOCKER=false
if command -v docker &>/dev/null; then
  USE_DOCKER=true
  info "Docker found — will use Docker-based build"
fi

# Option B: apk-based build (needs Alpine or apk-tools-static)
USE_APK=false
if command -v apk &>/dev/null; then
  USE_APK=true
  info "apk found — will use direct apk-based build"
fi

if [ "$USE_DOCKER" = false ] && [ "$USE_APK" = false ]; then
  err "Either Docker or apk-tools-static is required. Install Docker or run this on Alpine."
fi

# Check that pre-built dist/ exists
if [ ! -d "$PROJECT_ROOT/dist" ] || [ ! -f "$PROJECT_ROOT/dist/index.html" ]; then
  err "Frontend dist/ not found. Run 'npm install && npm run build' in $PROJECT_ROOT first."
fi

# Check that dweb-server.cjs exists
if [ ! -f "$PROJECT_ROOT/tools/dweb-server.cjs" ]; then
  err "tools/dweb-server.cjs not found. Make sure the project is complete."
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Create the root filesystem
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$USE_DOCKER" = true ]; then
  # ── Docker-based approach ──────────────────────────────────────────────
  info "Building rootfs via Docker (alpine:$RELEASE)..."
  mkdir -p "$ROOTFS"

  docker run --rm -i "alpine:$RELEASE" sh <<'DOCKER_SCRIPT' > "$BUILD_DIR/rootfs.tar"
    set -ex

    # Install base packages for building a rootfs
    apk add --no-cache alpine-base busybox openrc

    # Create a minimal filesystem layout
    mkdir -p /etc /lib /sbin /usr /var /home /root /opt /mnt

    # Cleanup for size
    rm -rf /var/cache/apk/*
    rm -rf /usr/share/doc /usr/share/man /usr/share/info
    find /var/log -type f -delete 2>/dev/null || true

    # Output tar of the entire filesystem
    tar cf - / --exclude=/proc --exclude=/sys --exclude=/dev --exclude=/tmp --exclude=/mnt --exclude=/run 2>/dev/null
DOCKER_SCRIPT

  # Extract the Docker-built rootfs
  tar xf "$BUILD_DIR/rootfs.tar" -C "$ROOTFS" 2>/dev/null || true
  rm "$BUILD_DIR/rootfs.tar"

  info "Base rootfs extracted from Docker image"
else
  # ── Direct apk-based approach ──────────────────────────────────────────
  info "Building rootfs with apk directly..."
  mkdir -p "$ROOTFS"

  # Install alpine-base into the rootfs
  apk add --no-cache --root "$ROOTFS" --initdb alpine-base busybox openrc \
    --repository "$MIRROR/v$RELEASE/main/" \
    --repository "$MIRROR/v$RELEASE/community/"

  # Configure apk repositories inside rootfs
  mkdir -p "$ROOTFS/etc/apk"
  cat > "$ROOTFS/etc/apk/repositories" <<EOF
$MIRROR/v$RELEASE/main/
$MIRROR/v$RELEASE/community/
EOF
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Install packages into rootfs
# ═══════════════════════════════════════════════════════════════════════════════

info "Installing packages into rootfs..."

# Build a script that runs inside the rootfs via chroot (or using apk --root)
install_pkgs() {
  local rootfs="$1"

  # Copy DNS config from host so apk can resolve URLs inside chroot
  cp /etc/resolv.conf "$rootfs/etc/resolv.conf" 2>/dev/null || true

  # CRITICAL: Mount /proc for chroot to work reliably (apk needs /proc)
  mount -t proc none "$rootfs/proc" 2>/dev/null || true
  mount -t devtmpfs none "$rootfs/dev" 2>/dev/null || true
  trap "umount '$rootfs/proc' '$rootfs/dev' 2>/dev/null || true" EXIT

  if [ "$USE_DOCKER" = true ]; then
    # For Docker-built rootfs, apk is already available
    chroot "$rootfs" /bin/sh -c '
      apk update
      apk add --no-cache \
        nodejs npm git curl bash sudo openssh \
        ca-certificates openssl htop tmux \
        libstdc++ libgcc \
        --repository https://dl-cdn.alpinelinux.org/alpine/v3.20/main/ \
        --repository https://dl-cdn.alpinelinux.org/alpine/v3.20/community/
    ' || {
      warn "Package install via chroot failed — trying apk --root fallback"
      apk add --no-cache --root "$rootfs" \
        nodejs npm git curl bash sudo openssh ca-certificates openssl \
        libstdc++ libgcc \
        --repository "$MIRROR/v$RELEASE/main/" \
        --repository "$MIRROR/v$RELEASE/community/"
    }
  else
    # Direct apk --root approach
    apk add --no-cache --root "$rootfs" \
      nodejs npm git curl bash sudo openssh ca-certificates openssl \
      libstdc++ libgcc \
      --repository "$MIRROR/v$RELEASE/main/" \
      --repository "$MIRROR/v$RELEASE/community/"
  fi

  # Verify nodejs is installed and is a MUSL build
  if [ -f "$rootfs/usr/bin/node" ]; then
    NODE_INTERP=$(readelf -l "$rootfs/usr/bin/node" 2>/dev/null | grep -o '/lib/ld-musl' || true)
    if [ -z "$NODE_INTERP" ]; then
      warn "Node.js binary is NOT musl-linked (interpreter: $(readelf -l "$rootfs/usr/bin/node" 2>/dev/null | grep interpreter))"
      warn "This will NOT work in Alpine WSL. Manual fix required."
    else
      info "Node.js is musl-linked ✓"
    fi
  else
    warn "Node.js binary not found at /usr/bin/node"
  fi

  info "Packages installed successfully"
}

install_pkgs "$ROOTFS"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Create dweb user
# ═══════════════════════════════════════════════════════════════════════════════

info "Creating dweb user..."

chroot "$ROOTFS" /bin/sh -c '
  # Create dweb user with home directory
  addgroup -g 1000 dweb
  adduser -D -h /home/dweb -s /bin/bash -u 1000 -G dweb dweb

  # Set password-less sudo
  echo "dweb ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/dweb
  chmod 440 /etc/sudoers.d/dweb

  # Create /opt/dweb directory
  mkdir -p /opt/dweb
  chown dweb:dweb /opt/dweb
'

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Copy dweb server code
# ═══════════════════════════════════════════════════════════════════════════════

info "Copying dweb server code..."

# Create dweb dir in rootfs
mkdir -p "$ROOTFS/opt/dweb"

# Copy the pre-built dist/ (frontend)
cp -r "$PROJECT_ROOT/dist" "$ROOTFS/opt/dweb/dist"
info "  dist/ copied"

# Copy tools/ (server scripts)
mkdir -p "$ROOTFS/opt/dweb/tools"
cp "$PROJECT_ROOT/tools/dweb-server.cjs" "$ROOTFS/opt/dweb/tools/dweb-server.cjs"
cp "$PROJECT_ROOT/tools/dweb-relay.cjs" "$ROOTFS/opt/dweb/tools/dweb-relay.cjs" 2>/dev/null || true
cp "$PROJECT_ROOT/tools/connectivity-test.cjs" "$ROOTFS/opt/dweb/tools/connectivity-test.cjs" 2>/dev/null || true
info "  tools/ copied"

# Copy package.json and other config files (for reference/updates)
cp "$PROJECT_ROOT/package.json" "$ROOTFS/opt/dweb/package.json"
cp "$PROJECT_ROOT/package-lock.json" "$ROOTFS/opt/dweb/package-lock.json" 2>/dev/null || true
cp "$PROJECT_ROOT/start-server.sh" "$ROOTFS/opt/dweb/start-server.sh" 2>/dev/null || true
info "  config files copied"

# Copy dweb.cjs as the main entry point
cp "$PROJECT_ROOT/dweb.cjs" "$ROOTFS/opt/dweb/dweb.cjs"
chmod +x "$ROOTFS/opt/dweb/dweb.cjs"

# Ensure correct ownership
chroot "$ROOTFS" /bin/sh -c 'chown -R dweb:dweb /opt/dweb'

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 5: Install opencode CLI globally
# ═══════════════════════════════════════════════════════════════════════════════

info "Installing opencode CLI..."

chroot "$ROOTFS" /bin/sh -c '
  npm install -g @opencode/cli 2>&1 || \
  npm install -g opencode 2>&1 || \
  warn "opencode CLI could not be installed — check the package name"
' || warn "opencode CLI install failed (non-fatal)"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 6: Install Ollama
# ═══════════════════════════════════════════════════════════════════════════════

info "Installing Ollama..."

chroot "$ROOTFS" /bin/sh -c '
  # Download and run the official Ollama install script
  curl -fsSL https://ollama.com/install.sh | sh 2>&1 || \
  warn "Ollama install failed — check network"
' || warn "Ollama install skipped (non-fatal)"

# Create Ollama data directory
mkdir -p "$ROOTFS/opt/ollama"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 7: Create WSL init scripts
# ═══════════════════════════════════════════════════════════════════════════════

info "Creating WSL init scripts..."

# ── /etc/init.d/dweb — OpenRC service script ────────────────────────────
cat > "$ROOTFS/etc/init.d/dweb" <<'INIT'
#!/sbin/openrc-run
# dweb — P2P Dev + Hosting Platform
# WSL init script for auto-start on boot

description="dweb P2P Dev + Hosting Platform"

name="dweb"
command="/usr/bin/node"
command_args="/opt/dweb/dweb.cjs"
command_user="dweb"
pidfile="/run/${RC_SVCNAME}.pid"
command_background=true
output_log="/var/log/dweb.log"
error_log="/var/log/dweb.log"

depend() {
  need net
  after firewall
}

start_pre() {
  # Set WSL-friendly environment variables
  export DISPLAY=:0
  export BROWSER=none
  export PATH="/usr/local/bin:/usr/bin:/bin:/opt/dweb/tools:$PATH"
  export NODE_ENV=production
  export PORT=49737

  # Ensure log directory exists
  mkdir -p /var/log
  touch /var/log/dweb.log
  chown dweb:dweb /var/log/dweb.log 2>/dev/null || true

  # Ensure /run exists
  mkdir -p /run
}
INIT
chmod +x "$ROOTFS/etc/init.d/dweb"

# ── /etc/rc.local — fallback boot script ────────────────────────────────
cat > "$ROOTFS/etc/rc.local" <<'RCLOCAL'
#!/bin/sh
# dweb WSL boot script
# This runs after all OpenRC services have started

# Environment for WSL
export DISPLAY=:0
export BROWSER=none
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/dweb/tools:$PATH"
export NODE_ENV=production
export PORT=49737

# Start Ollama if installed
if command -v ollama &>/dev/null; then
  su dweb -c "ollama serve &>/dev/null &"
fi

# Start dweb-server
if [ -f /opt/dweb/dweb.cjs ]; then
  su dweb -c "node /opt/dweb/dweb.cjs &>/var/log/dweb.log &"
  echo "dweb-server started on http://localhost:49737"
fi
RCLOCAL
chmod +x "$ROOTFS/etc/rc.local"

# ── /etc/profile.d/dweb.sh — environment for WSL users ──────────────────
cat > "$ROOTFS/etc/profile.d/dweb.sh" <<'PROFILE'
# dweb WSL environment
export DISPLAY=:0
export BROWSER=none
export NODE_ENV=production
export PORT=49737
export PATH="$PATH:/opt/dweb/tools"

# Aliases
alias dweb-start='sudo rc-service dweb start'
alias dweb-stop='sudo rc-service dweb stop'
alias dweb-restart='sudo rc-service dweb restart'
alias dweb-logs='tail -f /var/log/dweb.log'
alias dweb-status='curl -s http://localhost:49737/ping | python3 -m json.tool 2>/dev/null || curl -s http://localhost:49737/ping'
PROFILE

# ── /etc/wsl.conf — WSL-specific configuration ──────────────────────────
cat > "$ROOTFS/etc/wsl.conf" <<'WSLCONF'
# dweb WSL configuration
[boot]
systemd = false  # Alpine uses OpenRC, not systemd

[user]
default = dweb

[network]
hostname = dweb
generateHosts = false

[interop]
enabled = true
appendWindowsPath = true
WSLCONF

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 8: Enable services to start on boot
# ═══════════════════════════════════════════════════════════════════════════════

info "Enabling boot services..."

chroot "$ROOTFS" /bin/sh -c '
  # Add dweb service to default runlevel
  rc-update add dweb default 2>/dev/null || true

  # Enable networking
  rc-update add networking default 2>/dev/null || true

  # Enable sshd
  rc-update add sshd default 2>/dev/null || true
' || warn "Some services could not be enabled (runlevel config may need manual setup)"

# ── /home/dweb/.profile — login shell auto-start ──────────────────────
cat > "$ROOTFS/home/dweb/.profile" <<'DOTPROFILE'
# dweb — auto-start services on WSL boot (login shell)
# .profile is sourced for login shells; .bashrc is sourced for interactive non-login shells.
# WSL typically starts a login shell, but some launchers use non-login.

# Source .bashrc if this is a login shell
if [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
DOTPROFILE

# ── /home/dweb/.bashrc — interactive non-login shell auto-start ──────
cat > "$ROOTFS/home/dweb/.bashrc" <<'BASHRC'
# dweb — auto-start services on WSL boot (interactive shell)
# Also sourced from .profile for consistency.

if [ -z "$DWEB_STARTED" ]; then
  export DWEB_STARTED=1

  # Ensure log directory exists
  sudo mkdir -p /var/log 2>/dev/null

  # Start dweb if not already running
  if ! curl -sf http://localhost:49737/ping &>/dev/null; then
    # Start in background, redirect logs
    node /opt/dweb/dweb.cjs &>/var/log/dweb.log &
    echo "  dweb-server starting on http://localhost:49737"
    echo "  (logs: tail -f /var/log/dweb.log)"
  fi
fi
BASHRC
chown dweb:dweb "$ROOTFS/home/dweb/.bashrc"
chmod 644 "$ROOTFS/home/dweb/.bashrc"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 9: Clean up to minimize size
# ═══════════════════════════════════════════════════════════════════════════════

info "Cleaning up rootfs to minimize size..."

clean_rootfs() {
  local rootfs="$1"

  # Remove package manager caches
  rm -rf "$rootfs/var/cache/apk/"*
  rm -rf "$rootfs/var/cache/misc/"*
  rm -rf "$rootfs/tmp/"*

  # Remove documentation and man pages
  rm -rf "$rootfs/usr/share/doc/"*
  rm -rf "$rootfs/usr/share/man/"*
  rm -rf "$rootfs/usr/share/info/"*
  rm -rf "$rootfs/usr/share/gtk-doc/"*

  # Remove unnecessary locales (keep en_US)
  find "$rootfs/usr/share/locale" -maxdepth 1 -mindepth 1 -type d \
    ! -name "en_US" ! -name "locale.alias" -exec rm -rf {} + 2>/dev/null || true

  # Remove logs
  find "$rootfs/var/log" -type f -delete 2>/dev/null || true

  # Remove npm cache
  rm -rf "$rootfs/root/.npm/"*
  rm -rf "$rootfs/home/dweb/.npm/"* 2>/dev/null || true
  rm -rf "$rootfs/root/.cache/"* 2>/dev/null || true

  # Remove node-gyp cache
  rm -rf "$rootfs/root/.node-gyp/"* 2>/dev/null || true

  # Strip binaries where possible (skip if not on Alpine)
  if command -v strip &>/dev/null; then
    find "$rootfs/usr/bin" -type f -executable -exec strip --strip-all {} \; 2>/dev/null || true
    find "$rootfs/usr/lib" -name "*.so*" -exec strip --strip-unneeded {} \; 2>/dev/null || true
  fi

  # Remove empty directories
  find "$rootfs" -type d -empty -delete 2>/dev/null || true
}

clean_rootfs "$ROOTFS"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 10: Package the rootfs as a tarball
# ═══════════════════════════════════════════════════════════════════════════════

info "Creating tarball..."

# Get size before packaging
SIZE_MB=$(du -sm "$ROOTFS" | cut -f1)
info "Rootfs size: ${SIZE_MB}MB"

# Create the tarball (sparse-friendly, no xattrs to avoid issues)
tar --numeric-owner \
    --owner=0 --group=0 \
    --no-xattrs \
    --no-selinux \
    --no-acls \
    -czf "$TARBALL_OUT" \
    -C "$ROOTFS" \
    . 2>&1

# Verify
if [ -f "$TARBALL_OUT" ]; then
  FINAL_SIZE=$(du -h "$TARBALL_OUT" | cut -f1)
  info "✅ WSL distro tarball created: $TARBALL_OUT"
  info "   Size: $FINAL_SIZE"
  info ""
  info "To import into WSL on Windows:"
  info "   wsl --import dweb ./dweb-wsl/ $TARBALL_OUT --version 2"
  info "   wsl -d dweb"
  info "   Open http://localhost:49737"
else
  err "Failed to create tarball"
fi
