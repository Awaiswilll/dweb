#!/bin/sh
# dweb-update — Auto-update for dweb WSL distro
# Checks GitHub releases and can download/apply updates
# Usage: dweb update  (or run directly: /opt/dweb/tools/dweb-update.sh)

set -e

VERSION="0.1.0"
OWNER="Awaiswilll"
REPO="dweb"
API="https://api.github.com/repos/$OWNER/$REPO/releases/latest"

info()  { echo "  [INFO] $1"; }
warn()  { echo "  [WARN] $1"; }
error() { echo "  [ERROR] $1"; exit 1; }

# ── Check for updates ─────────────────────────────────────────────

check() {
  info "Checking for dweb OS updates..."

  local release_data
  release_data=$(curl -sf "$API" 2>/dev/null || echo "")

  if [ -z "$release_data" ]; then
    warn "Could not reach GitHub API. Check your network connection."
    return 1
  fi

  local latest_tag
  latest_tag=$(echo "$release_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tag_name', 'unknown'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

  local published_at
  published_at=$(echo "$release_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('published_at', ''))
except:
    print('')
" 2>/dev/null || echo "")

  echo ""
  echo "  Current version: v$VERSION"
  echo "  Latest release:  $latest_tag"
  echo "  Published:       $(echo "$published_at" | cut -dT -f1 2>/dev/null || echo '?')"
  echo ""

  if [ "$latest_tag" = "v$VERSION" ]; then
    echo "  ✅ You are running the latest version."
    return 0
  elif [ "$latest_tag" = "unknown" ] || [ -z "$latest_tag" ]; then
    warn "Could not determine latest version."
    return 1
  else
    echo "  ⬆️  Update available: $latest_tag"
    return 2
  fi
}

# ── Download latest tarball ───────────────────────────────────────

download() {
  local release_data
  release_data=$(curl -sf "$API" 2>/dev/null || echo "")

  local tarball_url
  tarball_url=$(echo "$release_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for a in d.get('assets', []):
        if 'dweb-wsl-rootfs' in a['name']:
            print(a['browser_download_url'])
            break
except:
    pass
" 2>/dev/null || echo "")

  if [ -z "$tarball_url" ]; then
    error "No WSL tarball found in latest release."
  fi

  local dest="/tmp/dweb-update.tar.gz"
  info "Downloading: $tarball_url"
  curl -L -o "$dest" "$tarball_url" 2>&1 | tail -1

  if [ -f "$dest" ]; then
    local size
    size=$(du -h "$dest" | cut -f1)
    info "Downloaded: $size"
    echo "$dest"
  else
    error "Download failed."
  fi
}

# ── Apply update ──────────────────────────────────────────────────

apply() {
  local tarball="${1:-/tmp/dweb-update.tar.gz}"

  if [ ! -f "$tarball" ]; then
    error "Tarball not found: $tarball"
  fi

  warn "Applying update from: $tarball"
  warn "This will replace the current dweb installation."

  # Backup current config
  local backup_dir="/tmp/dweb-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup_dir"
  cp -r /opt/dweb "$backup_dir/" 2>/dev/null || true
  info "Backup saved to: $backup_dir"

  # Apply new rootfs — only replace /opt/dweb and /usr/bin/dweb
  local temp_dir
  temp_dir=$(mktemp -d)
  tar xzf "$tarball" -C "$temp_dir"

  if [ -f "$temp_dir/usr/bin/dweb" ]; then
    cp "$temp_dir/usr/bin/dweb" /usr/bin/dweb
    chmod +x /usr/bin/dweb
    info "Updated: /usr/bin/dweb"
  fi

  if [ -d "$temp_dir/opt/dweb" ]; then
    cp -r "$temp_dir/opt/dweb/"* /opt/dweb/
    info "Updated: /opt/dweb/"
  fi

  # Restart server
  dweb restart 2>/dev/null || true

  rm -rf "$temp_dir"
  info "Update applied successfully!"
  info "Backup at: $backup_dir"
}

# ── Main ──────────────────────────────────────────────────────────

case "${1:-check}" in
  check)
    check
    ;;
  download)
    download
    ;;
  apply)
    apply "$2"
    ;;
  upgrade|update)
    check
    local rc=$?
    if [ $rc -eq 2 ]; then
      echo ""
      local tarball
      tarball=$(download)
      apply "$tarball"
    fi
    ;;
  *)
    echo "Usage: $0 {check|download|apply|upgrade}"
    exit 1
    ;;
esac
