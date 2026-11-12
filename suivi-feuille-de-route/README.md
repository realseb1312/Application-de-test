# Pilotage — Feuille de route 2027-2030

Application web de **suivi des actions** construite à partir du fichier Excel
`seed/feuille_de_route_2027_2030.xlsx` (import automatique au premier lancement).

## Démarrage détaillé

### 1. Prérequis
- **Python 3.10 ou plus récent** (vérifier avec `python3 --version` ; sur Windows, installateur python.org en cochant « Add Python to PATH »)
- **pip** (installé avec Python)
- Un navigateur récent (Chrome, Edge, Firefox…)

### 2. Récupérer le code
Via la branche de la PR :
```bash
git clone https://github.com/realseb1312/Application-de-test.git
cd Application-de-test
git checkout vibe/suivi-feuille-de-route-b2db25
cd suivi-feuille-de-route
```
Ou en téléchargeant le ZIP de la branche `vibe/suivi-feuille-de-route-b2db25`, puis en décompressant.

### 3. Installer les dépendances (une seule fois)
```bash
pip install -r requirements.txt
# ou : python3 -m pip install -r requirements.txt
# en cas d'erreur de droits : pip install --user -r requirements.txt
# ou dans un environnement virtuel :
#   python3 -m venv .venv && source .venv/bin/activate   (Windows : .venv\Scripts\activate)
#   pip install -r requirements.txt
```

### 4. Lancer l'application
```bash
./run.sh                 # Linux / macOS
python3 app.py           # ou directement (Windows : run.bat ou "python app.py")
```
Le terminal affiche `Running on http://127.0.0.1:5000` : **laisser le terminal ouvert** tant que vous utilisez l'application.

### 5. Ouvrir l'interface
Dans votre navigateur : **http://127.0.0.1:5000**

### 6. Premier démarrage
- La base `data/app.db` est créée automatiquement dans le dossier du projet.
- Les **96 actions** du fichier Excel `seed/feuille_de_route_2027_2030.xlsx` sont importées automatiquement (la sidebar indique la source et la date d'import).
- Ensuite, à chaque lancement, vos saisies sont rechargées depuis `data/app.db`.

### 7. Utilisation au quotidien
1. Renseigner **votre nom** en haut à droite → enregistré comme auteur dans l'historique de chaque action.
2. Onglet **Actions** : filtrer (axe, statut, priorité, « en retard »), trier, rechercher ; changer le statut directement dans la liste, ou cliquer sur une ligne pour ouvrir la **fiche** :
   - onglet *Général* : statut, avancement % (curseur), priorité, responsable, échéances, budget prévu, commentaire → **Enregistrer** ;
   - onglet *Dépenses* : saisir chaque dépense (date, libellé, montant, catégorie) → le **consommé**, le **reste** et le **taux** se calculent automatiquement ;
   - onglets *Jalons*, *Commentaires*, *Historique*.
3. **Kanban** : glisser-déposer une carte pour changer le statut. **Planning** : vue Gantt 2026-2031. **Budget** : suivi par action/type.
4. **Rapports** : choisir les filtres → « Ouvrir le rapport imprimable » → nouvel onglet → **« Imprimer / Enregistrer en PDF »** (mise en page A4 prête).
5. Sidebar : **Exporter Excel/CSV**, **Réimporter un Excel** (remplace tout — penser à sauvegarder avant), **Sauvegarder la base** (fichier `.db`), **Restaurer une base**.

### Arrêt / relance
- Arrêt : `Ctrl+C` dans le terminal. Relance : `./run.sh` — données conservées.

### Dépannage
- `python3: command not found` → installer Python 3.10+ (python.org) et cocher « Add to PATH » (Windows) ; sur Linux : `sudo apt install python3 python3-pip`.
- `pip` introuvable → `python3 -m pip install -r requirements.txt`.
- Port 5000 déjà occupé → changer le port dans la dernière ligne de `app.py` (`port=5000` → `port=5001`) puis ouvrir http://127.0.0.1:5001.
- Données perdues/corrompues → sidebar : **Restaurer une base** avec un `.db` sauvegardé, ou **Réimporter un Excel** pour repartir du fichier source.
- Le navigateur n'ouvre rien → vérifier que le terminal affiche bien `Running on http://127.0.0.1:5000` et qu'aucun pare-feu ne bloque la boucle locale.

### Sécurité
Par défaut, l'application n'écoute que sur **127.0.0.1** (votre machine uniquement). Voir la section « Déploiement sur un serveur » ci-dessous pour un accès réseau contrôlé.

## Déploiement sur un serveur

L'application n'a **pas d'authentification intégrée** : ne l'exposez jamais directement sur Internet. Deux options :

### Option A — test rapide en réseau local (LAN)
Sur le serveur :
```bash
FDR_HOST=0.0.0.0 FDR_PORT=5000 python3 app.py
```
Depuis un poste du réseau : `http://<IP-du-serveur>:5000`.
⚠️ Sans protection : à réserver à un réseau de confiance, avec le pare-feu du serveur qui limite l'accès au sous-réseau interne (ex. `sudo ufw allow from 192.168.1.0/24 to any port 5000`).

### Option B — production recommandée : Gunicorn + service systemd + Nginx en reverse proxy (Linux)
```bash
# 1. Déployer le code sur le serveur (ex. /opt/suivi-feuille-de-route)
git clone https://github.com/realseb1312/Application-de-test.git
cd Application-de-test && git checkout vibe/suivi-feuille-de-route-b2db25
cd suivi-feuille-de-route
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-server.txt   # gunicorn en plus

# 2. Service systemd : /etc/systemd/system/suivi-fdr.service
[Unit]
Description=Suivi feuille de route 2027-2030
After=network.target

[Service]
WorkingDirectory=/opt/suivi-feuille-de-route
ExecStart=/opt/suivi-feuille-de-route/.venv/bin/gunicorn -w 4 -b 127.0.0.1:8000 app:app
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target

sudo systemctl daemon-reload && sudo systemctl enable --now suivi-fdr

# 3. Nginx en reverse proxy + authentification basique : /etc/nginx/sites-available/suivi-fdr
server {
    listen 80;
    server_name suivi-fdr.interne.local;
    location / {
        auth_basic "Suivi feuille de route";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
# sudo apt install apache2-utils nginx
# sudo htpasswd -c /etc/nginx/.htpasswd monutilisateur
# sudo ln -s /etc/nginx/sites-available/suivi-fdr /etc/nginx/sites-enabled/
# sudo nginx -t && sudo systemctl reload nginx
# pare-feu : sudo ufw allow 80/tcp && sudo ufw enable
```
Accès : `http://suivi-fdr.interne.local` (ou l'IP du serveur) — protégé par mot de passe.

**Windows Server** : remplacer Gunicorn par Waitress (`pip install waitress`, puis `waitress-serve --listen=127.0.0.1:8000 app:app`), derrière IIS ou Nginx, lancé via une tâche planifiée.

### Données et sauvegardes
- La base est `<dossier-du-projet>/data/app.db` : sauvegardez ce fichier régulièrement (bouton « Sauvegarder la base » dans l'app, ou cron : `cp data/app.db /backup/app-$(date +\%F).db`).
- SQLite convient à une petite équipe en lecture/écriture simultanée ; Gunicorn à 2-4 workers suffit largement.

### Mises à jour sur le serveur
```bash
cd /opt/suivi-feuille-de-route
git fetch origin && git checkout vibe/suivi-feuille-de-route-b2db25 && git pull
source .venv/bin/activate && pip install -r requirements.txt -r requirements-server.txt
sudo systemctl restart suivi-fdr
```

### Règles de sécurité
- Jamais d'exposition Internet directe ; accès interne uniquement (pare-feu) + reverse proxy avec authentification (basic auth, ou mieux SSO/VPN de votre organisation).
- HTTPS (Let's Encrypt via Nginx) uniquement si un accès externe est vraiment nécessaire.
- Ne définissez `FDR_HOST=0.0.0.0` que derrière ces protections.

## Fonctionnalités

- **Import Excel** : les 96 actions de la feuille de route sont importées au premier
  démarrage (axes/thématiques propagés, budget et échéance parsés en valeurs exploitables,
  texte original conservé). Réimport possible depuis l'interface (sidebar).
- **Tableau de bord** : KPIs (nb actions, avancement moyen, budget prévu/consommé/reste,
  actions en retard, échéances à 30 j), graphiques (statuts, avancement et budget par axe),
  alertes et actions prioritaires.
- **Actions** : tableau filtrable (axe, thématique, statut, priorité, retard), triable,
  recherche plein texte, changement de statut en ligne, fiche détaillée par action :
  - statut, **avancement %**, priorité, responsable, échéances (texte + dates), commentaire ;
  - **dépenses** (date, libellé, montant, catégorie) → budget consommé, reste et taux de
    consommation calculés automatiquement ;
  - **jalons** (dates prévues/réalisées, statut) ;
  - **commentaires** (fil d'activité, auteur daté) ;
  - **historique** de toutes les modifications (qui a changé quoi, quand).
- **Kanban** : glisser-déposer des cartes pour changer le statut.
- **Planning** : vue Gantt 2026-2031 des échéances, ligne « aujourd'hui », actions récurrentes.
- **Budget** : suivi par action et par type (Investissement / Fonctionnement / Mixte…),
  taux de consommation, alertes à 80 % et 100 %.
- **Alertes** : échéance dépassée, échéance à 30 jours, budget dépassé.
- **Rapports imprimables** : page dédiée `/rapport` (filtrable) avec mise en page A4,
  bouton « Imprimer / Enregistrer en PDF » du navigateur (synthèse, alertes, détail des
  actions, synthèse par axe, dépenses).
- **Exports** : Excel (.xlsx : onglets Actions / Dépenses / Synthèse) et CSV, avec filtres.
- **Sauvegarde** : téléchargement/restauration de la base SQLite, ou réimport d'un Excel.

## Structure

```
app.py               backend Flask (API REST + pages)
db.py                schéma SQLite
import_excel.py      parseur du fichier Excel source (budget, échéances)
templates/           index.html (SPA), rapport.html (impression)
static/css, static/js  interface (vanilla JS, aucun CDN)
seed/                fichier Excel source
data/                base SQLite (créée au lancement)
```

## API (exemples)

- `GET /api/actions?axe=...&statut=...&q=...&tri=echeance`
- `GET /api/actions/<id>` (avec dépenses, jalons, commentaires, historique)
- `PUT /api/actions/<id>` (JSON partiel, historisé ; auteur via `?auteur=` ou header `X-Auteur`)
- `POST /api/actions/<id>/depenses`, `DELETE /api/depenses/<id>`
- `POST /api/actions/<id>/jalons`, `PUT/DELETE /api/jalons/<id>`
- `POST /api/actions/<id>/commentaires`, `DELETE /api/commentaires/<id>`
- `GET /api/stats`, `GET /api/alertes`, `GET /api/filtres`
- `GET /api/export.xlsx`, `GET /api/export.csv`, `POST /api/import` (multipart .xlsx)
- `GET /api/backup`, `POST /api/restore` (multipart .db)
- `GET /rapport?axe=...&statut=...` (rapport imprimable)
