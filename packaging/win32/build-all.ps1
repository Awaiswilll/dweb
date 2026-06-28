# ═══════════════════════════════════════════════════════════════════════════════
#  build-all.ps1 — Build ALL dweb OS distributions on Windows
#
#  Prerequisites:
#    - Windows 10/11 with WSL2
#    - Docker Desktop (with WSL integration enabled)
#    - Rust toolchain (winget install Rustlang.Rustup)
#    - Node.js 22+ (winget install OpenJS.NodeJS.LTS)
#    - Visual Studio Build Tools with "Desktop development with C++"
#
#  Usage:
#    Open PowerShell as Administrator
#    cd C:\path\to\dweb
#    .\packaging\win32\build-all.ps1
# ═══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$OutputDir = Join-Path $ProjectRoot "dist-builds"

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

function Write-Step {
    param([string]$Message)
    Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Error2 {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PREREQUISITE CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Checking Prerequisites"

$prereqs = @{
    "Node.js"      = { node --version 2>$null }
    "npm"          = { npm --version 2>$null }
    "Rust"         = { rustc --version 2>$null }
    "Cargo"        = { cargo --version 2>$null }
    "Git"          = { git --version 2>$null }
    "WSL"          = { wsl --version 2>$null }
}

foreach ($name in $prereqs.Keys) {
    try {
        $version = & $prereqs[$name]
        if ($version) {
            Write-Success "$name: $version"
        } else {
            Write-Error2 "$name: NOT FOUND"
        }
    } catch {
        Write-Error2 "$name: NOT FOUND"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Install Frontend Dependencies & Build
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Step 1: Building Frontend"

Set-Location $ProjectRoot
npm install
npm run build

if (Test-Path "$ProjectRoot\dist\index.html") {
    Write-Success "Frontend built successfully"
} else {
    Write-Error2 "Frontend build failed"
    exit 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Build Tauri Desktop App (Windows NSIS Installer)
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Step 2: Building Tauri Desktop App (NSIS Installer)"

npx tauri build

$nsisPath = Get-ChildItem -Path "$ProjectRoot\src-tauri\target\release\bundle\nsis" -Filter "*.exe" -Recurse 2>$null | Select-Object -First 1
if ($nsisPath) {
    Copy-Item $nsisPath.FullName -Destination "$OutputDir\dweb_x64-setup.exe" -Force
    Write-Success "NSIS Installer: $OutputDir\dweb_x64-setup.exe"
} else {
    Write-Error2 "NSIS build failed — check Tauri build output"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Build MSIX Package (Microsoft Store)
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Step 3: Building MSIX Package"

Set-Location "$ProjectRoot\packaging\win32"
.\build-msix.ps1

$msixPath = Get-ChildItem -Path "$ProjectRoot\packaging\win32" -Filter "*.msix" -Recurse 2>$null | Select-Object -First 1
if ($msixPath) {
    Copy-Item $msixPath.FullName -Destination "$OutputDir\dweb.msix" -Force
    Write-Success "MSIX Package: $OutputDir\dweb.msix"
} else {
    Write-Error2 "MSIX build failed — check build-msix.ps1 output"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Build WSL Distro Tarball
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Step 4: Building WSL Distro Tarball"

# Check if pre-built tarball exists (from Linux build)
$wslTarball = "$ProjectRoot\packaging\wsl\dweb-wsl-rootfs.tar.gz"
if (Test-Path $wslTarball) {
    Copy-Item $wslTarball -Destination "$OutputDir\dweb-wsl-rootfs.tar.gz" -Force
    Write-Success "WSL Distro: $OutputDir\dweb-wsl-rootfs.tar.gz (pre-built)"
} else {
    # Try Docker-based build
    try {
        docker --version 2>$null
        Write-Host "  Building via Docker..." -ForegroundColor Yellow

        Set-Location "$ProjectRoot\packaging\wsl"
        docker build -t dweb-wsl .
        docker create --name dweb-wsl-temp dweb-wsl
        docker export dweb-wsl-temp -o "$OutputDir\dweb-wsl-rootfs.tar"
        docker rm dweb-wsl-temp

        # Compress
        Compress-Archive -Path "$OutputDir\dweb-wsl-rootfs.tar" -DestinationPath "$OutputDir\dweb-wsl-rootfs.tar.gz" -Force
        Remove-Item "$OutputDir\dweb-wsl-rootfs.tar" -Force

        Write-Success "WSL Distro: $OutputDir\dweb-wsl-rootfs.tar.gz"
    } catch {
        Write-Error2 "WSL Distro build failed — Docker not available or build error"
        Write-Host "  Download pre-built tarball from GitHub releases instead" -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 5: Build Docker Image
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Step 5: Building Docker Image"

try {
    docker --version 2>$null
    Set-Location $ProjectRoot
    docker build -t dweb/dweb:latest -f packaging/wsl/Dockerfile .

    Write-Success "Docker Image: dweb/dweb:latest"
    Write-Host "  To push to Docker Hub:" -ForegroundColor Yellow
    Write-Host "    docker login" -ForegroundColor Gray
    Write-Host "    docker push dweb/dweb:latest" -ForegroundColor Gray
} catch {
    Write-Error2 "Docker build failed"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Build Summary"

Write-Host "All built artifacts are in: $OutputDir`n" -ForegroundColor Cyan

$artifacts = Get-ChildItem -Path $OutputDir -File
if ($artifacts) {
    foreach ($artifact in $artifacts) {
        $size = [math]::Round($artifact.Length / 1MB, 1)
        Write-Host "  📦 $($artifact.Name) ($size MB)" -ForegroundColor White
    }
} else {
    Write-Host "  No artifacts found — check build output above" -ForegroundColor Yellow
}

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Next Steps:" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "  1. Test WSL Distro:" -ForegroundColor Yellow
Write-Host "     wsl --import dweb C:\dweb-wsl $OutputDir\dweb-wsl-rootfs.tar.gz --version 2" -ForegroundColor Gray
Write-Host "     wsl -d dweb" -ForegroundColor Gray
Write-Host "     Open http://localhost:49737`n" -ForegroundColor Gray

Write-Host "  2. Test Desktop App:" -ForegroundColor Yellow
Write-Host "     Run $OutputDir\dweb_x64-setup.exe`n" -ForegroundColor Gray

Write-Host "  3. Submit to Microsoft Store:" -ForegroundColor Yellow
Write-Host "     Go to https://aka.ms/submitwindowsapp" -ForegroundColor Gray
Write-Host "     Select 'dweb' → Upload $OutputDir\dweb.msix`n" -ForegroundColor Gray

Write-Host "  4. Push Docker Image:" -ForegroundColor Yellow
Write-Host "     docker login && docker push dweb/dweb:latest`n" -ForegroundColor Gray
