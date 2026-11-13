#Requires -RunAsAdministrator
<#
  Installe l'application "Suivi feuille de route 2027-2030" comme service Windows (Waitress).
  A executer SUR LE SERVEUR, en PowerShell administrateur, depuis le dossier de l'application :
    powershell -ExecutionPolicy Bypass -File .\windows\install-service.ps1
  (ou clic droit sur le fichier > "Executer avec PowerShell")
#>
param(
    [string]$AppDir = "C:\apps\suivi-feuille-de-route",
    [string]$ServiceName = "SuiviFDR",
    [string]$ListenHost = "127.0.0.1",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $AppDir "app.py"))) {
    Write-Error "Dossier applicatif introuvable : $AppDir (app.py absent). Passez -AppDir <chemin du dossier suivi-feuille-de-route>."
    exit 1
}

# 1. Localisation de Python
$python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if (-not $python) {
    foreach ($c in @("C:\Python312\python.exe", "C:\Program Files\Python312\python.exe",
                    "C:\Python313\python.exe", "C:\Program Files\Python313\python.exe",
                    "C:\Python314\python.exe", "C:\Program Files\Python314\python.exe")) {
        if (Test-Path $c) { $python = $c; break }
    }
}
if (-not $python) { Write-Error "Python introuvable. Installez Python 3.10+ (python.org, 'Add Python to PATH', 'Install for all users')."; exit 1 }
Write-Host "[1/4] Python trouve : $python"

# 2. Dependances (Flask, openpyxl, waitress)
& $python -m pip install -r (Join-Path $AppDir "requirements.txt") -r (Join-Path $AppDir "requirements-windows.txt")
Write-Host "[2/4] Dependances installees"

# 3. NSSM (gestionnaire de services Windows)
$nssm = (Get-Command nssm.exe -ErrorAction SilentlyContinue).Source
if (-not $nssm) {
    $nssmDir = "C:\nssm"
    if (-not (Test-Path "$nssmDir\nssm.exe")) {
        Write-Host "Telechargement de NSSM..."
        $zip = "$env:TEMP\nssm.zip"
        Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
        Expand-Archive -Path $zip -DestinationPath "$env:TEMP\nssm" -Force
        $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
        New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
        Copy-Item "$env:TEMP\nssm\nssm-2.24\$arch\nssm.exe" "$nssmDir\nssm.exe"
    }
    $nssm = "$nssmDir\nssm.exe"
}
Write-Host "[3/4] NSSM : $nssm"

# 4. Creation / mise a jour du service
$logs = Join-Path $AppDir "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
    & $nssm stop $ServiceName | Out-Null
    & $nssm remove $ServiceName confirm | Out-Null
}
& $nssm install $ServiceName $python | Out-Null
& $nssm set $ServiceName AppDirectory $AppDir
& $nssm set $ServiceName AppParameters "-m waitress --listen=$ListenHost`:$Port app:app"
& $nssm set $ServiceName DisplayName "Suivi feuille de route 2027-2030"
& $nssm set $ServiceName Description "Application de suivi de la feuille de route (Flask/Waitress)"
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout (Join-Path $logs "out.log")
& $nssm set $ServiceName AppStderr (Join-Path $logs "err.log")
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760
& $nssm start $ServiceName | Out-Null

Start-Sleep -Seconds 3
$svc = Get-Service $ServiceName
Write-Host "[4/4] Service $ServiceName : $($svc.Status)"
if ($svc.Status -ne "Running") {
    Write-Warning "Le service ne tourne pas : consulter $logs\err.log"
    exit 1
}
Write-Host ""
Write-Host "OK - l'app ecoute sur http://${ListenHost}:${Port} (uniquement en local sur le serveur)."
Write-Host "Test depuis le serveur : ouvrir http://127.0.0.1:${Port} dans le navigateur du serveur."
Write-Host "Etape suivante : IIS en reverse proxy (voir README, section 'Windows Server 2022 Standard')."
