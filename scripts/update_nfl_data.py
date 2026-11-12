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
 'LA':('Los Angeles Rams','NFC','NFC West'),'LAR':('Los Angeles Rams','NFC','NFC West'),'STL':('St. Louis Rams','NFC','NFC West'),'LAC':('Los Angeles Chargers','AFC','AFC West'),'SD':('San Diego Chargers','AFC','AFC West'),'LV':('Las Vegas Raiders','AFC','AFC West'),'OAK':('Oakland Raiders','AFC','AFC West'),'OK':('Oakland Raiders','AFC','AFC West'),'MIA':('Miami Dolphins','AFC','AFC East'),
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
        # Producción ofensiva complementaria (PBP).
        'passComp': 0, 'passAtt': 0, 'passPct': 0, 'passAvg': 0, 'passLong': 0,
        'passTD': 0, 'interceptions': 0, 'passerRating': 0,
        'rushAtt': 0, 'rushAvg': 0, 'rushLong': 0, 'rushTD': 0,
        'rushFumbles': 0, 'rushFumblesLost': 0,
        'receptions': 0, 'receiving': 0, 'receivingAvg': 0, 'receivingPerGame': 0,
        'receivingLong': 0, 'receivingTD': 0, 'receivingFumbles': 0, 'receivingFumblesLost': 0,
        'firstDowns': 0, 'firstDownRush': 0, 'firstDownPass': 0, 'firstDownPenalty': 0,
        'thirdDownAtt': 0, 'thirdDownConv': 0, 'thirdDownRate': 0,
        'fourthDownAtt': 0, 'fourthDownConv': 0, 'fourthDownRate': 0,
        'penalties': 0, 'penaltyYards': 0,
        # Producción permitida / defensa.
        'passCompAllowed': 0, 'passAttAllowed': 0, 'passPctAllowed': 0,
        'passAvgAllowed': 0, 'passLongAllowed': 0, 'passTDAllowed': 0,
        'interceptionsMade': 0, 'passerRatingAllowed': 0,
        'rushAttAllowed': 0, 'rushAvgAllowed': 0, 'rushLongAllowed': 0,
        'rushTDAllowed': 0, 'rushFumblesAllowed': 0, 'rushFumblesLostAllowed': 0,
        'receptionsAllowed': 0, 'receivingAllowed': 0, 'receivingAvgAllowed': 0,
        'receivingAllowedPerGame': 0, 'receivingLongAllowed': 0, 'receivingTDAllowed': 0,
        'receivingFumblesAllowed': 0, 'receivingFumblesLostAllowed': 0,
        'firstDownsAllowed': 0, 'firstDownRushAllowed': 0,
        'firstDownPassAllowed': 0, 'firstDownPenaltyAllowed': 0,
        'thirdDownAttAllowed': 0, 'thirdDownConvAllowed': 0, 'thirdDownRateAllowed': 0,
        'fourthDownAttAllowed': 0, 'fourthDownConvAllowed': 0, 'fourthDownRateAllowed': 0,
        'penaltiesAllowed': 0, 'penaltyYardsAllowed': 0,
        'epa': 0, 'plays': 0, 'successPlays': 0, 'epaPlays': 0, 'turnovers': 0,
    }


def load_official_team_stats(season):
    """Carga los totales REG oficiales por equipo de nflverse.

    Este archivo es la fuente autoritativa para estadísticas de equipo como
    recepciones, yardas recibidas, fumbles y penalizaciones. No se usa para
    reemplazar los acumulados de pase/carrera/yardas base validados en V12.
    """
    url = f'{BASE}/stats_team/stats_team_reg_{season}.csv'
    rows = read_csv(url)
    if not rows:
        raise RuntimeError(f'{season}: stats_team_reg descargó vacío')

    required = {
        'team', 'completions', 'attempts', 'passing_tds',
        'passing_interceptions', 'carries', 'rushing_tds',
        'rushing_fumbles', 'rushing_fumbles_lost', 'receptions',
        'receiving_yards', 'receiving_tds', 'receiving_fumbles',
        'receiving_fumbles_lost', 'penalties', 'penalty_yards',
    }
    missing = sorted(required - set(rows[0].keys()))
    if missing:
        raise RuntimeError(
            f'{season}: stats_team_reg no contiene columnas requeridas: '
            + ', '.join(missing)
        )

    by_team = {}
    for row in rows:
        abbr = (row.get('team') or '').strip()
        if not abbr:
            continue
        if abbr in by_team:
            raise RuntimeError(f'{season}: equipo duplicado en stats_team_reg: {abbr}')
        by_team[abbr] = row
    return by_team


def player_fumbles_on_play(play, player_ids):
    """Cuenta jugadores concretos que soltaron el balón en la jugada (máx. 2)."""
    wanted = {str(value).strip() for value in player_ids if value not in ('', None, 'NA')}
    if not wanted:
        return 0
    count = 0
    for index in (1, 2):
        fumbler = str(play.get(f'fumbled_{index}_player_id') or '').strip()
        if fumbler and fumbler in wanted:
            count += 1
    return count


def official_code_candidates(abbr):
    """Códigos alternativos de una misma franquicia a través de la historia."""
    alias_groups = (
        ('OK', 'OAK', 'LV'),
        ('SD', 'LAC'),
        ('STL', 'LA', 'LAR'),
        ('WSH', 'WAS'),
    )
    for group in alias_groups:
        if abbr in group:
            # Preferir primero el código exacto y luego sus equivalentes.
            return (abbr,) + tuple(code for code in group if code != abbr)
    return (abbr,)


def aggregate_weekly_rushing_fumbles(weekly_rows, season):
    """Suma fumbles terrestres de las filas semanales REG por equipo."""
    required = {'team', 'season_type', 'rushing_fumbles', 'rushing_fumbles_lost'}
    if not weekly_rows:
        raise RuntimeError(f'{season}: no hay estadísticas semanales para validar fumbles')
    missing = sorted(required - set(weekly_rows[0].keys()))
    if missing:
        raise RuntimeError(
            f'{season}: stats_team_week no contiene columnas para validar fumbles: '
            + ', '.join(missing)
        )

    totals = {}
    for row in weekly_rows:
        if str(row.get('season', season)) != str(season):
            continue
        if (row.get('season_type') or 'REG').upper() != 'REG':
            continue
        team = (row.get('team') or '').strip()
        if not team:
            continue
        values = totals.setdefault(team, {'fumbles': 0.0, 'lost': 0.0, 'weeks': 0})
        values['fumbles'] += num(row, 'rushing_fumbles')
        values['lost'] += num(row, 'rushing_fumbles_lost')
        values['weeks'] += 1
    if not totals:
        raise RuntimeError(f'{season}: no hay filas REG válidas en stats_team_week')
    return totals


def validate_weekly_vs_season_rushing_fumbles(stats, official_rows, weekly_rows, season):
    """Exige que el acumulado semanal REG coincida con el resumen oficial REG."""
    weekly = aggregate_weekly_rushing_fumbles(weekly_rows, season)
    mismatches = []
    matched = 0
    for abbr in stats:
        official_code = next(
            (code for code in official_code_candidates(abbr) if code in official_rows),
            None,
        )
        weekly_code = next(
            (code for code in official_code_candidates(abbr) if code in weekly),
            None,
        )
        if not official_code or not weekly_code:
            mismatches.append(f'{abbr}: sin correspondencia oficial/semanal')
            continue
        official = official_rows[official_code]
        week_total = weekly[weekly_code]
        reg_fumbles = num(official, 'rushing_fumbles')
        reg_lost = num(official, 'rushing_fumbles_lost')
        if (week_total['fumbles'], week_total['lost']) != (reg_fumbles, reg_lost):
            mismatches.append(
                f'{abbr}: REG={reg_fumbles:g}/{reg_lost:g}, '
                f'semanal={week_total["fumbles"]:g}/{week_total["lost"]:g}'
            )
        else:
            matched += 1
    if mismatches:
        raise RuntimeError(
            f'{season}: discrepancia en fumbles terrestres entre stats_team_reg '
            'y la suma de stats_team_week: ' + '; '.join(mismatches[:12])
        )
    print(f'{season}: fumbles terrestres validados: {matched} equipos (REG semanal = REG temporada)')


def apply_official_team_stats(stats, official_rows):
    """Sobrescribe solo métricas complementarias con totales oficiales.

    Resuelve códigos históricos distintos entre schedules y stats_team_reg.
    Intencionalmente NO toca pass, rush, passNet, passAllowedNet,
    sacks/sack yardage ni totalYards/yardsAllowed.
    """
    official_by_schedule_code = {}
    used_official_codes = set()
    missing_teams = []
    for abbr in stats:
        match = next(
            (code for code in official_code_candidates(abbr)
             if code in official_rows and code not in used_official_codes),
            None
        )
        if match is None:
            missing_teams.append(abbr)
        else:
            official_by_schedule_code[abbr] = official_rows[match]
            used_official_codes.add(match)

    if missing_teams:
        raise RuntimeError(
            'Faltan equipos en stats_team_reg después de normalizar códigos: '
            + ', '.join(sorted(missing_teams))
        )

    fields = {
        'passComp': 'completions',
        'passAtt': 'attempts',
        'passTD': 'passing_tds',
        'interceptions': 'passing_interceptions',
        'rushAtt': 'carries',
        'rushTD': 'rushing_tds',
        'rushFumbles': 'rushing_fumbles',
        'rushFumblesLost': 'rushing_fumbles_lost',
        'receptions': 'receptions',
        'receiving': 'receiving_yards',
        'receivingTD': 'receiving_tds',
        'receivingFumbles': 'receiving_fumbles',
        'receivingFumblesLost': 'receiving_fumbles_lost',
        'penalties': 'penalties',
        'penaltyYards': 'penalty_yards',
        # La tabla defensiva muestra las penalizaciones cometidas por ese equipo,
        # no las penalizaciones cometidas por el rival.
        'penaltiesAllowed': 'penalties',
        'penaltyYardsAllowed': 'penalty_yards',
    }
    for abbr, team in stats.items():
        row = official_by_schedule_code[abbr]
        for target, source in fields.items(): 
            team[target] = abs(num(row, source)) if source == 'penalty_yards' else num(row, source)



def apply_weekly_opponent_rushing_fumbles(stats, weekly_rows, season):
    """Atribuye a cada defensa los rushing_fumbles del rival en cada juego REG.

    stats_team_week registra una fila por equipo/juego y contiene opponent_team.
    La métrica defensiva debe ser el total de fumbles terrestres del ataque rival,
    no una búsqueda local de fumbled_player_id dentro del PBP.
    """
    if not weekly_rows:
        raise RuntimeError(f'{season}: stats_team_week está vacío; no se pueden asignar FUM defensivos')

    required = {'season', 'season_type', 'team', 'opponent_team', 'game_id',
                'rushing_fumbles', 'rushing_fumbles_lost'}
    missing = sorted(required - set(weekly_rows[0].keys()))
    if missing:
        raise RuntimeError(
            f'{season}: stats_team_week no contiene columnas para FUM defensivos: '
            + ', '.join(missing)
        )

    def resolve_team(code):
        code = (code or '').strip()
        if code in stats:
            return code
        matches = [abbr for abbr in stats if code in official_code_candidates(abbr)]
        if len(matches) == 1:
            return matches[0]
        raise RuntimeError(
            f'{season}: no se pudo resolver el código {code!r} de stats_team_week '
            'contra los equipos del calendario'
        )

    totals = {abbr: {'fumbles': 0.0, 'lost': 0.0, 'games': 0} for abbr in stats}
    seen = set()
    offense_sum = 0.0
    defense_sum = 0.0
    matched_rows = 0

    for row in weekly_rows:
        if str(row.get('season', '')) != str(season):
            continue
        if (row.get('season_type') or 'REG').upper() != 'REG':
            continue
        offense = resolve_team(row.get('team'))
        defense = resolve_team(row.get('opponent_team'))
        game_id = (row.get('game_id') or '').strip()
        if not game_id:
            raise RuntimeError(f'{season}: fila semanal sin game_id al asignar FUM defensivos')
        key = (game_id, offense)
        if key in seen:
            raise RuntimeError(f'{season}: fila semanal duplicada para {offense} en {game_id}')
        seen.add(key)

        fumbles = num(row, 'rushing_fumbles')
        lost = num(row, 'rushing_fumbles_lost')
        totals[defense]['fumbles'] += fumbles
        totals[defense]['lost'] += lost
        totals[defense]['games'] += 1
        offense_sum += fumbles
        defense_sum += fumbles
        matched_rows += 1

    missing_teams = [abbr for abbr, value in totals.items() if value['games'] == 0]
    if missing_teams:
        raise RuntimeError(
            f'{season}: sin registros semanales de rivales para equipos: '
            + ', '.join(sorted(missing_teams))
        )
    if abs(offense_sum - defense_sum) > 1e-9:
        raise RuntimeError(f'{season}: no cuadra el total de FUM ofensivos y defensivos')

    changes = []
    for abbr, value in totals.items():
        old_fum = num(stats[abbr], 'rushFumblesAllowed')
        old_lost = num(stats[abbr], 'rushFumblesLostAllowed')
        new_fum = value['fumbles']
        new_lost = value['lost']
        if (old_fum, old_lost) != (new_fum, new_lost):
            changes.append(f'{abbr} {old_fum:g}/{old_lost:g}->{new_fum:g}/{new_lost:g}')
        stats[abbr]['rushFumblesAllowed'] = new_fum
        stats[abbr]['rushFumblesLostAllowed'] = new_lost

    print(
        f'{season}: FUM defensivos asignados desde rushing_fumbles del rival: '
        f'{matched_rows} filas, {len(stats)} defensas; '
        f'{len(changes)} ajustes respecto al PBP local'
    )
    if changes:
        print(f'{season}: diferencias PBP -> semanal: ' + '; '.join(changes))

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

        # Totales oficiales por equipo. Para la temporada vigente, si la fuente
        # no está disponible o viene incompleta, se cancela antes de publicar JSON.
        official_team_rows = {}
        try:
            official_team_rows = load_official_team_stats(season)
            print(f'{season}: {len(official_team_rows)} equipos en stats_team_reg')
        except Exception as error:
            if season == CURRENT:
                raise RuntimeError(
                    f'{season}: no se pueden validar estadísticas complementarias; '
                    'se cancela la publicación para proteger data/nfl.json.'
                ) from error
            print(f'{season}: stats_team_reg no disponible; se conserva cálculo PBP: {error}')

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

        # Estadísticas oficiales por equipo y partido (una fila por team/game).
        # Se usan para poblar awayStats/homeStats en cada ficha sin alterar
        # los acumulados de temporada que ya están validados con PBP.
        weekly_rows = []
        weekly_stats_loaded = False
        weekly_url = f'{BASE}/stats_team/stats_team_week_{season}.csv'
        try:
            weekly_rows = read_csv(weekly_url)
            weekly_stats_loaded = True
            print(f'{season}: {len(weekly_rows)} filas de estadísticas semanales')
        except Exception as error:
            print(f'{season}: no se pudieron cargar estadísticas por partido: {error}')

        # Control de calidad: los fumbles terrestres del resumen REG deben
        # coincidir con la suma de los registros semanales REG. Si no coinciden,
        # se cancela antes de publicar el JSON; nunca se corrigen por equipo a mano.
        if official_team_rows and weekly_stats_loaded:
            validate_weekly_vs_season_rushing_fumbles(
                stats, official_team_rows, weekly_rows, season
            )
        elif season == CURRENT:
            raise RuntimeError(
                f'{season}: no se pudo validar automáticamente rushing_fumbles '
                'con stats_team_week; se cancela la publicación para proteger data/nfl.json.'
            )

        game_stats_by_id = {}
        seen_team_games = {}
        for row in weekly_rows:
            if str(row.get('season', '')) != str(season):
                continue
            game_type = (row.get('season_type') or 'REG').upper()
            team = row.get('team', '')
            game_id = (row.get('game_id') or '').strip()
            if not game_id or not team:
                continue
            key = (game_type, team, game_id)
            if key in seen_team_games:
                if seen_team_games[key] != row:
                    raise RuntimeError(
                        f'{season}: estadísticas duplicadas y contradictorias '
                        f'para {team} en {game_id}; se cancela la publicación.'
                    )
                continue
            seen_team_games[key] = row

            gross_pass = num(row, 'passing_yards')
            sack_loss = num(row, 'sack_yards_lost')  # nflverse lo guarda negativo
            game_stats_by_id.setdefault((game_type, game_id), {})[team] = {
                'passGross': gross_pass,
                'passNet': gross_pass + sack_loss,
                'rush': num(row, 'rushing_yards'),
                'receiving': num(row, 'receiving_yards'),
                'passAtt': num(row, 'attempts'),
                'passComp': num(row, 'completions'),
                'passTD': num(row, 'passing_tds'),
                'interceptions': num(row, 'passing_interceptions'),
                'rushAtt': num(row, 'carries'),
                'rushTD': num(row, 'rushing_tds'),
                'receptions': num(row, 'receptions'),
                'receivingTD': num(row, 'receiving_tds'),
                'sacks': num(row, 'def_sacks'),
                'sackYards': num(row, 'def_sack_yards'),
                'sacksAllowed': num(row, 'sacks_suffered'),
                'sackYardsAllowed': sack_loss,
                'firstDowns': num(row, 'first_downs'),
                'thirdDownAtt': num(row, 'third_down_att'),
                'thirdDownConv': num(row, 'third_down_converted'),
                'fourthDownAtt': num(row, 'fourth_down_att'),
                'fourthDownConv': num(row, 'fourth_down_converted'),
                'penalties': num(row, 'penalties'),
                'penaltyYards': num(row, 'penalty_yards'),
                'turnovers': (
                    num(row, 'passing_interceptions')
                    + num(row, 'rushing_fumbles_lost')
                    + num(row, 'receiving_fumbles_lost')
                    + num(row, 'sack_fumbles_lost')
                ),
                'plays': num(row, 'plays'),
                'epa': (
                    num(row, 'passing_epa')
                    + num(row, 'rushing_epa')
                    + num(row, 'receiving_epa')
                ),
            }

        for game in cooked_games:
            per_team = game_stats_by_id.get(
                ((game.get('gameType') or 'REG').upper(), str(game.get('gameId') or '')),
                {}
            )
            game['awayStats'] = per_team.get(game['away'])
            game['homeStats'] = per_team.get(game['home'])

        def passer_rating(completions, attempts, yards, touchdowns, interceptions):
            if attempts <= 0:
                return 0.0
            a = max(0.0, min(2.375, ((completions / attempts) - 0.3) * 5))
            b = max(0.0, min(2.375, ((yards / attempts) - 3) * 0.25))
            c = max(0.0, min(2.375, (touchdowns / attempts) * 20))
            d = max(0.0, min(2.375, 2.375 - (interceptions / attempts) * 25))
            return ((a + b + c + d) / 6) * 100

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

            off = stats[offense]
            deff = stats[defense]
            down = int(num(play, 'down')) if num(play, 'down') in (1, 2, 3, 4) else 0
            pass_attempt = num(play, 'pass_attempt') == 1
            sack_play = num(play, 'sack') == 1
            completed_pass = num(play, 'complete_pass') == 1
            rush_attempt = num(play, 'rush_attempt') == 1
            interception = num(play, 'interception') == 1
            pass_yards = num(play, 'passing_yards')
            recv_yards = num(play, 'receiving_yards') + num(play, 'lateral_receiving_yards')
            run_yards = num(play, 'rushing_yards')
            pass_td = num(play, 'pass_touchdown')
            rush_td = num(play, 'rush_touchdown')

            # Pases: ATT oficial excluye sacks; los sacks se cuentan por separado.
            if pass_attempt and not sack_play:
                off['passAtt'] += 1
                deff['passAttAllowed'] += 1
                if completed_pass:
                    off['passComp'] += 1
                    deff['passCompAllowed'] += 1
                off['passLong'] = max(off['passLong'], pass_yards)
                deff['passLongAllowed'] = max(deff['passLongAllowed'], pass_yards)
                off['passTD'] += pass_td
                deff['passTDAllowed'] += pass_td
                if interception:
                    off['interceptions'] += 1
                    deff['interceptionsMade'] += 1

                # Recepción atribuida al equipo receptor cuando existe receiver_player_id.
                if play.get('receiver_player_id') or play.get('lateral_receiver_player_id'):
                    if completed_pass and play.get('receiver_player_id'):
                        # REC corresponde al receptor del pase, no a un lateral posterior.
                        off['receptions'] += 1
                        deff['receptionsAllowed'] += 1
                    off['receiving'] += recv_yards
                    deff['receivingAllowed'] += recv_yards
                    off['receivingLong'] = max(off['receivingLong'], recv_yards)
                    deff['receivingLongAllowed'] = max(deff['receivingLongAllowed'], recv_yards)
                    off['receivingTD'] += pass_td
                    deff['receivingTDAllowed'] += pass_td
                    receiver_fumbles = player_fumbles_on_play(
                        play,
                        (play.get('receiver_player_id'), play.get('lateral_receiver_player_id'))
                    )
                    if receiver_fumbles:
                        off['receivingFumbles'] += receiver_fumbles
                        deff['receivingFumblesAllowed'] += receiver_fumbles
                        if num(play, 'fumble_lost') == 1:
                            off['receivingFumblesLost'] += 1
                            deff['receivingFumblesLostAllowed'] += 1

            # Acarreos.
            if rush_attempt:
                off['rushAtt'] += 1
                deff['rushAttAllowed'] += 1
                off['rushLong'] = max(off['rushLong'], run_yards)
                deff['rushLongAllowed'] = max(deff['rushLongAllowed'], run_yards)
                off['rushTD'] += rush_td
                deff['rushTDAllowed'] += rush_td
                rush_fumbles = player_fumbles_on_play(
                    play,
                    (play.get('rusher_player_id'), play.get('lateral_rusher_player_id'))
                )
                if rush_fumbles:
                    off['rushFumbles'] += rush_fumbles
                    deff['rushFumblesAllowed'] += rush_fumbles
                    if num(play, 'fumble_lost') == 1:
                        off['rushFumblesLost'] += 1
                        deff['rushFumblesLostAllowed'] += 1

            # Primeros downs y conversiones situacionales.
            fd_rush = num(play, 'first_down_rush')
            fd_pass = num(play, 'first_down_pass')
            fd_penalty = num(play, 'first_down_penalty')
            off['firstDownRush'] += fd_rush
            off['firstDownPass'] += fd_pass
            off['firstDownPenalty'] += fd_penalty
            deff['firstDownRushAllowed'] += fd_rush
            deff['firstDownPassAllowed'] += fd_pass
            deff['firstDownPenaltyAllowed'] += fd_penalty
            off['firstDowns'] += fd_rush + fd_pass + fd_penalty
            deff['firstDownsAllowed'] += fd_rush + fd_pass + fd_penalty

            if down == 3 and (pass_attempt or rush_attempt):
                off['thirdDownAtt'] += 1
                deff['thirdDownAttAllowed'] += 1
                if num(play, 'third_down_converted') == 1:
                    off['thirdDownConv'] += 1
                    deff['thirdDownConvAllowed'] += 1
            if down == 4 and (pass_attempt or rush_attempt):
                off['fourthDownAtt'] += 1
                deff['fourthDownAttAllowed'] += 1
                if num(play, 'fourth_down_converted') == 1:
                    off['fourthDownConv'] += 1
                    deff['fourthDownConvAllowed'] += 1

            # Penalizaciones: se acreditan al equipo señalado por nflverse.
            if num(play, 'penalty') == 1:
                penalty_team = play.get('penalty_team') or ''
                penalty_yards = abs(num(play, 'penalty_yards'))
                if penalty_team == offense:
                    off['penalties'] += 1
                    off['penaltyYards'] += penalty_yards
                elif penalty_team == defense:
                    deff['penaltiesAllowed'] += 1
                    deff['penaltyYardsAllowed'] += penalty_yards

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

        # Aplicar fuente oficial solo a estadísticas complementarias. Los campos
        # base de yardas validados previamente permanecen exactamente como estaban.
        if official_team_rows:
            apply_official_team_stats(stats, official_team_rows)

        # FUM defensivos: se atribuyen desde el registro semanal del ataque rival.
        # El resumen REG semanal ya fue validado contra stats_team_reg arriba.
        if weekly_stats_loaded:
            apply_weekly_opponent_rushing_fumbles(stats, weekly_rows, season)
        elif season == CURRENT:
            raise RuntimeError(
                f'{season}: faltan estadísticas semanales para asignar FUM defensivos; '
                'se conserva el JSON anterior.'
            )

        teams = []
        for team in stats.values():
            gp = team['gp']
            team['passNet'] = team['pass'] - team['sackYardsAllowed']
            team['passAllowedNet'] = team['passAllowed'] - team['sacksMadeYards']
            # Métricas complementarias calculadas sobre las jugadas de temporada regular.
            team['passPct'] = team['passComp'] / team['passAtt'] if team['passAtt'] else 0
            team['passAvg'] = team['passNet'] / (team['passAtt'] - team['sacksAllowed']) if (team['passAtt'] - team['sacksAllowed']) > 0 else 0
            team['passerRating'] = passer_rating(
                team['passComp'], team['passAtt'], team['passNet'],
                team['passTD'], team['interceptions']
            )
            team['rushAvg'] = team['rush'] / team['rushAtt'] if team['rushAtt'] else 0
            team['receivingAvg'] = team['receiving'] / team['receptions'] if team['receptions'] else 0
            team['receivingPerGame'] = team['receiving'] / gp if gp else 0
            team['thirdDownRate'] = team['thirdDownConv'] / team['thirdDownAtt'] if team['thirdDownAtt'] else 0
            team['fourthDownRate'] = team['fourthDownConv'] / team['fourthDownAtt'] if team['fourthDownAtt'] else 0

            team['passPctAllowed'] = team['passCompAllowed'] / team['passAttAllowed'] if team['passAttAllowed'] else 0
            team['passAvgAllowed'] = team['passAllowedNet'] / team['passAttAllowed'] if team['passAttAllowed'] else 0
            team['passerRatingAllowed'] = passer_rating(
                team['passCompAllowed'], team['passAttAllowed'], team['passAllowedNet'],
                team['passTDAllowed'], team['interceptionsMade']
            )
            team['rushAvgAllowed'] = team['rushAllowed'] / team['rushAttAllowed'] if team['rushAttAllowed'] else 0
            team['receivingAvgAllowed'] = team['receivingAllowed'] / team['receptionsAllowed'] if team['receptionsAllowed'] else 0
            team['receivingAllowedPerGame'] = team['receivingAllowed'] / gp if gp else 0
            team['thirdDownRateAllowed'] = team['thirdDownConvAllowed'] / team['thirdDownAttAllowed'] if team['thirdDownAttAllowed'] else 0
            team['fourthDownRateAllowed'] = team['fourthDownConvAllowed'] / team['fourthDownAttAllowed'] if team['fourthDownAttAllowed'] else 0

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
            'gameStatsAvailable': weekly_stats_loaded,
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