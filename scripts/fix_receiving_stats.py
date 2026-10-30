#!/usr/bin/env python3
"""Align team receiving yard totals with official team passing yard totals."""
import json
import os
import tempfile

PATH = "data/nfl.json"

def n(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0

def rounded(value):
    value = round(value, 1)
    return int(value) if value.is_integer() else value

def main():
    if not os.path.exists(PATH):
        raise FileNotFoundError(f"No existe {PATH}")

    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    for season, payload in data.get("seasons", {}).items():
        season_changed = 0
        for team in payload.get("teams", []):
            gp = n(team.get("gp"))
            # En estadísticas agregadas por equipo, las yardas recibidas
            # corresponden al total de yardas de pase del equipo.
            new_receiving = rounded(n(team.get("pass")))
            new_allowed = rounded(n(team.get("passAllowed")))

            if n(team.get("receiving")) != n(new_receiving):
                season_changed += 1
            if n(team.get("receivingAllowed")) != n(new_allowed):
                season_changed += 1

            team["receiving"] = new_receiving
            team["receivingAllowed"] = new_allowed
            team["receivingPerGame"] = rounded(new_receiving / gp) if gp else 0
            team["receivingAllowedPerGame"] = rounded(new_allowed / gp) if gp else 0

            rec = n(team.get("receptions"))
            rec_allowed = n(team.get("receptionsAllowed"))
            team["receivingAvg"] = rounded(new_receiving / rec) if rec else 0
            team["receivingAvgAllowed"] = rounded(new_allowed / rec_allowed) if rec_allowed else 0

        changed += season_changed
        print(f"{season}: {season_changed} campos de receiving actualizados")

    fd, tmp = tempfile.mkstemp(prefix="nfl.json.", suffix=".tmp", dir="data")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, PATH)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    print(f"Listo. Campos actualizados: {changed}")

if __name__ == "__main__":
    main()
