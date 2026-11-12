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
L'application n'écoute que sur **127.0.0.1** (votre machine uniquement) : ne la lancez pas avec `host="0.0.0.0"` et ne l'exposez pas sur le réseau.

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
