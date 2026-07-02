#!/bin/sh
# dweb OS — Message of the Day
# Displayed on interactive shell login

# Only show on interactive login, not scp/sftp
if [ -n "$SSH_CLIENT" ] || [ -n "$SSH_TTY" ] || [ -t 0 ]; then
  # Get server status
  DWEB_STATUS=$(curl -sf http://localhost:49737/ping 2>/dev/null || echo "offline")
  DWEB_OK=$(echo "$DWEB_STATUS" | grep -c '"ok"' 2>/dev/null || true)

  # System info
  UPTIME=$(uptime -p 2>/dev/null | sed 's/up //' || echo "unknown")
  LOAD=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo "?")
  MEM=$(free -m 2>/dev/null | awk '/Mem:/ {print $3 "M / " $2 "M"}' || echo "?")
  NODE_VER=$(node --version 2>/dev/null || echo "not installed")
  IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

  echo ""
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║              dweb OS  v0.1.0                 ║"
  echo "  ║     Self-Hosted Dev Portal + P2P Network     ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo ""
  echo "  🌐 Server:    http://localhost:49737"
  echo "  📡 Status:    $([ "$DWEB_OK" -gt 0 ] && echo "✅ Running" || echo "⏳ Starting...")"
  echo "  🟢 Node.js:   $NODE_VER"
  echo "  💻 Memory:    $MEM"
  echo "  ⏱️  Uptime:    $UPTIME"
  echo "  📊 Load:      $LOAD"
  echo "  🖥️  IP:        $IP"
  echo ""
  echo "  Commands:  dweb status   dweb logs   dweb restart"
  echo "            dweb update   dweb help"
  echo ""
fi
