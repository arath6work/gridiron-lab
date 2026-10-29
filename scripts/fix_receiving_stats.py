#!/usr/bin/env python3
"""Rebuild team receiving yards from nflverse play-by-play, preserving other stats.
Run AFTER scripts/update_nfl_data.py. Requires network access (GitHub Actions has it).
"""
import csv, gzip, io, json, os, tempfile, urllib.request

BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
JSON_PATH = os.path.join('data', 'nfl.json')

def num(row, key):
    try:
        value = row.get(key, '')
        return float(value) if value not in ('', None, 'NA', 'nan', 'NaN') else 0.0
    except (ValueError, TypeError):
        return 0.0

def read_pbp(season):
    url = f'{BASE}/pbp/play_by_play_{season}.csv.gz'
    req = urllib.request.Request(url, headers={'User-Agent': 'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=180) as response:
        raw = response.read()
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
        text = io.TextIOWrapper(stream, encoding='utf-8-sig', errors='replace', newline='')
        return csv.DictReader(text)

def main():
    with open(JSON_PATH, encoding='utf-8') as f:
        data = json.load(f)
    total_changed = 0
    for season, payload in data.get('seasons', {}).items():
        team_rows = payload.get('teams', [])
        if not team_rows:
            continue
        by_abbr = {team.get('abbr'): team for team in team_rows if team.get('abbr')}
        yards_for = {abbr: 0.0 for abbr in by_abbr}
        yards_against = {abbr: 0.0 for abbr in by_abbr}
        try:
            rows = read_pbp(season)
            for row in rows:
                if str(row.get('season', '')) != str(season):
                    continue
                offense, defense = row.get('posteam', ''), row.get('defteam', '')
                if offense not in by_abbr or defense not in by_abbr:
                    continue
                # receiving_yards is assigned to the receiver; lateral_receiving_yards
                # records yards gained by a later receiver and must be included too.
                yards = num(row, 'receiving_yards') + num(row, 'lateral_receiving_yards')
                if yards:
                    yards_for[offense] += yards
                    yards_against[defense] += yards
        except Exception as exc:
            raise RuntimeError(f'No se pudieron descargar/procesar datos PBP de {season}: {exc}') from exc

        season_changes = 0
        for abbr, team in by_abbr.items():
            gp = float(team.get('gp') or 0)
            rec_yards = round(yards_for[abbr], 1)
            allowed_yards = round(yards_against[abbr], 1)
            if team.get('receiving') != rec_yards or team.get('receivingAllowed') != allowed_yards:
                season_changes += 1
            team['receiving'] = rec_yards
            team['receivingAllowed'] = allowed_yards
            team['receivingPerGame'] = round(rec_yards / gp, 1) if gp else 0
            team['receivingAllowedPerGame'] = round(allowed_yards / gp, 1) if gp else 0
            receptions = float(team.get('receptions') or 0)
            receptions_allowed = float(team.get('receptionsAllowed') or 0)
            team['receivingAvg'] = round(rec_yards / receptions, 1) if receptions else 0
            team['receivingAvgAllowed'] = round(allowed_yards / receptions_allowed, 1) if receptions_allowed else 0
        total_changed += season_changes
        print(f'{season}: yardas de recepción reconstruidas; equipos con cambios={season_changes}')

    fd, tmp = tempfile.mkstemp(prefix='nfl.json.', suffix='.tmp', dir='data')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, JSON_PATH)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    print(f'Listo. Temporadas procesadas: {len(data.get("seasons", {}))}; equipos-temporada con cambios: {total_changed}.')

if __name__ == '__main__':
    main()
