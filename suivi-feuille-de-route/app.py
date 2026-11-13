# -*- coding: utf-8 -*-
"""Application de suivi de la feuille de route 2027-2030.

Lancer avec :  python3 app.py   puis ouvrir http://127.0.0.1:5000
"""
import csv
import io
import os
import sqlite3
from datetime import date, datetime

from flask import (Flask, g, jsonify, make_response, redirect, render_template,
                   request, send_file, url_for)

import db
import import_excel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")

STATUTS = ["À faire", "En cours", "En attente", "Terminé", "Annulé"]
PRIORITES = ["Haute", "Moyenne", "Basse"]
CATEGORIES_DEPENSE = ["Investissement", "Fonctionnement", "Prestation", "Licence",
                      "Matériel", "Formation", "Autre"]

app = Flask(__name__)


@app.template_filter("fmt_date")
def fmt_date(s):
    if not s:
        return "—"
    try:
        return date.fromisoformat(str(s)[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return str(s)


@app.template_filter("fmt_eur")
def fmt_eur(v):
    if v is None:
        return "—"
    return f"{v:,.2f} €".replace(",", " ").replace(".", ",")


@app.template_filter("fmt_pct")
def fmt_pct(v):
    if v is None:
        return "—"
    return f"{v:g} %"


# ---------------------------------------------------------------- base de données

def get_conn():
    if "conn" not in g:
        g.conn = db.connect(DB_PATH)
        db.init_db(g.conn)
    return g.conn


@app.teardown_appcontext
def close_conn(_exc):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


def ensure_seeded():
    conn = db.connect(DB_PATH)
    db.init_db(conn)
    n = conn.execute("SELECT COUNT(*) AS n FROM actions").fetchone()["n"]
    if n == 0 and os.path.exists(import_excel.DEFAULT_XLSX):
        import_excel.import_xlsx(import_excel.DEFAULT_XLSX, conn)
    conn.close()


# ---------------------------------------------------------------- helpers

def auteur():
    return (request.args.get("auteur") or request.headers.get("X-Auteur") or "").strip() or "Anonyme"


def log_hist(conn, action_id, champ, ancienne, nouvelle):
    conn.execute(
        "INSERT INTO historique (action_id, auteur, champ, ancienne_valeur, nouvelle_valeur)"
        " VALUES (?,?,?,?,?)",
        (action_id, auteur(), champ, "" if ancienne is None else str(ancienne),
         "" if nouvelle is None else str(nouvelle)),
    )


def action_dict(row, conn=None):
    a = dict(row)
    if conn is not None:
        conso = conn.execute(
            "SELECT COALESCE(SUM(montant),0) AS s FROM depenses WHERE action_id=?",
            (a["id"],)).fetchone()["s"]
    else:
        conso = 0
    a["budget_conso"] = round(conso, 2)
    a["reste"] = round(a["budget_prev"] - conso, 2) if a["budget_prev"] is not None else None
    a["taux_conso"] = (round(conso / a["budget_prev"] * 100, 1)
                       if a["budget_prev"] else None)
    today = date.today().isoformat()
    a["en_retard"] = bool(a["echeance_end"] and a["echeance_end"] < today
                          and a["statut"] not in ("Terminé", "Annulé"))
    a["jours_restants"] = None
    if a["echeance_end"]:
        a["jours_restants"] = (date.fromisoformat(a["echeance_end"]) - date.today()).days
    a["depenses_count"] = 0 if conn is None else conn.execute(
        "SELECT COUNT(*) AS n FROM depenses WHERE action_id=?", (a["id"],)).fetchone()["n"]
    return a


def build_filters(args):
    """Construit la clause WHERE a partir des parametres de requete."""
    clauses, params = [], []
    if args.get("axe"):
        clauses.append("axe = ?")
        params.append(args["axe"])
    if args.get("thematique"):
        clauses.append("thematique = ?")
        params.append(args["thematique"])
    if args.get("statut"):
        clauses.append("statut = ?")
        params.append(args["statut"])
    if args.get("priorite"):
        clauses.append("priorite = ?")
        params.append(args["priorite"])
    if args.get("responsable"):
        clauses.append("responsable LIKE ?")
        params.append(f"%{args['responsable']}%")
    if args.get("q"):
        like = f"%{args['q']}%"
        clauses.append("(action LIKE ? OR objectif LIKE ? OR thematique LIKE ? OR axe LIKE ? OR responsable LIKE ?)")
        params += [like] * 5
    if args.get("recurrent") in ("1", "0"):
        clauses.append("recurrent = ?")
        params.append(int(args["recurrent"]))
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


ORDERS = {
    "echeance": "echeance_end IS NULL, echeance_end ASC",
    "axe": "axe, thematique, id",
    "avancement": "avancement ASC, id",
    "budget": "budget_prev IS NULL, budget_prev DESC",
    "id": "id ASC",
    "statut": "statut, id",
    "priorite": "CASE priorite WHEN 'Haute' THEN 0 WHEN 'Moyenne' THEN 1 ELSE 2 END, id",
}


def query_actions(args):
    conn = get_conn()
    where, params = build_filters(args)
    order = ORDERS.get(args.get("tri") or "", "id ASC")
    rows = conn.execute(f"SELECT * FROM actions{where} ORDER BY {order}", params).fetchall()
    return [action_dict(r, conn) for r in rows]


# ---------------------------------------------------------------- pages

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/rapport")
def rapport():
    conn = get_conn()
    actions = query_actions(request.args)
    today = date.today()
    stats = compute_stats(actions, today)
    alertes = compute_alertes(actions, today)
    depenses = conn.execute(
        "SELECT d.*, a.action AS action_titre FROM depenses d JOIN actions a ON a.id=d.action_id"
        " ORDER BY d.date DESC").fetchall()
    meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
    return render_template("rapport.html", actions=actions, stats=stats, alertes=alertes,
                           depenses=[dict(d) for d in depenses], meta=meta, today=today,
                           filtres=request.args, statuts=STATUTS)


# ---------------------------------------------------------------- API actions

@app.route("/api/actions")
def api_actions():
    return jsonify(query_actions(request.args))


@app.route("/api/actions/<int:aid>")
def api_action(aid):
    conn = get_conn()
    row = conn.execute("SELECT * FROM actions WHERE id=?", (aid,)).fetchone()
    if not row:
        return jsonify({"error": "Action introuvable"}), 404
    a = action_dict(row, conn)
    a["depenses"] = [dict(r) for r in conn.execute(
        "SELECT * FROM depenses WHERE action_id=? ORDER BY date DESC, id DESC", (aid,))]
    a["jalons"] = [dict(r) for r in conn.execute(
        "SELECT * FROM jalons WHERE action_id=? ORDER BY date_prevue, id", (aid,))]
    a["commentaires"] = [dict(r) for r in conn.execute(
        "SELECT * FROM commentaires WHERE action_id=? ORDER BY date DESC, id DESC", (aid,))]
    a["historique"] = [dict(r) for r in conn.execute(
        "SELECT * FROM historique WHERE action_id=? ORDER BY date DESC, id DESC", (aid,))]
    return jsonify(a)


ACTION_FIELDS = ["axe", "thematique", "objectif", "action", "budget_text", "budget_prev",
                 "budget_type", "echeance_text", "echeance_start", "echeance_end", "recurrent",
                 "statut", "avancement", "priorite", "responsable", "commentaire"]


@app.route("/api/actions", methods=["POST"])
def api_create():
    conn = get_conn()
    data = request.get_json(force=True)
    vals = {f: data.get(f, "") for f in ACTION_FIELDS}
    vals["statut"] = vals["statut"] or "À faire"
    vals["avancement"] = int(vals.get("avancement") or 0)
    vals["recurrent"] = int(bool(vals.get("recurrent")))
    if vals["budget_prev"] in ("", None):
        vals["budget_prev"] = None
    cols = ", ".join(vals.keys())
    ph = ", ".join("?" for _ in vals)
    cur = conn.execute(f"INSERT INTO actions ({cols}) VALUES ({ph})", tuple(vals.values()))
    conn.commit()
    log_hist(conn, cur.lastrowid, "création", None, vals.get("action"))
    conn.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/api/actions/<int:aid>", methods=["PUT"])
def api_update(aid):
    conn = get_conn()
    row = conn.execute("SELECT * FROM actions WHERE id=?", (aid,)).fetchone()
    if not row:
        return jsonify({"error": "Action introuvable"}), 404
    data = request.get_json(force=True)
    sets, params = [], []
    for f in ACTION_FIELDS:
        if f not in data:
            continue
        new = data[f]
        if f == "avancement":
            new = max(0, min(100, int(new or 0)))
        if f == "recurrent":
            new = int(bool(new))
        if f == "budget_prev" and new in ("", None):
            new = None
        old = row[f]
        if str(old if old is not None else "") != str(new if new is not None else ""):
            log_hist(conn, aid, f, old, new)
        sets.append(f"{f}=?")
        params.append(new)
    if sets:
        sets.append("date_maj=?")
        params.append(datetime.now().isoformat(timespec="seconds"))
        params.append(aid)
        conn.execute(f"UPDATE actions SET {', '.join(sets)} WHERE id=?", params)
        conn.commit()
    return api_action(aid)


@app.route("/api/actions/<int:aid>", methods=["DELETE"])
def api_delete(aid):
    conn = get_conn()
    conn.execute("DELETE FROM actions WHERE id=?", (aid,))
    conn.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- API sous-ressources

@app.route("/api/actions/<int:aid>/depenses", methods=["GET", "POST"])
def api_depenses(aid):
    conn = get_conn()
    if request.method == "POST":
        d = request.get_json(force=True)
        conn.execute(
            "INSERT INTO depenses (action_id, date, libelle, montant, categorie) VALUES (?,?,?,?,?)",
            (aid, d.get("date") or date.today().isoformat(), d.get("libelle", ""),
             float(d.get("montant") or 0), d.get("categorie") or "Autre"))
        log_hist(conn, aid, "dépense ajoutée", None,
                 f"{d.get('libelle','')} : {d.get('montant','')} €")
        conn.commit()
    rows = conn.execute("SELECT * FROM depenses WHERE action_id=? ORDER BY date DESC, id DESC",
                        (aid,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/depenses/<int:did>", methods=["PUT", "DELETE"])
def api_depense(did):
    conn = get_conn()
    row = conn.execute("SELECT * FROM depenses WHERE id=?", (did,)).fetchone()
    if not row:
        return jsonify({"error": "Dépense introuvable"}), 404
    if request.method == "DELETE":
        conn.execute("DELETE FROM depenses WHERE id=?", (did,))
        log_hist(conn, row["action_id"], "dépense supprimée", f"{row['libelle']} : {row['montant']} €", None)
    else:
        d = request.get_json(force=True)
        conn.execute("UPDATE depenses SET date=?, libelle=?, montant=?, categorie=? WHERE id=?",
                     (d.get("date"), d.get("libelle"), float(d.get("montant") or 0),
                      d.get("categorie"), did))
        log_hist(conn, row["action_id"], "dépense modifiée", f"{row['libelle']} : {row['montant']} €",
                 f"{d.get('libelle')} : {d.get('montant')} €")
    conn.commit()
    return jsonify({"ok": True})


@app.route("/api/actions/<int:aid>/jalons", methods=["GET", "POST"])
def api_jalons(aid):
    conn = get_conn()
    if request.method == "POST":
        d = request.get_json(force=True)
        conn.execute(
            "INSERT INTO jalons (action_id, titre, date_prevue, date_realisation, statut, commentaire)"
            " VALUES (?,?,?,?,?,?)",
            (aid, d.get("titre", ""), d.get("date_prevue"), d.get("date_realisation"),
             d.get("statut") or "À faire", d.get("commentaire", "")))
        conn.commit()
    rows = conn.execute("SELECT * FROM jalons WHERE action_id=? ORDER BY date_prevue, id",
                        (aid,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/jalons/<int:jid>", methods=["PUT", "DELETE"])
def api_jalon(jid):
    conn = get_conn()
    row = conn.execute("SELECT * FROM jalons WHERE id=?", (jid,)).fetchone()
    if not row:
        return jsonify({"error": "Jalon introuvable"}), 404
    if request.method == "DELETE":
        conn.execute("DELETE FROM jalons WHERE id=?", (jid,))
    else:
        d = request.get_json(force=True)
        conn.execute(
            "UPDATE jalons SET titre=?, date_prevue=?, date_realisation=?, statut=?, commentaire=? WHERE id=?",
            (d.get("titre"), d.get("date_prevue"), d.get("date_realisation"),
             d.get("statut"), d.get("commentaire"), jid))
    conn.commit()
    return jsonify({"ok": True})


@app.route("/api/actions/<int:aid>/commentaires", methods=["GET", "POST"])
def api_commentaires(aid):
    conn = get_conn()
    if request.method == "POST":
        d = request.get_json(force=True)
        conn.execute("INSERT INTO commentaires (action_id, auteur, texte) VALUES (?,?,?)",
                     (aid, auteur(), d.get("texte", "")))
        conn.commit()
    rows = conn.execute("SELECT * FROM commentaires WHERE action_id=? ORDER BY date DESC, id DESC",
                        (aid,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/commentaires/<int:cid>", methods=["DELETE"])
def api_commentaire(cid):
    conn = get_conn()
    conn.execute("DELETE FROM commentaires WHERE id=?", (cid,))
    conn.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- stats / alertes

def compute_stats(actions, today):
    total = len(actions)
    by_statut = {s: 0 for s in STATUTS}
    for a in actions:
        by_statut[a["statut"]] = by_statut.get(a["statut"], 0) + 1
    prevu = sum(a["budget_prev"] or 0 for a in actions)
    conso = sum(a["budget_conso"] for a in actions)
    avancement_moy = round(sum(a["avancement"] for a in actions) / total, 1) if total else 0
    by_axe = {}
    for a in actions:
        e = by_axe.setdefault(a["axe"] or "Sans axe", {
            "count": 0, "avancement": 0, "prevu": 0.0, "conso": 0.0,
            "terminees": 0, "en_retard": 0})
        e["count"] += 1
        e["avancement"] += a["avancement"]
        e["prevu"] += a["budget_prev"] or 0
        e["conso"] += a["budget_conso"]
        e["terminees"] += 1 if a["statut"] == "Terminé" else 0
        e["en_retard"] += 1 if a["en_retard"] else 0
    for e in by_axe.values():
        e["avancement"] = round(e["avancement"] / e["count"], 1) if e["count"] else 0
        e["prevu"] = round(e["prevu"], 2)
        e["conso"] = round(e["conso"], 2)
    by_type = {}
    for a in actions:
        t = a["budget_type"] or "Non précisé"
        e = by_type.setdefault(t, {"count": 0, "prevu": 0.0, "conso": 0.0})
        e["count"] += 1
        e["prevu"] += a["budget_prev"] or 0
        e["conso"] += a["budget_conso"]
    for e in by_type.values():
        e["prevu"] = round(e["prevu"], 2)
        e["conso"] = round(e["conso"], 2)
    return {
        "total": total,
        "by_statut": by_statut,
        "budget_prevu": round(prevu, 2),
        "budget_conso": round(conso, 2),
        "budget_reste": round(prevu - conso, 2),
        "avancement_moyen": avancement_moy,
        "by_axe": by_axe,
        "by_type": by_type,
        "en_retard": sum(1 for a in actions if a["en_retard"]),
        "echeance_30j": sum(1 for a in actions if a["jours_restants"] is not None
                            and 0 <= a["jours_restants"] <= 30 and a["statut"] not in ("Terminé", "Annulé")),
    }


def compute_alertes(actions, today, horizon=30):
    alertes = []
    for a in actions:
        if a["en_retard"]:
            alertes.append({"action": a, "type": "retard", "priorite": "haute",
                            "message": f"Échéance dépassée ({a['echeance_text'] or a['echeance_end']})"})
        elif a["jours_restants"] is not None and 0 <= a["jours_restants"] <= horizon \
                and a["statut"] not in ("Terminé", "Annulé"):
            alertes.append({"action": a, "type": "echeance", "priorite": "moyenne",
                            "message": f"Échéance dans {a['jours_restants']} j ({a['echeance_end']})"})
        if a["taux_conso"] is not None and a["taux_conso"] >= 100 and a["statut"] != "Terminé":
            alertes.append({"action": a, "type": "budget", "priorite": "haute",
                            "message": f"Budget consommé à {a['taux_conso']} %"})
        elif a["taux_conso"] is not None and a["taux_conso"] >= 80:
            alertes.append({"action": a, "type": "budget", "priorite": "moyenne",
                            "message": f"Budget consommé à {a['taux_conso']} %"})
    ordre = {"haute": 0, "moyenne": 1, "basse": 2}
    alertes.sort(key=lambda x: (ordre.get(x["priorite"], 3), x["action"]["echeance_end"] or "9999"))
    return alertes


@app.route("/api/stats")
def api_stats():
    actions = query_actions(request.args)
    return jsonify(compute_stats(actions, date.today()))


@app.route("/api/alertes")
def api_alertes():
    actions = query_actions(request.args)
    return jsonify([{"type": al["type"], "priorite": al["priorite"], "message": al["message"],
                     "action": al["action"]} for al in compute_alertes(actions, date.today())])


@app.route("/api/filtres")
def api_filtres():
    conn = get_conn()
    def distinct(col):
        return [r[0] for r in conn.execute(
            f"SELECT DISTINCT {col} FROM actions WHERE {col} != '' ORDER BY {col}")]
    return jsonify({
        "axes": distinct("axe"),
        "thematiques": distinct("thematique"),
        "responsables": distinct("responsable"),
        "statuts": STATUTS,
        "priorites": PRIORITES,
        "categories_depense": CATEGORIES_DEPENSE,
        "meta": {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")},
    })


# ---------------------------------------------------------------- exports / import

@app.route("/api/export.xlsx")
def api_export_xlsx():
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    actions = query_actions(request.args)
    conn = get_conn()
    wb = openpyxl.Workbook()

    ws = wb.active
    ws.title = "Actions"
    headers = ["ID", "Axe", "Thématique", "Objectif", "Action", "Échéance (texte)",
               "Début", "Fin", "Récurrent", "Statut", "Avancement %", "Priorité", "Responsable",
               "Budget (texte)", "Budget prévu €", "Type budget", "Dépenses €", "Reste €",
               "Taux conso %", "En retard", "Commentaire", "Dernière maj"]
    ws.append(headers)
    for a in actions:
        ws.append([a["id"], a["axe"], a["thematique"], a["objectif"], a["action"],
                   a["echeance_text"], a["echeance_start"], a["echeance_end"],
                   "Oui" if a["recurrent"] else "Non", a["statut"], a["avancement"],
                   a["priorite"], a["responsable"], a["budget_text"], a["budget_prev"],
                   a["budget_type"], a["budget_conso"], a["reste"], a["taux_conso"],
                   "Oui" if a["en_retard"] else "Non", a["commentaire"], a["date_maj"]])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3B63")
        c.alignment = Alignment(vertical="center", wrap_text=True)
    widths = [6, 34, 30, 40, 60, 22, 12, 12, 10, 12, 12, 10, 18, 30, 14, 18, 12, 12, 12, 9, 40, 18]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "F2"
    for row in ws.iter_rows(min_row=2, min_col=15, max_col=15):
        for c in row:
            c.number_format = "#,##0.00 €"
    for row in ws.iter_rows(min_row=2, min_col=17, max_col=18):
        for c in row:
            c.number_format = "#,##0.00 €"

    ws2 = wb.create_sheet("Dépenses")
    ws2.append(["Action ID", "Action", "Date", "Libellé", "Montant €", "Catégorie"])
    for d in conn.execute(
            "SELECT d.*, a.action FROM depenses d JOIN actions a ON a.id=d.action_id ORDER BY d.date DESC"):
        ws2.append([d["action_id"], d["action"], d["date"], d["libelle"], d["montant"], d["categorie"]])
    for c in ws2[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3B63")
    for i, w in enumerate([10, 60, 12, 40, 14, 16], 1):
        ws2.column_dimensions[get_column_letter(i)].width = w
    for row in ws2.iter_rows(min_row=2, min_col=5, max_col=5):
        for c in row:
            c.number_format = "#,##0.00 €"

    ws3 = wb.create_sheet("Synthèse")
    stats = compute_stats(actions, date.today())
    ws3.append(["Indicateur", "Valeur"])
    ws3.append(["Nombre d'actions", stats["total"]])
    for s, n in stats["by_statut"].items():
        ws3.append([f"Statut : {s}", n])
    ws3.append(["Avancement moyen (%)", stats["avancement_moyen"]])
    ws3.append(["Budget prévu total (€)", stats["budget_prevu"]])
    ws3.append(["Budget consommé total (€)", stats["budget_conso"]])
    ws3.append(["Reste (€)", stats["budget_reste"]])
    ws3.append(["Actions en retard", stats["en_retard"]])
    ws3.append(["Échéance à 30 jours", stats["echeance_30j"]])
    ws3.append([])
    ws3.append(["Axe", "Actions", "Avancement moyen %", "Budget prévu €", "Consommé €", "Terminées", "En retard"])
    for axe, e in stats["by_axe"].items():
        ws3.append([axe, e["count"], e["avancement"], e["prevu"], e["conso"], e["terminees"], e["en_retard"]])
    for c in ws3[1]:
        c.font = Font(bold=True)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="suivi_feuille_de_route.xlsx")


@app.route("/api/export.csv")
def api_export_csv():
    actions = query_actions(request.args)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["ID", "Axe", "Thématique", "Objectif", "Action", "Échéance", "Début", "Fin",
                "Statut", "Avancement %", "Priorité", "Responsable", "Budget texte",
                "Budget prévu €", "Dépenses €", "Reste €", "En retard", "Commentaire"])
    for a in actions:
        w.writerow([a["id"], a["axe"], a["thematique"], a["objectif"], a["action"],
                    a["echeance_text"], a["echeance_start"], a["echeance_end"], a["statut"],
                    a["avancement"], a["priorite"], a["responsable"], a["budget_text"],
                    a["budget_prev"], a["budget_conso"], a["reste"],
                    "Oui" if a["en_retard"] else "Non", a["commentaire"]])
    resp = make_response(buf.getvalue())
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = "attachment; filename=suivi_feuille_de_route.csv"
    return resp


@app.route("/api/import", methods=["POST"])
def api_import():
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier reçu"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith(".xlsx"):
        return jsonify({"error": "Format attendu : .xlsx"}), 400
    path = os.path.join(BASE_DIR, "data", "upload_" + os.path.basename(f.filename))
    f.save(path)
    conn = get_conn()
    n = import_excel.import_xlsx(path, conn)
    try:
        os.remove(path)
    except OSError:
        pass
    return jsonify({"ok": True, "nb_actions": n})


@app.route("/api/backup")
def api_backup():
    ensure_seeded()
    return send_file(DB_PATH, as_attachment=True, download_name="suivi_feuille_de_route.db")


@app.route("/api/restore", methods=["POST"])
def api_restore():
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier reçu"}), 400
    f = request.files["file"]
    data = f.read()
    tmp = os.path.join(BASE_DIR, "data", "restore_check.db")
    with open(tmp, "wb") as fh:
        fh.write(data)
    try:
        c = sqlite3.connect(tmp)
        c.execute("SELECT COUNT(*) FROM actions")
        c.close()
    except sqlite3.Error:
        os.remove(tmp)
        return jsonify({"error": "Fichier invalide (base SQLite attendue)"}), 400
    os.replace(tmp, DB_PATH)
    return jsonify({"ok": True})


@app.route("/api/meta")
def api_meta():
    conn = get_conn()
    return jsonify({r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")})


ensure_seeded()

if __name__ == "__main__":
    host = os.environ.get("FDR_HOST", "127.0.0.1")
    port = int(os.environ.get("FDR_PORT", "5000"))
    if host not in ("127.0.0.1", "localhost"):
        print("ATTENTION : écoute sur", host, "- l'application n'a pas d'authentification intégrée."
              " Restreindre l'accès par pare-feu et/ou reverse proxy avec authentification.")
    app.run(host=host, port=port, debug=False)
