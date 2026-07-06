# ═══════════════════════════════════════════════════════════════════════════════
#  Dockerfile — dweb WSL Rootfs Builder
#
#  Builds a minimal Alpine Linux rootfs with dweb-server, pm2,
#  and Ollama (optional). The resulting filesystem can be exported as a
#  tarball for `wsl --import`.
#
#  Usage:
#    docker build -t dweb-wsl .
#    docker run --name dweb-wsl-temp dweb-wsl /bin/true
#    docker export dweb-wsl-temp -o dweb-wsl-rootfs.tar.gz
#    docker rm dweb-wsl-temp
#    wsl --import dweb ./dweb-wsl/ ./dweb-wsl-rootfs.tar.gz --version 2
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git

# Copy only package files for dependency caching
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

# Copy source and build
COPY tsconfig.json tsconfig.node.json vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
RUN npm run build 2>/dev/null || { echo "Build failed — continuing with existing dist"; exit 0; }

# ── Stage 2: WSL rootfs ──────────────────────────────────────────────────────
FROM alpine:3.20 AS wsl-rootfs

# ── Metadata ──────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="dweb WSL Distro"
LABEL org.opencontainers.image.description="dweb P2P Dev + Hosting Platform for WSL"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.licenses="MIT"

# ── Install system packages ───────────────────────────────────────────────────
RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    nodejs \
    npm \
    openssh \
    openssl \
    sudo \
    htop \
    tmux \
    libstdc++ \
    libgcc \
  && rm -rf /var/cache/apk/* \
  && rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* \
  && echo "Verifying Node.js is musl-linked..." \
  && ldd /usr/bin/node 2>/dev/null | grep -q 'ld-musl' \
    && echo "✓ musl-linked (ldd confirms ld-musl)" \
    || echo "⚠ WARNING: Node.js may not be musl-linked — check 'ldd /usr/bin/node'"

# ── Create dweb user ──────────────────────────────────────────────────────────
RUN addgroup -g 1000 dweb \
  && adduser -D -h /home/dweb -s /bin/bash -u 1000 -G dweb dweb \
  && echo "dweb ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/dweb \
  && chmod 440 /etc/sudoers.d/dweb

# ── Copy dweb code from builder ───────────────────────────────────────────────
COPY --from=builder /build/dist/ /opt/dweb/dist/
COPY tools/ /opt/dweb/tools/
COPY dweb.cjs package.json start-server.sh* /opt/dweb/
RUN chmod +x /opt/dweb/dweb.cjs /opt/dweb/start-server.sh 2>/dev/null || true

# ── Install global npm tools (pm2 for process management) ─────────────────────
RUN npm install -g pm2 2>/dev/null || echo "pm2 install skipped (non-essential)"

# ── Install Ollama (optional — skipped in Docker, user runs post-install) ─────
RUN echo "Ollama skipped in Docker build. Install manually:" \
  && echo "  curl -fsSL https://ollama.com/install.sh | sh"

# ── WSL init scripts ──────────────────────────────────────────────────────────

# OpenRC service for dweb
COPY <<'INIT' /etc/init.d/dweb
#!/sbin/openrc-run
description="dweb P2P Dev + Hosting Platform"
name="dweb"
command="/usr/bin/node"
command_args="/opt/dweb/dweb.cjs"
command_user="dweb"
pidfile="/run/${RC_SVCNAME}.pid"
command_background=true
output_log="/var/log/dweb.log"
error_log="/var/log/dweb.log"
depend() { need net; after firewall; }
start_pre() {
  export DISPLAY=:0
  export BROWSER=none
  export NODE_ENV=production
  export PORT=49737
  export PATH="/usr/local/bin:/usr/bin:/bin:/opt/dweb/tools:$PATH"
  mkdir -p /var/log /run
  touch /var/log/dweb.log
  chown dweb:dweb /var/log/dweb.log 2>/dev/null || true
}
INIT
RUN chmod +x /etc/init.d/dweb

# rc.local fallback
COPY <<'RCLOCAL' /etc/rc.local
#!/bin/sh
export DISPLAY=:0
export BROWSER=none
export NODE_ENV=production
export PORT=49737
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/dweb/tools:$PATH"
if command -v ollama &>/dev/null; then
  su dweb -c "ollama serve &>/dev/null &"
fi
if [ -f /opt/dweb/dweb.cjs ]; then
  su dweb -c "node /opt/dweb/dweb.cjs &>/var/log/dweb.log &"
  echo "dweb-server started on http://localhost:49737"
fi
RCLOCAL
RUN chmod +x /etc/rc.local

# WSL-specific config
COPY <<'WSLCONF' /etc/wsl.conf
[boot]
systemd = false

[user]
default = dweb

[network]
hostname = dweb
generateHosts = false

[interop]
enabled = true
appendWindowsPath = true
WSLCONF

# Environment profile
COPY <<'PROFILE' /etc/profile.d/dweb.sh
# dweb WSL environment
export DISPLAY=:0
export BROWSER=none
export NODE_ENV=production
export PORT=49737
export PATH="$PATH:/opt/dweb/tools"
alias dweb-start='sudo rc-service dweb start'
alias dweb-stop='sudo rc-service dweb stop'
alias dweb-restart='sudo rc-service dweb restart'
alias dweb-logs='tail -f /var/log/dweb.log'
alias dweb-status='curl -s http://localhost:49737/ping | python3 -m json.tool 2>/dev/null || curl -s http://localhost:49737/ping'
PROFILE

# User .profile (login shell) and .bashrc (interactive non-login shell) for auto-start
RUN mkdir -p /home/dweb && chown dweb:dweb /home/dweb
COPY <<'DOTPROFILE' /home/dweb/.profile
# dweb — auto-start on WSL boot (login shell)
if [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
DOTPROFILE

COPY <<'BASHRC' /home/dweb/.bashrc
# dweb — auto-start services on WSL boot (interactive shell)
if [ -z "$DWEB_STARTED" ]; then
  export DWEB_STARTED=1
  sudo mkdir -p /var/log 2>/dev/null
  if ! curl -sf http://localhost:49737/ping &>/dev/null; then
    node /opt/dweb/dweb.cjs &>/var/log/dweb.log &
    echo "  dweb-server starting on http://localhost:49737"
    echo "  (logs: tail -f /var/log/dweb.log)"
  fi
fi
BASHRC

# Enable boot services
RUN rc-update add dweb default 2>/dev/null || true \
  && rc-update add networking default 2>/dev/null || true \
  && rc-update add sshd default 2>/dev/null || true

# ── Cleanup for size ──────────────────────────────────────────────────────────
RUN rm -rf /var/cache/apk/* \
  && rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* \
  && rm -rf /root/.npm/* /root/.cache/* /root/.node-gyp/* \
  && rm -rf /tmp/* \
  && find /var/log -type f -delete 2>/dev/null || true

# ── Ownership ─────────────────────────────────────────────────────────────────
RUN chown -R dweb:dweb /opt/dweb

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 49737

# ── Entrypoint ────────────────────────────────────────────────────────────────
# In Docker mode, start dweb-server directly
# When exported as WSL rootfs, /etc/init.d/dweb handles auto-start
CMD ["/usr/bin/node", "/opt/dweb/dweb.cjs"]
