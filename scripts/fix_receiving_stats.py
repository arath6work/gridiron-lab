#!/usr/bin/env python3
"""Recalcula yardas recibidas de cada equipo desde nflverse PBP.
Conserva el resto de campos de data/nfl.json.
Ejecutar desde la raíz del repositorio: python scripts/fix_receiving_stats.py
"""
import csv, gzip, io, json, os, tempfile, urllib.request

BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
PATH = 'data/nfl.json'

def load_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=180) as response:
        raw = response.read()
    if url.endswith('.gz'):
        raw = gzip.decompress(raw)
    return csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace')))

def num(row, key):
    try:
        value = row.get(key, '')
        return float(value) if value not in ('', None, 'NA', 'nan', 'NaN') else 0.0
    except (ValueError, TypeError):
        return 0.0

def main():
    with open(PATH, encoding='utf-8') as f:
        data = json.load(f)
    changed = 0
    for season, payload in data.get('seasons', {}).items():
        team_rows = payload.get('teams', [])
        by_abbr = {t.get('abbr'): t for t in team_rows if t.get('abbr')}
        if not by_abbr:
            continue
        pbp = None
        for url in (f'{BASE}/pbp/play_by_play_{season}.csv.gz', f'{BASE}/pbp/play_by_play_{season}.csv'):
            try:
                pbp = load_csv(url)
                break
            except Exception as exc:
                last_error = exc
        if pbp is None:
            raise RuntimeError(f'No se pudo descargar el play-by-play de {season}: {last_error}')
        receiving = {abbr: 0.0 for abbr in by_abbr}
        receiving_allowed = {abbr: 0.0 for abbr in by_abbr}
        for p in pbp:
            if str(p.get('season', '')) != str(season):
                continue
            offense, defense = p.get('posteam', ''), p.get('defteam', '')
            if offense not in receiving or defense not in receiving_allowed:
                continue
            # receiving_yards excludes yards gained by a player receiving a lateral;
            # lateral_receiving_yards records those yards separately.
            yards = num(p, 'receiving_yards') + num(p, 'lateral_receiving_yards')
            receiving[offense] += yards
            receiving_allowed[defense] += yards
        for abbr, team in by_abbr.items():
            gp = float(team.get('gp') or 0)
            rec = receiving[abbr]
            rec_allowed = receiving_allowed[abbr]
            receptions = float(team.get('receptions') or 0)
            receptions_allowed = float(team.get('receptionsAllowed') or 0)
            for key, value in (
                ('receiving', rec),
                ('receivingAllowed', rec_allowed),
                ('receivingPerGame', round(rec / gp, 1) if gp else 0),
                ('receivingAllowedPerGame', round(rec_allowed / gp, 1) if gp else 0),
                ('receivingAvg', round(rec / receptions, 1) if receptions else 0),
                ('receivingAvgAllowed', round(rec_allowed / receptions_allowed, 1) if receptions_allowed else 0),
            ):
                if team.get(key) != value:
                    changed += 1
                team[key] = round(value, 1) if isinstance(value, float) else value
        print(f'{season}: yardas recibidas recalculadas para {len(by_abbr)} equipos')
    fd, tmp = tempfile.mkstemp(prefix='nfl.json.', suffix='.tmp', dir='data')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, PATH)
    print(f'Actualización terminada. Campos actualizados: {changed}')

if __name__ == '__main__':
    main()
