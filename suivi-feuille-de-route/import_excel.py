# -*- coding: utf-8 -*-
"""Import de la feuille de route Excel vers la base SQLite.

Parse les colonnes libres "Budget estimatif" et "Echeance" en valeurs
utilisables (montant indicatif en euros, dates de debut/fin, periodicite).
Le texte original est toujours conserve tel quel.
"""
import calendar
import os
import re
import sqlite3
from datetime import date

import openpyxl

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_XLSX = os.path.join(BASE_DIR, "seed", "feuille_de_route_2027_2030.xlsx")

MOIS = {
    "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "aout": 8, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12, "décembre": 12,
}

ROADMAP_END_YEAR = 2031


def _norm(v):
    if v is None:
        return ""
    return str(v).strip()


def _last_day(y, m):
    return calendar.monthrange(y, m)[1]


def _num(s):
    s = s.replace("\u00a0", " ").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_budget(text):
    """Retourne (montant_indicatif_euros_ou_None, type_budget)."""
    t = _norm(text)
    if not t or t in ("--", "-"):
        return None, "Non chiffré"
    low = t.lower()

    if "gain" in low and not re.search(r"\d", t):
        return None, "Gain attendu"
    if not re.search(r"(k\s*€|€)", low):
        if any(k in low for k in ("ressource interne", "ressources internes")):
            return None, "Ressources internes"
        if any(k in low for k in ("non chiffré", "non chiffre", "à chiffrer", "a chiffrer",
                                   "à définir", "a définir", "réduction des coûts")):
            return None, "À chiffrer"
        if any(k in low for k in ("compris dans", "inclus", "pris en charge", "intégré")):
            return None, "Inclus / pris en charge"
        return None, "Non chiffré"

    # Une estimation entre parentheses est prioritaire sur un montant unitaire.
    m_paren = re.search(r"\(([^)]*estimation[^)]*)\)", low)
    source = m_paren.group(1) if m_paren else low

    total = 0.0
    trouve = False
    for m in re.finditer(r"(\d[\d\u00a0 ]*(?:[.,]\d+)?)\s*(k\s*€|€)", source):
        val = _num(m.group(1))
        if m.group(2).lower().startswith("k"):
            val *= 1000.0
        # periodicite : on regarde les caracteres qui suivent le montant
        suite = source[m.end():m.end() + 32]
        if "mois" in suite:
            val *= 12.0
        elif re.search(r"/\s*(\d+)\s*ans?", suite):
            val /= float(re.search(r"/\s*(\d+)\s*ans?", suite).group(1))
        total += val
        trouve = True

    if not trouve:
        return None, "Non chiffré"

    if "gain" in low:
        total = -abs(total)

    if total < 0:
        btype = "Gain"
    elif "inv" in low and "fct" in low:
        btype = "Mixte (Inv. + fct.)"
    elif "inv" in low:
        btype = "Investissement"
    elif "fct" in low:
        btype = "Fonctionnement"
    else:
        btype = "Non précisé"
    return round(total, 2), btype


def parse_echeance(text):
    """Retourne (debut 'YYYY-MM-DD'|None, fin 'YYYY-MM-DD'|None, recurrent 0/1)."""
    t = _norm(text)
    low = t.lower()
    if not t:
        return None, None, 0

    recurrent = 1 if ("🔄" in t or "continu" in low or re.search(r"\d\s*\+", t)) else 0
    years = [int(y) for y in re.findall(r"\b(19\d{2}|20\d{2})\b", t)]

    if "continu" in low and not years:
        return "2026-01-01", f"{ROADMAP_END_YEAR}-12-31", 1

    month = None
    for nom, num in MOIS.items():
        if nom in low:
            month = num
            break

    semestres = [int(x) for x in re.findall(r"([1-2])(?:er|e|ème|eme)?\s*semestre", low)]
    trimestres = [int(x) for x in re.findall(r"([1-4])(?:er|e|ème|eme)?\s*trimestre", low)]
    m_t4 = re.search(r"\bt\s*([1-4])\b", low)
    if m_t4:
        trimestres.append(int(m_t4.group(1)))

    if years:
        y0, y1 = min(years), max(years)
        if month:
            start = date(y0, month, 1)
            end = date(y1, month, _last_day(y1, month))
        elif semestres:
            s0 = semestres[0]
            s1 = semestres[-1] if len(semestres) > 1 else s0
            start_m = 1 if s0 == 1 else 7
            end_m = 6 if s1 == 1 else 12
            start = date(y0, start_m, 1)
            end = date(y1, end_m, _last_day(y1, end_m))
        elif trimestres:
            q0 = trimestres[0]
            q1 = trimestres[-1] if len(trimestres) > 1 else q0
            start = date(y0, 3 * q0 - 2, 1)
            end = date(y1, 3 * q1, _last_day(y1, 3 * q1))
        elif "fin" in low and len(years) == 1:
            start = date(y0, 10, 1)
            end = date(y0, 12, 31)
        else:
            start = date(y0, 1, 1)
            end = date(y1, 12, 31)
        if recurrent and len(years) == 1 and not month and not semestres and not trimestres:
            end = date(max(y1, ROADMAP_END_YEAR), 12, 31)
        return start.isoformat(), end.isoformat(), recurrent

    if "fin" in low:
        return None, None, recurrent
    return None, None, recurrent


def import_xlsx(path, conn):
    """(Re)charge toutes les actions depuis le fichier Excel. Retourne le nb d'actions."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    for table in ("commentaires", "jalons", "depenses", "historique", "actions"):
        conn.execute(f"DELETE FROM {table}")

    cur_axe = ""
    cur_theme = ""
    n = 0
    for r in rows[1:]:
        r = list(r) + [None] * 7
        axe, theme, obj, action, budget, ech = r[0], r[1], r[2], r[3], r[4], r[5]
        if _norm(axe):
            cur_axe = _norm(axe)
        if _norm(theme):
            cur_theme = _norm(theme)
        if not _norm(action) and not _norm(obj):
            continue
        montant, btype = parse_budget(budget)
        debut, fin, recurrent = parse_echeance(ech)
        conn.execute(
            """INSERT INTO actions
               (axe, thematique, objectif, action, budget_text, budget_prev, budget_type,
                echeance_text, echeance_start, echeance_end, recurrent, statut, avancement,
                priorite, responsable, commentaire)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (cur_axe, cur_theme, _norm(obj), _norm(action), _norm(budget),
             montant, btype, _norm(ech), debut, fin, recurrent,
             "À faire", 0, "Moyenne", "", ""),
        )
        n += 1

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('source_file', ?)",
        (os.path.basename(path),),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('imported_at', ?)",
        (date.today().isoformat(),),
    )
    conn.commit()
    return n


if __name__ == "__main__":
    import db
    conn = db.connect(os.path.join(BASE_DIR, "data", "app.db"))
    db.init_db(conn)
    print("Actions importees:", import_xlsx(DEFAULT_XLSX, conn))
