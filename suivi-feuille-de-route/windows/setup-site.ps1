#Requires -RunAsAdministrator
<#
  Cree le site IIS "SuiviFDR" (port 80) en reverse proxy vers l'app Waitress (127.0.0.1:8000),
  avec le web.config fourni (authentification Windows). Necessite ARR 3.0 + URL Rewrite installes
  (MSI depuis https://www.iis.net/downloads/microsoft/application-request-routing et .../url-rewrite).
  Usage (PowerShell admin, depuis le dossier de l'app ou avec chemin absolu) :
    powershell -ExecutionPolicy Bypass -File .\windows\setup-site.ps1
#>
param(
    [string]$AppDir = "C:\apps\suivi-feuille-de-route",
    [string]$SiteName = "SuiviFDR",
    [int]$Port = 80,
    [string]$PhysicalPath = "C:\inetpub\wwwroot"
)

$ErrorActionPreference = "Stop"
Import-Module WebAdministration

# 0. Verifier que l'app tourne bien en local
$svc = Get-Service SuiviFDR -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne "Running") {
    Write-Warning "Le service SuiviFDR n'est pas Running. Lancez d'abord install-service.ps1."
}

# 1. Activer le proxy ARR (equivalent du "Enable proxy" dans IIS Manager)
try {
    Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled" -value "True"
    Write-Host "[1/4] Proxy ARR active"
} catch {
    Write-Warning "ARR semble non installe : installez ARR 3.0 + URL Rewrite 2.1 (MSI depuis iis.net) puis relancez ce script."
}

# 2. Arreter le site par defaut et creer le site SuiviFDR
Stop-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) { Remove-Website -Name $SiteName }
New-Item -ItemType Directory -Force -Path $PhysicalPath | Out-Null
New-Website -Name $SiteName -Port $Port -PhysicalPath $PhysicalPath -Force | Out-Null
Write-Host "[2/4] Site $SiteName cree sur le port $Port ($PhysicalPath)"

# 3. Deployer le web.config (reverse proxy + Windows Authentication)
Copy-Item (Join-Path $AppDir "windows\web.config") (Join-Path $PhysicalPath "web.config") -Force
Write-Host "[3/4] web.config copie (proxy vers 127.0.0.1:8000 + auth Windows)"

# 4. Redemarrer IIS
iisreset | Out-Null
Write-Host "[4/4] IIS redemarre"
Write-Host ""
Write-Host "Testez depuis le serveur :  http://127.0.0.1/  (ou http://localhost/)"
Write-Host "Puis depuis un poste du domaine :  http://WIN-209BDR3JSTD/  (avec vos identifiants AD)"
