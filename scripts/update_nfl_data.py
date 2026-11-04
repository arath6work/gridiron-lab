import csv
import datetime
import gzip
import io
import json
import os
import urllib.request

BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
CURRENT = datetime.datetime.now(datetime.timezone.utc).year
FIRST_SEASON = 1999
SEASONS = list(range(FIRST_SEASON, CURRENT + 1))

TEAM_INFO = {
 'ARI':('Arizona Cardinals','NFC','NFC West'),'ATL':('Atlanta Falcons','NFC','NFC South'),'BAL':('Baltimore Ravens','AFC','AFC North'),'BUF':('Buffalo Bills','AFC','AFC East'),
 'CAR':('Carolina Panthers','NFC','NFC South'),'CHI':('Chicago Bears','NFC','NFC North'),'CIN':('Cincinnati Bengals','AFC','AFC North'),'CLE':('Cleveland Browns','AFC','AFC North'),
 'DAL':('Dallas Cowboys','NFC','NFC East'),'DEN':('Denver Broncos','AFC','AFC West'),'DET':('Detroit Lions','NFC','NFC North'),'GB':('Green Bay Packers','NFC','NFC North'),
 'HOU':('Houston Texans','AFC','AFC South'),'IND':('Indianapolis Colts','AFC','AFC South'),'JAX':('Jacksonville Jaguars','AFC','AFC South'),'KC':('Kansas City Chiefs','AFC','AFC West'),
 'LA':('Los Angeles Rams','NFC','NFC West'),'LAR':('Los Angeles Rams','NFC','NFC West'),'STL':('St. Louis Rams','NFC','NFC West'),'LAC':('Los Angeles Chargers','AFC','AFC West'),'SD':('San Diego Chargers','AFC','AFC West'),'LV':('Las Vegas Raiders','AFC','AFC West'),'OAK':('Oakland Raiders','AFC','AFC West'),'MIA':('Miami Dolphins','AFC','AFC East'),
 'MIN':('Minnesota Vikings','NFC','NFC North'),'NE':('New England Patriots','AFC','AFC East'),'NO':('New Orleans Saints','NFC','NFC South'),'NYG':('New York Giants','NFC','NFC East'),
 'NYJ':('New York Jets','AFC','AFC East'),'PHI':('Philadelphia Eagles','NFC','NFC East'),'PIT':('Pittsburgh Steelers','AFC','AFC North'),'SF':('San Francisco 49ers','NFC','NFC West'),
 'SEA':('Seattle Seahawks','NFC','NFC West'),'TB':('Tampa Bay Buccaneers','NFC','NFC South'),'TEN':('Tennessee Titans','AFC','AFC South'),'WAS':('Washington Commanders','NFC','NFC East'),'WSH':('Washington Commanders','NFC','NFC East')
}

def read_csv(url, compressed=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        raw = response.read()
    if compressed or url.endswith('.gz'):
        raw = gzip.decompress(raw)
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace'))))


def num(row, key):
    try:
        value = row.get(key, '')
        return float(value) if value not in ('', None, 'NA', 'nan', 'NaN') else 0.0
    except (ValueError, TypeError):
        return 0.0


def has_score(value):
    return value not in ('', None, 'NA', 'nan', 'NaN')


def new_team_stats(abbr):
    if abbr not in TEAM_INFO:
        raise ValueError(f'Código de equipo sin metadata en TEAM_INFO: {abbr}')
    name, conf, division = TEAM_INFO[abbr]
    return {
        'abbr': abbr, 'name': name, 'conf': conf, 'div': division,
        'gp': 0, 'w': 0, 'l': 0, 't': 0,
        'points': 0, 'pointsAllowed': 0,
        # pass/passAllowed son yardas aéreas brutas. Los campos *Net descuentan sacks.
        'pass': 0, 'rush': 0, 'passAllowed': 0, 'rushAllowed': 0,
        'sackYardsAllowed': 0, 'sacksMadeYards': 0,
        'sacksAllowed': 0, 'sacksMade': 0,
        'epa': 0, 'plays': 0, 'successPlays': 0, 'epaPlays': 0, 'turnovers': 0,
    }


def main():
    schedules = read_csv(f'{BASE}/schedules/games.csv')
    output = {
        'source': 'nflverse',
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'firstSeason': FIRST_SEASON,
        'seasons': {},
    }

    for season in SEASONS:
        all_games = [g for g in schedules if str(g.get('season', '')) == str(season)]

        # La lista de equipos se deriva de los participantes reales de esa temporada.
        season_codes = sorted({
            code
            for game in all_games
            for code in (game.get('away_team', ''), game.get('home_team', ''))
            if code
        })
        stats = {abbr: new_team_stats(abbr) for abbr in season_codes}

        cooked_games = []
        for game in all_games:
            away = game.get('away_team', '')
            home = game.get('home_team', '')
            if away not in stats or home not in stats:
                continue

            week = int(num(game, 'week'))
            away_score = game.get('away_score', '')
            home_score = game.get('home_score', '')
            completed = has_score(away_score) and has_score(home_score)
            away_points, home_points = (
                (int(num(game, 'away_score')), int(num(game, 'home_score')))
                if completed else (None, None)
            )
            game_type = game.get('game_type', 'REG') or 'REG'
            status = 'FINAL' if completed else 'PROGRAMADO'

            cooked_games.append({
                'season': season, 'week': week, 'gameType': game_type,
                'away': away, 'awayName': stats[away]['name'], 'awayPts': away_points,
                'home': home, 'homeName': stats[home]['name'], 'homePts': home_points,
                'status': status, 'gameday': game.get('gameday', ''),
                'gametime': game.get('gametime', ''), 'gameId': game.get('game_id', ''),
            })

            # Récord y puntos de temporada regular únicamente.
            if completed and game_type == 'REG':
                stats[away]['gp'] += 1
                stats[home]['gp'] += 1
                stats[away]['points'] += away_points
                stats[away]['pointsAllowed'] += home_points
                stats[home]['points'] += home_points
                stats[home]['pointsAllowed'] += away_points

                if away_points > home_points:
                    stats[away]['w'] += 1
                    stats[home]['l'] += 1
                elif home_points > away_points:
                    stats[home]['w'] += 1
                    stats[away]['l'] += 1
                else:
                    stats[away]['t'] += 1
                    stats[home]['t'] += 1

        pbp = []
        pbp_loaded = False
        pbp_urls = [
            f'{BASE}/pbp/play_by_play_{season}.csv.gz',
            f'{BASE}/pbp/play_by_play_{season}.csv',
        ]
        for url in pbp_urls:
            try:
                pbp = read_csv(url, compressed=url.endswith('.gz'))
                pbp_loaded = True
                break
            except Exception as error:
                print(f'No se pudo leer {url}: {error}')
                pbp = []

        for play in pbp:
            if str(play.get('season', '')) != str(season):
                continue
            # Mantener las estadísticas comparables con la tabla NFL de temporada regular.
            if (play.get('game_type') or 'REG') != 'REG':
                continue

            offense = play.get('posteam', '')
            defense = play.get('defteam', '')
            if offense not in stats or defense not in stats:
                continue

            play_type = play.get('play_type')
            if play_type not in ('pass', 'run') and num(play, 'pass_attempt') == 0 and num(play, 'rush_attempt') == 0:
                continue

            passing_yards = num(play, 'passing_yards')
            rushing_yards = num(play, 'rushing_yards')
            stats[offense]['pass'] += passing_yards
            stats[offense]['rush'] += rushing_yards
            stats[defense]['passAllowed'] += passing_yards
            stats[defense]['rushAllowed'] += rushing_yards

            # nflverse registra la pérdida de yardas del sack en yards_gained (negativa).
            sack = num(play, 'sack') == 1
            sack_loss = max(0.0, -num(play, 'yards_gained')) if sack else 0.0
            if sack:
                stats[offense]['sacksAllowed'] += 1
                stats[offense]['sackYardsAllowed'] += sack_loss
                stats[defense]['sacksMade'] += 1
                stats[defense]['sacksMadeYards'] += sack_loss

            epa = play.get('epa', '')
            if epa not in ('', None, 'NA', 'nan', 'NaN'):
                stats[offense]['epa'] += num(play, 'epa')
                stats[offense]['epaPlays'] += 1

            stats[offense]['plays'] += 1
            if num(play, 'success') == 1:
                stats[offense]['successPlays'] += 1
            if num(play, 'interception') == 1 or num(play, 'fumble_lost') == 1:
                stats[offense]['turnovers'] += 1

        teams = []
        for team in stats.values():
            gp = team['gp']
            team['passNet'] = team['pass'] - team['sackYardsAllowed']
            team['passAllowedNet'] = team['passAllowed'] - team['sacksMadeYards']
            team['totalYards'] = team['passNet'] + team['rush']
            team['yardsAllowed'] = team['passAllowedNet'] + team['rushAllowed']
            team['pct'] = (team['w'] + 0.5 * team['t']) / gp if gp else 0
            team['pointsPerGame'] = team['points'] / gp if gp else 0
            team['pointsAllowedPerGame'] = team['pointsAllowed'] / gp if gp else 0
            team['passPerGame'] = team['passNet'] / gp if gp else None
            team['passAllowedPerGame'] = team['passAllowedNet'] / gp if gp else None
            team['rushPerGame'] = team['rush'] / gp if gp else None
            team['rushAllowedPerGame'] = team['rushAllowed'] / gp if gp else None
            team['yardsPerGame'] = team['totalYards'] / gp if gp else 0
            team['yardsAllowedPerGame'] = team['yardsAllowed'] / gp if gp else 0
            team['epaPerPlay'] = team['epa'] / team['epaPlays'] if team['epaPlays'] else None
            team['successRate'] = team['successPlays'] / team['plays'] if team['plays'] else None
            team['advancedAvailable'] = pbp_loaded
            team['diff'] = team['points'] - team['pointsAllowed']

            for key, value in list(team.items()):
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    team[key] = round(value, 3)

            teams.append(team)

        output['seasons'][str(season)] = {
            'teams': teams,
            'games': sorted(cooked_games, key=lambda game: (
                game['week'], game['gameday'], game.get('gametime', ''), game['away']
            )),
            'advancedAvailable': pbp_loaded,
        }
        print(
            f'{season}: {len(cooked_games)} partidos; {len(teams)} equipos reales; '
            f'play-by-play: {"sí" if pbp_loaded else "no disponible"}'
        )

    os.makedirs('data', exist_ok=True)
    temporary_path = 'data/nfl.json.tmp'
    with open(temporary_path, 'w', encoding='utf-8') as output_file:
        json.dump(output, output_file, ensure_ascii=False, separators=(',', ':'))
    os.replace(temporary_path, 'data/nfl.json')
    print(f'Escrito data/nfl.json con {len(output["seasons"])} temporadas')


if __name__ == '__main__':
    main()
