# Pilotage — Feuille de route 2027-2030

Application web de **suivi des actions** construite à partir du fichier Excel
`seed/feuille_de_route_2027_2030.xlsx` (import automatique au premier lancement).

## Lancement

```bash
pip install -r requirements.txt
./run.sh            # ou : python3 app.py
```

Ouvrir ensuite **http://127.0.0.1:5000** dans un navigateur.
L'application n'écoute que sur la boucle locale (127.0.0.1) ; les données sont
stockées dans `data/app.db` (SQLite).

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
