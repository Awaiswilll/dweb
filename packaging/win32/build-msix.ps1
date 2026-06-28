<#
.DESCRIPTION
    Build script for creating the dweb Desktop MSIX package.
    
    This script:
    1. Restores NuGet packages
    2. Builds the project in Release configuration
    3. Creates the MSIX package
    4. Signs it with a self-signed certificate (for local testing)
    5. Copies the output to a build artifacts folder
    
    PREREQUISITES:
    - Windows 10+ with WSL2 enabled
    - WebView2 Runtime (included in Windows 11, available for Windows 10)
    - .NET 8.0 SDK
    - Visual Studio 2022 (optional, can use dotnet CLI alone)
    - MSIX Packaging SDK
    
    USAGE:
    .\build-msix.ps1 [-Configuration Release] [-OutputDir .\BuildOutput] [-Sign] [-CertificatePath <path>]
    
    EXAMPLES:
    .\build-msix.ps1
    .\build-msix.ps1 -Configuration Debug -OutputDir .\DebugBuild
    .\build-msix.ps1 -Sign -CertificatePath .\cert.pfx
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [Parameter()]
    [string]$OutputDir = "$PSScriptRoot\BuildOutput",

    [Parameter()]
    [string]$ProjectDir = "$PSScriptRoot\dweb-desktop",

    [Parameter()]
    [string]$SolutionFile = "$ProjectDir\dweb-desktop.csproj",

    [Parameter()]
    [string]$Platform = "x64",

    [Parameter()]
    [switch]$Sign,

    [Parameter()]
    [string]$CertificatePath = "$ProjectDir\dweb-desktop_TemporaryKey.pfx",

    [Parameter()]
    [string]$CertificatePassword = "",

    [Parameter()]
    [switch]$SkipRestore,

    [Parameter()]
    [switch]$VerboseBuild
)

# --- Ensure the script is running on Windows ---
if ($PSVersionTable.PSVersion.Major -lt 5 -or -not $IsWindows -and $null -eq (Get-Command "cmd" -ErrorAction SilentlyContinue))
{
    Write-Error "This script must be run on Windows with PowerShell 5+ or PowerShell 7+."
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  dweb Desktop - MSIX Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Resolve build tools ---
Write-Host "[1/6] Resolving build tools..." -ForegroundColor Yellow

# Check for dotnet CLI
$dotnetPath = Get-Command "dotnet" -ErrorAction SilentlyContinue
if (-not $dotnetPath)
{
    Write-Error "dotnet CLI not found. Install .NET 8.0 SDK from https://dotnet.microsoft.com/download"
    exit 1
}
Write-Host "  dotnet: $($dotnetPath.Source)" -ForegroundColor Green

# Check for MSBuild
$msbuildPath = & "$dotnetPath" msbuild -version 2>$null
if (-not $?)
{
    Write-Warning "  MSBuild resolution via dotnet failed, will use dotnet build instead."
}

# --- Step 2: Restore NuGet packages ---
if (-not $SkipRestore)
{
    Write-Host "[2/6] Restoring NuGet packages..." -ForegroundColor Yellow
    $restoreArgs = @("restore", "`"$SolutionFile`"")
    
    if ($VerboseBuild) { $restoreArgs += "--verbosity", "normal" }
    else { $restoreArgs += "--verbosity", "minimal" }
    
    & $dotnetPath $restoreArgs
    
    if ($LASTEXITCODE -ne 0)
    {
        Write-Error "NuGet restore failed with exit code $LASTEXITCODE."
        exit 1
    }
    Write-Host "  Packages restored successfully." -ForegroundColor Green
}
else
{
    Write-Host "[2/6] Skipping NuGet restore (SkipRestore specified)." -ForegroundColor Gray
}

# --- Step 3: Build the project ---
Write-Host "[3/6] Building project ($Configuration | $Platform)..." -ForegroundColor Yellow

$buildArgs = @(
    "build",
    "`"$SolutionFile`"",
    "--configuration", $Configuration,
    "--runtime", "win-$Platform",
    "--no-restore"
)

if ($VerboseBuild)
{
    $buildArgs += "--verbosity", "detailed"
}
else
{
    $buildArgs += "--verbosity", "minimal"
}

& $dotnetPath $buildArgs

if ($LASTEXITCODE -ne 0)
{
    Write-Error "Build failed with exit code $LASTEXITCODE."
    exit 1
}
Write-Host "  Build completed successfully." -ForegroundColor Green

# --- Step 4: Create MSIX package ---
Write-Host "[4/6] Creating MSIX package..." -ForegroundColor Yellow

# Determine the output path of the built app
$appOutputDir = "$ProjectDir\bin\$Configuration\net8.0-windows10.0.19041.0\win-$Platform\AppX"

if (-not (Test-Path $appOutputDir))
{
    # Fallback: check the standard publish folder
    $appOutputDir = "$ProjectDir\bin\$Configuration\net8.0-windows10.0.19041.0\win-$Platform\publish"
}

if (-not (Test-Path $appOutputDir))
{
    Write-Warning "  Could not find AppX output at expected path. Searching..."
    $appOutputDir = & "$dotnetPath" msbuild "`"$SolutionFile`"" /t:GetMsixOutputPath /p:Configuration=$Configuration /p:Platform=$Platform 2>$null | Select-String -Pattern "^\w:" | Select-Object -Last 1
    
    if (-not $appOutputDir)
    {
        Write-Error "  Could not determine MSIX output path. Build may have failed to generate AppX."
        exit 1
    }
}

# Use MakeAppx if available, otherwise try dotnet msbuild -t:Package
$makeAppxPath = Get-Command "MakeAppx.exe" -ErrorAction SilentlyContinue

if ($makeAppxPath)
{
    Write-Host "  Using MakeAppx.exe..." -ForegroundColor Gray
    $msixOutput = "$OutputDir\dweb-desktop_$Configuration\_$Platform.msix"
    $null = New-Item -ItemType Directory -Path (Split-Path $msixOutput) -Force

    & $makeAppxPath pack /p "`"$msixOutput`"" /d "`"$appOutputDir`"" /l

    if ($LASTEXITCODE -ne 0)
    {
        Write-Error "  MakeAppx failed with exit code $LASTEXITCODE."
        exit 1
    }
}
else
{
    Write-Host "  Using dotnet msbuild /t:Package..." -ForegroundColor Gray
    $packageArgs = @(
        "msbuild",
        "`"$SolutionFile`"",
        "/t:Package",
        "/p:Configuration=$Configuration",
        "/p:Platform=$Platform",
        "/p:AppxPackage=true",
        "/p:AppxPackageOutput=`"$OutputDir\dweb-desktop.msix`""
    )

    & $dotnetPath $packageArgs

    if ($LASTEXITCODE -ne 0)
    {
        Write-Error "  MSIX packaging failed with exit code $LASTEXITCODE."
        exit 1
    }
}
Write-Host "  MSIX package created." -ForegroundColor Green

# --- Step 5: Sign the package (optional) ---
if ($Sign)
{
    Write-Host "[5/6] Signing MSIX package..." -ForegroundColor Yellow

    if (-not (Test-Path $CertificatePath))
    {
        Write-Warning "  Certificate not found at: $CertificatePath"
        Write-Host "  Run CertificateGeneration.ps1 to create a self-signed cert for testing." -ForegroundColor Yellow
        
        $generateCert = Read-Host "  Generate a new self-signed certificate now? (y/n)"
        if ($generateCert -eq "y")
        {
            & "$PSScriptRoot\dweb-desktop\CertificateGeneration.ps1"
        }
        else
        {
            Write-Host "  Skipping signing step." -ForegroundColor Gray
        }
    }

    if (Test-Path $CertificatePath)
    {
        $signtool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
        if (-not $signtool)
        {
            $signtool = Get-Command "SignTool.exe" -ErrorAction SilentlyContinue
        }

        if (-not $signtool)
        {
            Write-Error "  SignTool not found. Install Windows SDK."
            exit 1
        }

        $msixFiles = Get-ChildItem -Path $OutputDir -Filter "*.msix" -Recurse
        foreach ($msix in $msixFiles)
        {
            $signArgs = @(
                "sign",
                "/fd", "SHA256",
                "/a",
                "/f", "`"$CertificatePath`""
            )

            if ($CertificatePassword)
            {
                $signArgs += "/p", $CertificatePassword
            }

            $signArgs += "`"$($msix.FullName)`""

            Write-Host "  Signing: $($msix.Name)" -ForegroundColor Gray
            & $signtool.Path $signArgs

            if ($LASTEXITCODE -ne 0)
            {
                Write-Error "  Signing failed for $($msix.Name)."
                exit 1
            }
            Write-Host "  Signed: $($msix.Name)" -ForegroundColor Green
        }
    }
}
else
{
    Write-Host "[5/6] Skipping signing (use -Sign to enable)." -ForegroundColor Gray
}

# --- Step 6: Copy to output ---
Write-Host "[6/6] Copying artifacts to output folder..." -ForegroundColor Yellow

$null = New-Item -ItemType Directory -Path $OutputDir -Force

# Copy MSIX packages
Get-ChildItem -Path $ProjectDir -Filter "*.msix" -Recurse | ForEach-Object {
    Copy-Item $_.FullName -Destination "$OutputDir\$($_.Name)" -Force
    Write-Host "  Copied: $($_.Name)" -ForegroundColor Gray
}

# Copy build summary
$buildInfo = @"
dweb Desktop MSIX Package
=========================
Build Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Configuration: $Configuration
Platform: $Platform
SDK Version: $(dotnet --version)
OS: $([Environment]::OSVersion.VersionString)

Files:
$(Get-ChildItem -Path $OutputDir -Recurse | Format-Table Name, Length, LastWriteTime | Out-String)
"@

$buildInfo | Out-File -FilePath "$OutputDir\BUILD_INFO.txt" -Encoding utf8
Write-Host "  Build info saved." -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Output: $OutputDir" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Test the MSIX locally by double-clicking to install"
Write-Host "    2. For Store submission, upload the unsigned MSIX to Partner Center"
Write-Host "    3. The Store will handle signing automatically"
Write-Host ""

# --- Open output folder ---
$openFolder = Read-Host "  Open output folder in Explorer? (y/n)"
if ($openFolder -eq "y")
{
    Invoke-Item $OutputDir
}
