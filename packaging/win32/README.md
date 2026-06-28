# dweb Desktop — Win32 Packaging

This directory contains the Windows desktop packaging for **dweb**, a self-hosted developer portal. It produces two Microsoft Store products:

| Product | Description | MSIX |
|---------|-------------|------|
| **dweb Desktop** | WPF + WebView2 wrapper that hosts the dweb web UI | `dweb-desktop/` |
| **dweb WSL Distro** | WSL distribution image for the dweb backend environment | `dweb-wsl-distro/` |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Windows | 10 22H2+ or 11 | WSL2 support required |
| .NET SDK | 8.0+ | [Download](https://dotnet.microsoft.com/download/dotnet/8.0) |
| WebView2 Runtime | Evergreen | Ships with Windows 11; [install for Win10](https://developer.microsoft.com/microsoft-edge/webview2/) |
| WSL | 2.x | `wsl --install` |
| Visual Studio 2022 | 17.8+ | Optional — workload: ".NET desktop development" + "Universal Windows Platform development" |
| Windows SDK | 10.0.19041+ | Ships with VS2022 |

---

## Building

### Using `dotnet` CLI (recommended)

```powershell
# Restore and build the desktop app
cd dweb-desktop
dotnet restore
dotnet build --configuration Release

# Run locally
dotnet run --project dweb-desktop.csproj
```

### Using the build script

```powershell
# Full build + MSIX package
.\build-msix.ps1

# Debug build
.\build-msix.ps1 -Configuration Debug -OutputDir .\DebugBuild

# Build + sign with self-signed cert
.\build-msix.ps1 -Sign
```

### Using Visual Studio 2022

1. Open `dweb-desktop/dweb-desktop.csproj`
2. Set Solution Configuration to **Release**
3. Build → Build Solution (Ctrl+Shift+B)
4. Build → Package dweb Desktop (for MSIX)

---

## Certificate & Signing

### Testing (self-signed)

```powershell
.\dweb-desktop\CertificateGeneration.ps1 -InstallCertificate
```

This generates a PFX and optionally installs it to the Trusted Root store for local testing.

### Microsoft Store submission

The Store automatically signs your MSIX — **do not sign manually before upload**. The self-signed certificate is for local testing only.

### Side-loading (outside Store)

Purchase a code signing certificate from a trusted CA (DigiCert, Sectigo) and sign:

```powershell
signtool sign /fd SHA256 /a /f certificate.pfx /p <password> package.msix
```

---

## Microsoft Store Submission

### 1. Partner Center setup

1. Go to [Partner Center](https://partner.microsoft.com/dashboard)
2. Create a new app entry for **"dweb Desktop"**
3. Reserve names for both products:
   - `dweb Desktop`
   - `dweb WSL Distro`

### 2. Upload MSIX

1. Navigate to **Products → Your app → Submission → Packages**
2. Upload the unsigned MSIX from `BuildOutput/`
3. The Store will reject signed packages — upload only unsigned `.msix`

### 3. Certification notes

- Ensure `Package.appxmanifest` Identity Publisher matches your Partner Center publisher
- Include privacy policy URL (required by Store policy)
- WebView2 based apps must not inject arbitrary web content
- WSL distro requires approval for the `systemManagement` capability

### 4. Pricing & availability

- Recommended: **Free**
- Available to all countries/regions
- No in-app purchases

---

## Local Testing

### Run the desktop app

```powershell
dotnet run --project dweb-desktop\dweb-desktop.csproj
```

### Install the MSIX locally

```powershell
# Double-click the .msix file, or:
Add-AppPackage .\BuildOutput\dweb-desktop.msix
```

### Verify WSL integration

```powershell
wsl --list --running
# Should show "dweb" if the distro is active
wsl -d dweb
# Opens a shell into the dweb environment
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  dweb Desktop (MSIX)             │
│  ┌────────────────────────────────────────────┐  │
│  │          WPF Window (MainWindow)           │  │
│  │  ┌────────────────────────────────────┐   │  │
│  │  │      WebView2 (Edge Chromium)      │   │  │
│  │  │   http://localhost:49737            │   │  │
│  │  └────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────┘  │
│        │                                          │
│        ▼ WSL network bridge                       │
│  ┌────────────────────────────────────────────┐   │
│  │     dweb WSL Distro (WSL2 instance)        │   │
│  │  ┌────────────────────────────────────┐   │   │
│  │  │  dweb backend (HTTP server :49737) │   │   │
│  │  └────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## Troubleshooting

### WebView2 blank / white screen

```
Ensure the dweb WSL backend is running:
  wsl -d dweb
  curl http://localhost:49737      # Should return HTML
```

### MSIX install fails

```
Check the event log:
  Event Viewer → Applications and Services Logs → Microsoft → Windows → AppxPackaging → Microsoft-Windows-AppxPackaging/Operational

Common fixes:
  - Enable Developer Mode in Windows Settings
  - Install the certificate to Trusted Root store
  - Verify the MSIX was built for your architecture (x64/ARM64)
```

### Build error: "WebView2 SDK not found"

```
dotnet restore should pull Microsoft.Web.WebView2 from NuGet.
If behind a proxy, configure NuGet:
  dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org
```

---

## File Structure

```
packaging/win32/
├── README.md
├── build-msix.ps1
├── dweb-desktop/
│   ├── dweb-desktop.csproj
│   ├── App.xaml
│   ├── App.xaml.cs
│   ├── MainWindow.xaml
│   ├── MainWindow.xaml.cs
│   ├── Package.appxmanifest
│   ├── App.ico
│   └── CertificateGeneration.ps1
└── dweb-wsl-distro/
    ├── Package.appxmanifest
    └── distro-config.xml
```

---

## License

Same as the dweb project.
