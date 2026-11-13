#!/bin/sh
# Lance l'application de suivi de la feuille de route (boucle locale uniquement).
cd "$(dirname "$0")"
exec python3 app.py
