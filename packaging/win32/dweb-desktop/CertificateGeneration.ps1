<#
.DESCRIPTION
    Generates a self-signed code signing certificate for testing the dweb Desktop
    MSIX package. This certificate is for LOCAL DEVELOPMENT ONLY.
    
    FOR STORE SUBMISSION:
    You MUST replace this with a certificate from a trusted CA (DigiCert, Sectigo, etc.)
    OR use the Microsoft Store automatic signing pipeline.
    
    See: https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$SubjectName = "CN=dweb",

    [Parameter()]
    [string]$PfxPath = "$PSScriptRoot\dweb-desktop_TemporaryKey.pfx",

    [Parameter()]
    [string]$CertStoreLocation = "Cert:\CurrentUser\My",

    [Parameter()]
    [int]$ValidYears = 5,

    [Parameter()]
    [switch]$InstallCertificate
)

Write-Host "== dweb Desktop Certificate Generator ==" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Generate self-signed certificate ---
Write-Host "[1/4] Generating self-signed certificate..." -ForegroundColor Yellow
$certParams = @{
    Subject           = $SubjectName
    CertStoreLocation = $CertStoreLocation
    KeyExportPolicy   = "Exportable"
    KeySpec           = "Signature"
    KeyUsage          = "DigitalSignature"
    TextExtension     = @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")  # Code Signing EKU
    NotAfter          = (Get-Date).AddYears($ValidYears)
}

$cert = New-SelfSignedCertificate @certParams

if (-not $cert)
{
    Write-Error "Certificate generation failed."
    exit 1
}

Write-Host "  Certificate thumbprint: $($cert.Thumbprint)" -ForegroundColor Green

# --- Step 2: Export as PFX ---
Write-Host "[2/4] Exporting certificate to PFX..." -ForegroundColor Yellow
$password = Read-Host -Prompt "  Enter a password for the PFX file (or press Enter for no password)" -AsSecureString

if (-not $password -or $password.Length -eq 0)
{
    $pwdParams = @{FilePath = $PfxPath; Cert = $cert}
    Export-PfxCertificate @pwdParams
}
else
{
    $pwdParams = @{FilePath = $PfxPath; Cert = $cert; Password = $password}
    Export-PfxCertificate @pwdParams
}

Write-Host "  PFX exported to: $PfxPath" -ForegroundColor Green

# --- Step 3: Optionally install to Trusted Root store ---
if ($InstallCertificate)
{
    Write-Host "[3/4] Installing certificate to Trusted Root store..." -ForegroundColor Yellow
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($cert)
    $store.Close()
    Write-Host "  Certificate installed to Trusted Root store." -ForegroundColor Green
}
else
{
    Write-Host "[3/4] Skipping Trusted Root install (use -InstallCertificate to auto-install)." -ForegroundColor Gray
}

# --- Step 4: Print summary and Store instructions ---
Write-Host "[4/4] Summary" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Certificate generated successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Subject:       $SubjectName"
Write-Host "  Thumbprint:    $($cert.Thumbprint)"
Write-Host "  PFX Location:  $PfxPath"
Write-Host "  Expires:       $($cert.NotAfter)"
Write-Host ""

# --- Instructions for MSIX signing ---
Write-Host "--- MSIX Signing Instructions ---" -ForegroundColor Cyan
Write-Host ""
Write-Host "To sign the MSIX package with this certificate:" -ForegroundColor White
Write-Host ""
Write-Host '  SignTool sign /fd SHA256 /a /f "dweb-desktop_TemporaryKey.pfx" /p <password> /v <package>.msix' -ForegroundColor Gray
Write-Host ""
Write-Host "--- Microsoft Store Submission Notes ---" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. For Store submission, the Store handles signing automatically."
Write-Host "  2. Upload your MSIX to Partner Center without manual signing."
Write-Host "  3. The self-signed cert is for LOCAL TESTING only."
Write-Host "  4. If distributing outside the Store, purchase a code signing"
Write-Host "     certificate from a trusted CA (DigiCert, Sectigo, etc.)."
Write-Host "  5. Make sure Subject matches the Publisher in Package.appxmanifest."
Write-Host ""
Write-Host "=== End ===" -ForegroundColor Cyan
