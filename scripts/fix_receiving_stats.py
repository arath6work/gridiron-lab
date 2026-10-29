#!/usr/bin/env python3
"""Rebuild receiving yard totals from nflverse play-by-play, preserving other stats."""
import csv
import gzip
import io
import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
JSON_PATH = "data/nfl.json"

def read_csv(url):
    request = urllib.request.Request(url, headers={"User-Agent": "GridironLab/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read()
    if url.endswith(".gz"):
        raw = gzip.decompress(raw)
    # IMPORTANT: materialize rows while the in-memory stream is still available.
    with io.StringIO(raw.decode("utf-8-sig", errors="replace")) as stream:
        return list(csv.DictReader(stream))

def num(row, key):
    value = row.get(key, "")
    try:
        if value in ("", None, "NA", "nan", "NaN"):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0

def fetch_pbp(season):
    errors = []
    for url in (
        f"{BASE}/pbp/play_by_play_{season}.csv.gz",
        f"{BASE}/pbp/play_by_play_{season}.csv",
    ):
        try:
            return read_csv(url)
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    raise RuntimeError(f"No se pudo descargar el play-by-play de {season}: " + " | ".join(errors))

def main():
    if not os.path.exists(JSON_PATH):
        raise FileNotFoundError(f"No existe {JSON_PATH}; ejecuta primero update_nfl_data.py")

    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    seasons = data.get("seasons", {})
    total_changed = 0
    for season, payload in seasons.items():
        teams = payload.get("teams", [])
        by_abbr = {t.get("abbr"): t for t in teams if t.get("abbr")}
        # Only team abbreviations present in this season's JSON are considered.
        receiving = {abbr: 0.0 for abbr in by_abbr}
        allowed = {abbr: 0.0 for abbr in by_abbr}

        rows = fetch_pbp(season)
        valid_plays = 0
        for row in rows:
            if str(row.get("season", "")) != str(season):
                continue
            offense = row.get("posteam", "")
            defense = row.get("defteam", "")
            if offense not in by_abbr or defense not in by_abbr:
                continue
            # nflverse stores regular receiving yards and lateral receiving yards
            # separately; include both in the team receiving total.
            yards = num(row, "receiving_yards") + num(row, "lateral_receiving_yards")
            if yards:
                receiving[offense] += yards
                allowed[defense] += yards
            valid_plays += 1

        season_changed = 0
        for abbr, team in by_abbr.items():
            gp = num(team, "gp")
            new_rec = round(receiving[abbr], 1)
            new_allowed = round(allowed[abbr], 1)
            if team.get("receiving") != new_rec:
                season_changed += 1
            if team.get("receivingAllowed") != new_allowed:
                season_changed += 1
            team["receiving"] = new_rec
            team["receivingAllowed"] = new_allowed
            receptions = num(team, "receptions")
            receptions_allowed = num(team, "receptionsAllowed")
            team["receivingPerGame"] = round(new_rec / gp, 1) if gp else 0
            team["receivingAllowedPerGame"] = round(new_allowed / gp, 1) if gp else 0
            team["receivingAvg"] = round(new_rec / receptions, 1) if receptions else 0
            team["receivingAvgAllowed"] = round(new_allowed / receptions_allowed, 1) if receptions_allowed else 0

        total_changed += season_changed
        print(f"{season}: {len(by_abbr)} equipos, {valid_plays} jugadas válidas, {season_changed} campos de recepción corregidos")

    fd, tmp = tempfile.mkstemp(prefix="nfl.json.", suffix=".tmp", dir="data")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, JSON_PATH)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    print(f"Corrección terminada. Campos modificados: {total_changed}")

if __name__ == "__main__":
    main()
