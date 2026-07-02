<#
.SYNOPSIS
  Import the dweb WSL distro into Windows WSL

.DESCRIPTION
  Downloads the dweb WSL rootfs tarball from GitHub releases and imports it
  as a WSL distribution. Requires Windows 10/11 with WSL2 installed.

.PARAMETER TarballUrl
  URL to download the dweb-wsl-rootfs.tar.gz from (default: GitHub release)
.PARAMETER DistroName
  Name for the WSL distro (default: dweb)
.PARAMETER InstallDir
  Directory to store the WSL distro files (default: ./dweb-wsl)
.PARAMETER TarballPath
  Local path to a pre-downloaded tarball (skips download if provided)
#>

param(
  [string]$TarballUrl = "https://github.com/Awaiswilll/dweb/releases/latest/download/dweb-wsl-rootfs.tar.gz",
  [string]$DistroName = "dweb",
  [string]$InstallDir = "./dweb-wsl",
  [string]$TarballPath = ""
)

# ═══════════════════════════════════════════════════════════════════════════════
#  REQUIREMENTS CHECK
# ═══════════════════════════════════════════════════════════════════════════════

function Test-WSL {
  try {
    $null = wsl --version 2>&1
    return $true
  } catch {
    return $false
  }
}

function Test-WSL2 {
  try {
    $version = wsl --version 2>&1
    return $version -match "WSL version"
  } catch {
    return $false
  }
}

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         dweb — WSL Distro Installer                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if WSL is installed
if (-not (Test-WSL)) {
  Write-Host "[✗] WSL is not installed. Installing WSL..." -ForegroundColor Yellow
  try {
    wsl --install
    Write-Host "[✓] WSL installed. You may need to restart your computer." -ForegroundColor Green
    Write-Host "    After restart, run this script again." -ForegroundColor Yellow
    exit 0
  } catch {
    Write-Host "[✗] Failed to install WSL automatically." -ForegroundColor Red
    Write-Host "    Please install WSL manually:" -ForegroundColor Yellow
    Write-Host "    https://learn.microsoft.com/en-us/windows/wsl/install" -ForegroundColor Yellow
    exit 1
  }
}

Write-Host "[✓] WSL is installed" -ForegroundColor Green

# Check WSL version
if (-not (Test-WSL2)) {
  Write-Host "[!] WSL2 recommended. Setting WSL2 as default..." -ForegroundColor Yellow
  wsl --set-default-version 2
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Download tarball (if not provided locally)
# ═══════════════════════════════════════════════════════════════════════════════

$TempTarball = ""

if ([string]::IsNullOrEmpty($TarballPath)) {
  # Download the tarball
  $TempTarball = Join-Path $env:TEMP "dweb-wsl-rootfs.tar.gz"
  Write-Host ""
  Write-Host "Step 1/4: Downloading dweb WSL distro..." -ForegroundColor White
  Write-Host "  URL: $TarballUrl" -ForegroundColor Gray

  try {
    $ProgressPreference = 'SilentlyContinue'  # Faster downloads
    $startTime = Get-Date
    Invoke-WebRequest -Uri $TarballUrl -OutFile $TempTarball -UseBasicParsing
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    $fileSize = (Get-Item $TempTarball).Length / 1MB
    Write-Host "[✓] Downloaded ${fileSize:N1}MB in ${duration:N1}s" -ForegroundColor Green
  } catch {
    Write-Host "[✗] Download failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check your internet connection" -ForegroundColor Yellow
    Write-Host "  2. Verify the URL is accessible: $TarballUrl" -ForegroundColor Yellow
    Write-Host "  3. Download manually and pass -TarballPath <path>" -ForegroundColor Yellow
    exit 1
  }
  $TarballPath = $TempTarball
} else {
  Write-Host ""
  Write-Host "Step 1/4: Using local tarball: $TarballPath" -ForegroundColor White
  if (-not (Test-Path $TarballPath)) {
    Write-Host "[✗] File not found: $TarballPath" -ForegroundColor Red
    exit 1
  }
  $fileSize = (Get-Item $TarballPath).Length / 1MB
  Write-Host "[✓] Found ${fileSize:N1}MB tarball" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Check if distro already exists
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "Step 2/4: Checking existing installations..." -ForegroundColor White

$existingDistros = wsl --list --quiet 2>&1
if ($existingDistros -contains $DistroName) {
  Write-Host "[!] Distro '$DistroName' already exists." -ForegroundColor Yellow
  $choice = Read-Host "    Remove and re-import? (y/N)"
  if ($choice -eq "y" -or $choice -eq "Y") {
    Write-Host "    Unregistering existing distro..."
    wsl --unregister $DistroName
    Write-Host "[✓] Old distro removed" -ForegroundColor Green
  } else {
    Write-Host "    Keeping existing distro. Exiting." -ForegroundColor Yellow
    exit 0
  }
} else {
  Write-Host "[✓] No existing distro named '$DistroName'" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Import into WSL
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "Step 3/4: Importing into WSL..." -ForegroundColor White
Write-Host "  Distro name: $DistroName" -ForegroundColor Gray
Write-Host "  Install dir: $InstallDir" -ForegroundColor Gray
Write-Host "  WSL version: 2" -ForegroundColor Gray

try {
  # Create install directory if needed
  $installDirFull = New-Item -ItemType Directory -Force -Path $InstallDir
  $installDirFull = $installDirFull.FullName

  # Import the distro
  $importResult = wsl --import $DistroName $installDirFull $TarballPath --version 2 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw $importResult
  }
  Write-Host "[✓] Distro imported successfully" -ForegroundColor Green
} catch {
  Write-Host "[✗] Import failed: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "Troubleshooting:" -ForegroundColor Yellow
  Write-Host "  1. Make sure WSL2 is enabled: wsl --set-default-version 2" -ForegroundColor Yellow
  Write-Host "  2. Try importing manually:" -ForegroundColor Yellow
  Write-Host "     wsl --import $DistroName `"$InstallDir`" `"$TarballPath`" --version 2" -ForegroundColor Yellow
  exit 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Start the distro
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "Step 4/4: Starting dweb..." -ForegroundColor White

try {
  # Set the distro as default
  wsl --set-default $DistroName 2>&1 | Out-Null

  # Start it
  Write-Host "  Starting $DistroName WSL distro..." -ForegroundColor Gray
  $startResult = wsl -d $DistroName -- /bin/true 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw $startResult
  }
  Write-Host "[✓] Distro started" -ForegroundColor Green
} catch {
  Write-Host "[✗] Could not start distro: $_" -ForegroundColor Yellow
  Write-Host "    You can start it manually with: wsl -d $DistroName" -ForegroundColor Yellow
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════

if ($TempTarball -and (Test-Path $TempTarball)) {
  Remove-Item $TempTarball -Force
  Write-Host "[✓] Cleaned up temporary files" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SUCCESS
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          dweb is ready!                              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Open in your browser:" -ForegroundColor White
Write-Host "    http://localhost:49737" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "    wsl -d $DistroName          # Start the distro" -ForegroundColor Gray
Write-Host "    wsl -d $DistroName -- bash  # Open a shell" -ForegroundColor Gray
Write-Host "    wsl --terminate $DistroName # Stop the distro" -ForegroundColor Gray
Write-Host ""
Write-Host "  Inside WSL:" -ForegroundColor White
Write-Host "    dweb status       # Check server status (MOTD banner)" -ForegroundColor Gray
Write-Host "    dweb logs -f      # View server logs" -ForegroundColor Gray
Write-Host "    dweb restart      # Restart dweb-server" -ForegroundColor Gray
Write-Host "    dweb update       # Check for dweb OS updates" -ForegroundColor Gray
Write-Host "    dweb help         # Show all CLI commands" -ForegroundColor Gray
Write-Host ""
Write-Host "  Need help? https://github.com/Awaiswilll/dweb/issues" -ForegroundColor Yellow
Write-Host ""
