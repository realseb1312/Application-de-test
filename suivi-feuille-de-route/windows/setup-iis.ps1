#Requires -RunAsAdministrator
<#
  Installe le rôle IIS sur Windows Server 2022.
  A executer en PowerShell administrateur :
    powershell -ExecutionPolicy Bypass -File .\windows\setup-iis.ps1
  Ensuite (manuel, 2 minutes) : installer ARR 3.0 + URL Rewrite 2.1 depuis
  https://www.iis.net/downloads/microsoft/application-request-routing et
  https://www.iis.net/downloads/microsoft/url-rewrite (MSI), puis activer le proxy :
  IIS Manager > <serveur> > Application Request Routing Cache > Server Proxy Settings > Enable proxy.
#>
Install-WindowsFeature -Name Web-Server, Web-Mgmt-Console, Web-Windows-Auth -IncludeManagementTools
Write-Host "Rôle IIS installé (redémarrage parfois demandé)."
Write-Host "Etapes suivantes :"
Write-Host " 1. Installer ARR 3.0 et URL Rewrite 2.1 (MSI depuis iis.net)"
Write-Host " 2. IIS Manager > serveur > ARR > Server Proxy Settings > cocher 'Enable proxy'"
Write-Host " 3. Créer un site 'SuiviFDR' (port 80, binding = nom/IP du serveur, racine C:\inetpub\wwwroot)"
Write-Host " 4. Copier windows\web.config dans C:\inetpub\wwwroot\web.config"
Write-Host " 5. Dans le site > Authentification : activer 'Windows Authentication', désactiver 'Anonymous'"
Write-Host " 6. Tester : http://127.0.0.1/ depuis le serveur, puis http://<nom-du-serveur>/ depuis un poste du domaine"
