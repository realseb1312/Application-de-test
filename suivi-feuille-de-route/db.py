# -*- coding: utf-8 -*-
"""Connexion et schema SQLite de l'application de suivi."""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    axe TEXT NOT NULL DEFAULT '',
    thematique TEXT NOT NULL DEFAULT '',
    objectif TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    budget_text TEXT NOT NULL DEFAULT '',
    budget_prev REAL,
    budget_type TEXT NOT NULL DEFAULT '',
    echeance_text TEXT NOT NULL DEFAULT '',
    echeance_start TEXT,
    echeance_end TEXT,
    recurrent INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'À faire',
    avancement INTEGER NOT NULL DEFAULT 0,
    priorite TEXT NOT NULL DEFAULT 'Moyenne',
    responsable TEXT NOT NULL DEFAULT '',
    commentaire TEXT NOT NULL DEFAULT '',
    date_maj TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS depenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    libelle TEXT NOT NULL DEFAULT '',
    montant REAL NOT NULL DEFAULT 0,
    categorie TEXT NOT NULL DEFAULT 'Autre',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jalons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    date_prevue TEXT,
    date_realisation TEXT,
    statut TEXT NOT NULL DEFAULT 'À faire',
    commentaire TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    auteur TEXT NOT NULL DEFAULT '',
    texte TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    date TEXT NOT NULL DEFAULT (datetime('now')),
    auteur TEXT NOT NULL DEFAULT '',
    champ TEXT NOT NULL,
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE INDEX IF NOT EXISTS idx_depenses_action ON depenses(action_id);
CREATE INDEX IF NOT EXISTS idx_jalons_action ON jalons(action_id);
CREATE INDEX IF NOT EXISTS idx_commentaires_action ON commentaires(action_id);
CREATE INDEX IF NOT EXISTS idx_historique_action ON historique(action_id);
"""


def connect(path=DB_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn):
    conn.executescript(SCHEMA)
    conn.commit()
