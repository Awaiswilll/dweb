# dweb WSL Distro

**dweb** packaged as an Alpine Linux-based WSL (Windows Subsystem for Linux) distribution. Includes dweb-server, dweb CLI, MOTD (welcome banner), auto-update, and Ollama for local AI — all pre-configured and ready to use.

## Requirements

- Windows 10/11 with WSL2 installed
- 1GB+ free disk space
- 2GB+ RAM recommended
- Internet connection (for first-time setup)

## Quick Start (Windows)

### Method 1: PowerShell Script (Recommended)

```powershell
# Download and run the import script
curl -O https://github.com/dweb/dweb/releases/latest/download/import-dweb-wsl.ps1
.\import-dweb-wsl.ps1
```

### Method 2: Manual Import

```powershell
# Download the tarball
curl -LO https://github.com/dweb/dweb/releases/latest/download/dweb-wsl-rootfs.tar.gz

# Import into WSL
wsl --import dweb ./dweb-wsl/ ./dweb-wsl-rootfs.tar.gz --version 2

# Start dweb
wsl -d dweb
```

### Method 3: Build from Source

```bash
# Clone the repo
git clone https://github.com/dweb/dweb.git
cd dweb

# Build the frontend
npm install
npm run build

# Build the WSL distro
bash packaging/wsl/build-wsl-distro.sh

# Import into WSL (from Windows)
wsl --import dweb ./dweb-wsl/ ./packaging/wsl/dweb-wsl-rootfs.tar.gz --version 2
wsl -d dweb
```

## Access

Open your browser to:

```
http://localhost:49737
```

## What's Included

| Component | Description |
|-----------|-------------|
| **dweb-server** | P2P Dev + Hosting Platform — serves the React frontend on port 49737 |
| **dweb CLI** | `dweb status`, `logs`, `start`, `stop`, `restart`, `ping`, `update`, `help` |
| **MOTD Banner** | Welcome screen with server status, Node.js version, memory, uptime on login |
| **Auto-Update** | Checks GitHub releases for newer distro versions, applies in-place with backup |
| **Ollama** | Local AI model runner (download models with `ollama pull <model>`) |
| **Alpine Linux** | Lightweight, secure base operating system (46MB compressed) |

## Usage

### dweb CLI (Primary Interface)

```bash
dweb status      # Server health, PID, memory, disk usage
dweb logs -f     # Tail server logs
dweb start       # Start dweb-server
dweb stop        # Stop dweb-server
dweb restart     # Restart the server
dweb ping        # Quick health check
dweb update      # Check GitHub for newer releases, apply update
dweb help        # Show all commands
```

### MOTD Banner

On every login, you'll see the dweb welcome screen:
```
╔══════════════════════════════════════════════╗
║              dweb OS  v0.1.0                 ║
║     Self-Hosted Dev Portal + P2P Network     ║
╚══════════════════════════════════════════════╝

🌐 Server:    http://localhost:49737
📡 Status:    ✅ Running
🟢 Node.js:   v22.14.0
💻 Memory:    42M / 1982M
⏱️  Uptime:    up 2 hours
📊 Load:      0.15 / 0.20 / 0.25

Commands:  dweb status   dweb logs   dweb restart
          dweb update   dweb help
```

### Starting/Stopping dweb

```bash
# Using the dweb CLI:
dweb start          # Start dweb-server
dweb stop           # Stop dweb-server
dweb restart        # Restart dweb-server
dweb status         # Check if running
dweb logs -f        # View server logs
```

Or using service commands directly:

```bash
sudo rc-service dweb start
sudo rc-service dweb stop
sudo rc-service dweb restart
```

### Using opencode CLI

```bash
opencode --help
opencode "explain this code"
opencode --model claude-3.5-sonnet
```

### Managing Ollama

```bash
# Check Ollama status
ollama ps

# Pull a model
ollama pull llama3.2

# Run a model interactively
ollama run llama3.2

# List downloaded models
ollama list
```

### File System

| Path | Purpose |
|------|---------|
| `/opt/dweb/` | dweb code (server + frontend) |
| `/var/log/dweb.log` | Server logs |
| `/etc/init.d/dweb` | OpenRC service script |
| `/etc/profile.d/dweb-motd.sh` | MOTD banner script |
| `/usr/bin/dweb` | dweb CLI |
| `/opt/dweb/tools/dweb-update.sh` | Auto-update script |
| `/home/dweb/` | Default user home |

## Building the Distro Yourself

### Option 1: Docker (Recommended)

```bash
cd /path/to/dweb
docker build -t dweb-wsl -f packaging/wsl/Dockerfile .
docker run --name dweb-wsl-temp dweb-wsl /bin/true
docker export dweb-wsl-temp -o packaging/wsl/dweb-wsl-rootfs.tar.gz
docker rm dweb-wsl-temp
```

### Option 2: Build Script

```bash
cd /path/to/dweb
bash packaging/wsl/build-wsl-distro.sh
```

### Option 3: Inline Install (existing WSL)

```bash
# Inside an Alpine WSL instance:
bash packaging/wsl/install.sh
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `49737` | dweb-server HTTP port |
| `RELAY_PORT` | `49736` | P2P relay port |
| `NODE_ENV` | `production` | Node.js environment |
| `DISPLAY` | `:0` | X display (for WSL) |
| `BROWSER` | `none` | Browser launcher (none = headless) |

## Troubleshooting

### Port 49737 already in use

```bash
# Check what's using the port
sudo netstat -tlnp | grep 49737

# Change the port
PORT=49738 node /opt/dweb/dweb.cjs
```

### dweb won't start

```bash
# Check logs
dweb logs

# Check if Node.js is installed
node --version

# Restart the service
dweb restart
```

### WSL import fails

```powershell
# Make sure WSL2 is default
wsl --set-default-version 2

# Check WSL status
wsl --status

# Update WSL
wsl --update
```

### Ollama not responding

```bash
# Start Ollama manually
ollama serve

# Check Ollama status
ollama ps

# Pull a model if none are downloaded
ollama pull llama3.2
```

### Network issues

```powershell
# From Windows, check if the port is accessible
curl http://localhost:49737/ping

# WSL network reset (from PowerShell admin):
net stop wslservice
wsl --shutdown
wsl -d dweb
```

## Updating

```bash
# Automatic update (checks GitHub releases):
dweb update

# Manual update (from source):
# Inside WSL:
cd /opt/dweb
git pull
npm install
npm run build
dweb restart
```

## Uninstall

```powershell
# From Windows PowerShell:
wsl --unregister dweb
Remove-Item -Recurse -Force ./dweb-wsl
```

## License

MIT — see [LICENSE](../../LICENSE) for details.
