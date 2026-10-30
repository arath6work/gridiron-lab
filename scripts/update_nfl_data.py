#!/usr/bin/env python3
"""Build data/nfl.json from nflverse's processed weekly team-stat releases.

The frontend contract remains unchanged: seasons -> types -> REG/POST -> teams/games.
Team production comes from stats_team_week_<season>.csv, not a local PBP re-calculation.
"""
import csv
import datetime as dt
import io
import gzip
import json
import os
import urllib.request
from collections import defaultdict

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FIRST_SEASON = 1999
CURRENT = dt.datetime.now(dt.timezone.utc).year
PBP_CACHE_DIR = os.path.join("data", "pbp_team_summaries")

TEAM_INFO = {
    "ARI": ("Arizona Cardinals", "NFC", "NFC West"),
    "ATL": ("Atlanta Falcons", "NFC", "NFC South"),
    "BAL": ("Baltimore Ravens", "AFC", "AFC North"),
    "BUF": ("Buffalo Bills", "AFC", "AFC East"),
    "CAR": ("Carolina Panthers", "NFC", "NFC South"),
    "CHI": ("Chicago Bears", "NFC", "NFC North"),
    "CIN": ("Cincinnati Bengals", "AFC", "AFC North"),
    "CLE": ("Cleveland Browns", "AFC", "AFC North"),
    "DAL": ("Dallas Cowboys", "NFC", "NFC East"),
    "DEN": ("Denver Broncos", "AFC", "AFC West"),
    "DET": ("Detroit Lions", "NFC", "NFC North"),
    "GB": ("Green Bay Packers", "NFC", "NFC North"),
    "HOU": ("Houston Texans", "AFC", "AFC South"),
    "IND": ("Indianapolis Colts", "AFC", "AFC South"),
    "JAX": ("Jacksonville Jaguars", "AFC", "AFC South"),
    "KC": ("Kansas City Chiefs", "AFC", "AFC West"),
    "LAR": ("Los Angeles Rams", "NFC", "NFC West"),
    "LAC": ("Los Angeles Chargers", "AFC", "AFC West"),
    "LV": ("Las Vegas Raiders", "AFC", "AFC West"),
    "MIA": ("Miami Dolphins", "AFC", "AFC East"),
    "MIN": ("Minnesota Vikings", "NFC", "NFC North"),
    "NE": ("New England Patriots", "AFC", "AFC East"),
    "NO": ("New Orleans Saints", "NFC", "NFC South"),
    "NYG": ("New York Giants", "NFC", "NFC East"),
    "NYJ": ("New York Jets", "AFC", "AFC East"),
    "PHI": ("Philadelphia Eagles", "NFC", "NFC East"),
    "PIT": ("Pittsburgh Steelers", "AFC", "AFC North"),
    "SF": ("San Francisco 49ers", "NFC", "NFC West"),
    "SEA": ("Seattle Seahawks", "NFC", "NFC West"),
    "TB": ("Tampa Bay Buccaneers", "NFC", "NFC South"),
    "TEN": ("Tennessee Titans", "AFC", "AFC South"),
    "WAS": ("Washington Commanders", "NFC", "NFC East"),
}
# Historical abbreviations are normalized to the current franchise key.
ALIASES = {
    "LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC",
    "WSH": "WAS",
}

def norm_team(team):
    team = (team or "").strip()
    return ALIASES.get(team, team)

def read_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "GridironLab/2.0"})
    with urllib.request.urlopen(req, timeout=180) as response:
        raw = response.read()
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace"))))

def n(row, key):
    value = row.get(key, "")
    if value in ("", None, "NA", "N/A", "nan", "NaN"):
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0

def empty_team(abbr):
    name, conf, div = TEAM_INFO[abbr]
    return {
        "abbr": abbr, "name": name, "conf": conf, "div": div,
        "gp": 0, "w": 0, "l": 0, "t": 0, "pct": 0,
        "points": 0, "pointsAllowed": 0, "pointsPerGame": 0,
        "pointsAllowedPerGame": 0, "diff": 0,
        "pass": 0, "passNet": 0, "passAtt": 0, "passComp": 0,
        "passTD": 0, "passInt": 0, "passAvg": 0, "passPct": 0, "passLong": 0,
        "passPerGame": 0, "passNetPerGame": 0,
        "rush": 0, "rushAtt": 0, "rushTD": 0, "rushAvg": 0, "rushLong": 0,
        "rushPerGame": 0, "receiving": 0, "receptions": 0,
        "receivingTD": 0, "receivingAvg": 0, "receivingPerGame": 0, "receivingLong": 0,
        "totalYards": 0, "yardsPerGame": 0,
        "passAllowed": 0, "passAllowedNet": 0, "passAttAllowed": 0,
        "passCompAllowed": 0, "passTDAllowed": 0, "passIntAllowed": 0,
        "passAvgAllowed": 0, "passPctAllowed": 0, "passAllowedPerGame": 0, "passLongAllowed": 0,
        "rushAllowed": 0, "rushAttAllowed": 0, "rushTDAllowed": 0,
        "rushAvgAllowed": 0, "rushAllowedPerGame": 0, "rushLongAllowed": 0,
        "receivingAllowed": 0, "receptionsAllowed": 0,
        "receivingTDAllowed": 0, "receivingAvgAllowed": 0,
        "receivingAllowedPerGame": 0, "receivingLongAllowed": 0,
        "yardsAllowed": 0, "yardsAllowedPerGame": 0,
        "sacksAllowed": 0, "sackYardsAllowed": 0,
        "interceptions": 0, "interceptionsMade": 0, "fumblesLost": 0, "turnovers": 0,
        "sacksMade": 0, "sacksMadeYards": 0,
        "epa": 0, "epaPerPlay": None, "plays": 0,
        "successPlays": 0, "successRate": None, "epaPlays": 0,
        "firstDownRush": 0, "firstDownPass": 0, "firstDownPenalty": 0,
        "thirdDownAtt": 0, "thirdDownConv": 0, "thirdDownRate": 0,
        "fourthDownAtt": 0, "fourthDownConv": 0, "fourthDownRate": 0,
        "firstDownRushAllowed": 0, "firstDownPassAllowed": 0, "firstDownPenaltyAllowed": 0,
        "thirdDownAttAllowed": 0, "thirdDownConvAllowed": 0,
        "fourthDownAttAllowed": 0, "fourthDownConvAllowed": 0, "fourthDownRateAllowed": 0,
        "thirdDownRateAllowed": 0, "firstDowns": 0,
        "firstDownsAllowed": 0, "penalties": 0, "penaltyYards": 0,
        "penaltiesAllowed": 0, "penaltyYardsAllowed": 0,
        "sacks": 0, "sacksAllowed": 0, "receivingFumbles": 0,
        "rushFumblesAllowed": 0, "rushFumblesLostAllowed": 0,
        "receivingFumblesAllowed": 0, "receivingFumblesLostAllowed": 0,
        "receivingFumblesLost": 0, "rushFumbles": 0, "rushFumblesLost": 0,
        "advancedAvailable": True,
    }


def empty_pbp_summary():
    return {
        "passLong": 0, "rushLong": 0, "receivingLong": 0,
        "firstDownRush": 0, "firstDownPass": 0, "firstDownPenalty": 0,
        "thirdDownAtt": 0, "thirdDownConv": 0,
        "fourthDownAtt": 0, "fourthDownConv": 0,
    }

def load_pbp_summaries(season):
    """Load cached summaries or stream nflverse PBP and cache the missing box-score fields."""
    os.makedirs(PBP_CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(PBP_CACHE_DIR, f"{season}.json")
    # Refresh the current and previous season for late stat corrections.
    if season < CURRENT - 1 and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as cache_file:
            return json.load(cache_file)

    summaries = {
        kind: {
            "offense": {abbr: empty_pbp_summary() for abbr in TEAM_INFO},
            "defense": {abbr: empty_pbp_summary() for abbr in TEAM_INFO},
        }
        for kind in ("REG", "POST")
    }
    urls = [
        f"{BASE}/pbp/play_by_play_{season}.csv.gz",
        f"{BASE}/pbp/play_by_play_{season}.csv",
    ]
    last_error = None
    for url in urls:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "GridironLab/2.1"})
            response = urllib.request.urlopen(request, timeout=240)
            raw = gzip.GzipFile(fileobj=response) if url.endswith(".gz") else response
            text_stream = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace")
            reader = csv.DictReader(text_stream)
            rows_seen = 0
            for row in reader:
                if str(row.get("season", "")) != str(season):
                    continue
                kind = (row.get("season_type") or "").upper()
                if kind not in summaries:
                    continue
                offense = norm_team(row.get("posteam"))
                defense = norm_team(row.get("defteam"))
                if offense not in TEAM_INFO or defense not in TEAM_INFO:
                    continue
                off = summaries[kind]["offense"][offense]
                deff = summaries[kind]["defense"][defense]

                # Longest play values are maxima, not sums.
                for key, field in (
                    ("passLong", "passing_yards"),
                    ("rushLong", "rushing_yards"),
                    ("receivingLong", "receiving_yards"),
                ):
                    value = n(row, field)
                    if value > off[key]:
                        off[key] = value
                    if value > deff[key]:
                        deff[key] = value

                # Down conversions and first-down type are play-level PBP fields.
                for key, field in (
                    ("firstDownRush", "first_down_rush"),
                    ("firstDownPass", "first_down_pass"),
                    ("firstDownPenalty", "first_down_penalty"),
                    ("thirdDownConv", "third_down_converted"),
                    ("fourthDownConv", "fourth_down_converted"),
                ):
                    value = n(row, field)
                    off[key] += value
                    deff[key] += value

                down = int(n(row, "down"))
                if down == 3 and (n(row, "third_down_converted") or n(row, "third_down_failed")):
                    off["thirdDownAtt"] += 1
                    deff["thirdDownAtt"] += 1
                if down == 4 and (n(row, "fourth_down_converted") or n(row, "fourth_down_failed")):
                    off["fourthDownAtt"] += 1
                    deff["fourthDownAtt"] += 1
                rows_seen += 1
            text_stream.close()
            if rows_seen == 0:
                raise ValueError(f"PBP {season}: archivo descargado pero sin jugadas válidas")
            print(f"{season}: PBP procesado ({rows_seen} jugadas)")
            with open(cache_path, "w", encoding="utf-8") as cache_file:
                json.dump(summaries, cache_file, separators=(",", ":"))
            return summaries
        except Exception as exc:
            last_error = exc
            try:
                response.close()
            except Exception:
                pass
    raise RuntimeError(f"No se pudo cargar PBP de {season}: {last_error}")


def nfl_passer_rating(completions, attempts, yards, touchdowns, interceptions):
    if not attempts:
        return 0
    a = max(0, min(2.375, ((completions / attempts) - 0.3) * 5))
    b = max(0, min(2.375, ((yards / attempts) - 3) * 0.25))
    c = max(0, min(2.375, (touchdowns / attempts) * 20))
    d = max(0, min(2.375, 2.375 - (interceptions / attempts) * 25))
    return ((a + b + c + d) / 6) * 100

def build_type(season, kind, schedule_rows, weekly_rows, pbp_summary):
    teams = {abbr: empty_team(abbr) for abbr in TEAM_INFO}
    cooked_games = []
    # Scores/records are taken from the schedule, separately from yardage stats.
    game_type = "REG" if kind == "REG" else "POST"
    for g in schedule_rows:
        gt = (g.get("game_type") or "REG").upper()
        if gt != game_type:
            continue
        away, home = norm_team(g.get("away_team")), norm_team(g.get("home_team"))
        if away not in teams or home not in teams:
            continue
        try:
            week = int(float(g.get("week") or 0))
        except ValueError:
            week = 0
        def score(key):
            raw = g.get(key, "")
            return None if raw in ("", None, "NA", "nan", "NaN") else int(float(raw))
        ap, hp = score("away_score"), score("home_score")
        final = ap is not None and hp is not None
        cooked_games.append({
            "season": season, "week": week, "gameType": kind,
            "away": away, "awayName": teams[away]["name"], "awayPts": ap,
            "home": home, "homeName": teams[home]["name"], "homePts": hp,
            "status": "FINAL" if final else "PROGRAMADO",
            "gameday": g.get("gameday", ""), "gameId": g.get("game_id", ""),
        })
        if final:
            a, h = teams[away], teams[home]
            a["gp"] += 1; h["gp"] += 1
            a["points"] += ap; a["pointsAllowed"] += hp
            h["points"] += hp; h["pointsAllowed"] += ap
            if ap > hp: a["w"] += 1; h["l"] += 1
            elif hp > ap: h["w"] += 1; a["l"] += 1
            else: a["t"] += 1; h["t"] += 1

    rows_by_team = defaultdict(list)
    filtered_rows = []
    for row in weekly_rows:
        if (row.get("season_type") or "").upper() != kind:
            continue
        team = norm_team(row.get("team"))
        if team in teams:
            rows_by_team[team].append(row)
            filtered_rows.append(row)

    def summed(rows, key):
        return sum(n(row, key) for row in rows)

    # The release is game/week-level: sum every row for each team.
    # Defensive allowed totals are the sum of opponents' offensive rows
    # where opponent_team points to this team.
    for abbr, own_rows in rows_by_team.items():
        t = teams[abbr]
        t["gp"] = max(t["gp"], len(own_rows))
        t["pass"] = summed(own_rows, "passing_yards")
        t["passNet"] = t["pass"] - summed(own_rows, "sack_yards_lost")
        t["passAtt"] = summed(own_rows, "attempts")
        t["passComp"] = summed(own_rows, "completions")
        t["passTD"] = summed(own_rows, "passing_tds")
        t["passInt"] = summed(own_rows, "passing_interceptions")
        t["passAvg"] = t["pass"] / t["passAtt"] if t["passAtt"] else 0
        t["passPct"] = t["passComp"] / t["passAtt"] if t["passAtt"] else 0
        t["rush"] = summed(own_rows, "rushing_yards")
        t["rushAtt"] = summed(own_rows, "carries")
        t["rushTD"] = summed(own_rows, "rushing_tds")
        t["rushAvg"] = t["rush"] / t["rushAtt"] if t["rushAtt"] else 0
        t["receiving"] = summed(own_rows, "receiving_yards")
        t["receptions"] = summed(own_rows, "receptions")
        t["receivingTD"] = summed(own_rows, "receiving_tds")
        t["receivingAvg"] = t["receiving"] / t["receptions"] if t["receptions"] else 0
        t["receivingFumbles"] = summed(own_rows, "receiving_fumbles")
        t["receivingFumblesLost"] = summed(own_rows, "receiving_fumbles_lost")
        t["rushFumbles"] = summed(own_rows, "rushing_fumbles")
        t["rushFumblesLost"] = summed(own_rows, "rushing_fumbles_lost")
        t["sacks"] = summed(own_rows, "def_sacks")
        t["interceptions"] = t["passInt"]
        t["interceptionsMade"] = summed(own_rows, "def_interceptions")
        t["sacksAllowed"] = summed(own_rows, "sacks_suffered")
        t["sackYardsAllowed"] = summed(own_rows, "sack_yards_lost")
        t["sacksMade"] = summed(own_rows, "def_sacks")
        t["sacksMadeYards"] = summed(own_rows, "def_sack_yards")
        t["fumblesLost"] = t["rushFumblesLost"] + t["receivingFumblesLost"] + summed(own_rows, "sack_fumbles_lost")
        t["turnovers"] = t["interceptions"] + t["fumblesLost"]
        t["epa"] = summed(own_rows, "passing_epa") + summed(own_rows, "rushing_epa") + summed(own_rows, "receiving_epa")
        t["plays"] = summed(own_rows, "plays")
        t["epaPlays"] = summed(own_rows, "epa_plays")
        t["successPlays"] = summed(own_rows, "successes")
        t["firstDowns"] = summed(own_rows, "first_downs")
        t["thirdDownAtt"] = summed(own_rows, "third_down_att")
        t["thirdDownConv"] = summed(own_rows, "third_down_converted")
        t["penalties"] = summed(own_rows, "penalties")
        t["penaltyYards"] = summed(own_rows, "penalty_yards")
        t["advancedAvailable"] = True

        opp_rows = [
            row for row in filtered_rows
            if norm_team(row.get("opponent_team")) == abbr
        ]
        if opp_rows:
            t["passAllowed"] = summed(opp_rows, "passing_yards")
            t["passAllowedNet"] = t["passAllowed"] - summed(opp_rows, "sack_yards_lost")
            t["passAttAllowed"] = summed(opp_rows, "attempts")
            t["passCompAllowed"] = summed(opp_rows, "completions")
            t["passTDAllowed"] = summed(opp_rows, "passing_tds")
            t["passIntAllowed"] = summed(opp_rows, "passing_interceptions")
            t["rushAllowed"] = summed(opp_rows, "rushing_yards")
            t["rushAttAllowed"] = summed(opp_rows, "carries")
            t["rushTDAllowed"] = summed(opp_rows, "rushing_tds")
            t["receivingAllowed"] = summed(opp_rows, "receiving_yards")
            t["receptionsAllowed"] = summed(opp_rows, "receptions")
            t["receivingTDAllowed"] = summed(opp_rows, "receiving_tds")
            t["sacksAllowed"] = summed(opp_rows, "def_sacks")
            t["sackYardsAllowed"] = summed(opp_rows, "def_sack_yards")
            t["thirdDownAttAllowed"] = summed(opp_rows, "third_down_att")
            t["thirdDownConvAllowed"] = summed(opp_rows, "third_down_converted")
            t["firstDownsAllowed"] = summed(opp_rows, "first_downs")
            t["penaltiesAllowed"] = summed(opp_rows, "penalties")
            t["penaltyYardsAllowed"] = summed(opp_rows, "penalty_yards")
            t["rushFumblesAllowed"] = summed(opp_rows, "rushing_fumbles")
            t["rushFumblesLostAllowed"] = summed(opp_rows, "rushing_fumbles_lost")
            t["receivingFumblesAllowed"] = summed(opp_rows, "receiving_fumbles")
            t["receivingFumblesLostAllowed"] = summed(opp_rows, "receiving_fumbles_lost")

    # Fill longest-play and down-conversion fields from play-by-play without
    # changing the team-stat feed values that already match the official totals.
    offense_pbp = pbp_summary["offense"]
    defense_pbp = pbp_summary["defense"]
    for abbr, t in teams.items():
        own = offense_pbp[abbr]
        allowed = defense_pbp[abbr]
        for key in ("passLong", "rushLong", "receivingLong",
                    "firstDownRush", "firstDownPass", "firstDownPenalty",
                    "thirdDownAtt", "thirdDownConv", "fourthDownAtt", "fourthDownConv"):
            t[key] = own[key]
        t["firstDowns"] = own["firstDownRush"] + own["firstDownPass"] + own["firstDownPenalty"]
        t["thirdDownRate"] = own["thirdDownConv"] / own["thirdDownAtt"] if own["thirdDownAtt"] else 0
        t["fourthDownRate"] = own["fourthDownConv"] / own["fourthDownAtt"] if own["fourthDownAtt"] else 0
        for key in ("passLong", "rushLong", "receivingLong"):
            t[key + "Allowed"] = allowed[key]
        for key in ("firstDownRush", "firstDownPass", "firstDownPenalty",
                    "thirdDownAtt", "thirdDownConv", "fourthDownAtt", "fourthDownConv"):
            t[key + "Allowed"] = allowed[key]
        t["firstDownsAllowed"] = (allowed["firstDownRush"] + allowed["firstDownPass"] +
                                  allowed["firstDownPenalty"])
        t["thirdDownRateAllowed"] = (allowed["thirdDownConv"] / allowed["thirdDownAtt"]
                                     if allowed["thirdDownAtt"] else 0)
        t["fourthDownRateAllowed"] = (allowed["fourthDownConv"] / allowed["fourthDownAtt"]
                                      if allowed["fourthDownAtt"] else 0)

    for t in teams.values():
        gp = t["gp"]
        t["pct"] = (t["w"] + 0.5 * t["t"]) / gp if gp else 0
        t["diff"] = t["points"] - t["pointsAllowed"]
        t["totalYards"] = t["passNet"] + t["rush"]
        t["yardsAllowed"] = t["passAllowedNet"] + t["rushAllowed"]
        t["pointsPerGame"] = t["points"] / gp if gp else 0
        t["pointsAllowedPerGame"] = t["pointsAllowed"] / gp if gp else 0
        t["passPerGame"] = t["pass"] / gp if gp else 0
        t["passNetPerGame"] = t["passNet"] / gp if gp else 0
        t["passAllowedPerGame"] = t["passAllowed"] / gp if gp else 0
        t["rushPerGame"] = t["rush"] / gp if gp else 0
        t["rushAllowedPerGame"] = t["rushAllowed"] / gp if gp else 0
        t["receivingPerGame"] = t["receiving"] / gp if gp else 0
        t["receivingAllowedPerGame"] = t["receivingAllowed"] / gp if gp else 0
        t["receivingAvgAllowed"] = t["receivingAllowed"] / t["receptionsAllowed"] if t["receptionsAllowed"] else 0
        t["passAvgAllowed"] = t["passAllowed"] / t["passAttAllowed"] if t["passAttAllowed"] else 0
        t["passerRating"] = nfl_passer_rating(t["passComp"], t["passAtt"], t["pass"], t["passTD"], t["passInt"])
        t["passerRatingAllowed"] = nfl_passer_rating(
            t["passCompAllowed"], t["passAttAllowed"], t["passAllowed"],
            t["passTDAllowed"], t["passIntAllowed"]
        )
        t["passPctAllowed"] = t["passCompAllowed"] / t["passAttAllowed"] if t["passAttAllowed"] else 0
        t["rushAvgAllowed"] = t["rushAllowed"] / t["rushAttAllowed"] if t["rushAttAllowed"] else 0
        t["yardsPerGame"] = t["totalYards"] / gp if gp else 0
        t["yardsAllowedPerGame"] = t["yardsAllowed"] / gp if gp else 0
        t["thirdDownRate"] = t["thirdDownConv"] / t["thirdDownAtt"] if t["thirdDownAtt"] else 0
        t["thirdDownRateAllowed"] = t["thirdDownConvAllowed"] / t["thirdDownAttAllowed"] if t["thirdDownAttAllowed"] else 0
        t["epaPerPlay"] = t["epa"] / t["epaPlays"] if t["epaPlays"] else None
        t["successRate"] = t["successPlays"] / t["plays"] if t["plays"] else None
        for key, value in list(t.items()):
            if isinstance(value, float):
                t[key] = round(value, 3)
    return {
        "teams": list(teams.values()),
        "games": sorted(cooked_games, key=lambda g: (g["week"], g["gameday"], g["away"])),
        "advancedAvailable": bool(filtered_rows),
    }

def main():
    schedules = read_csv(f"{BASE}/schedules/games.csv")
    output = {
        "source": "nflverse_team_stats",
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "firstSeason": FIRST_SEASON,
        "seasons": {},
    }
    for season in range(FIRST_SEASON, CURRENT + 1):
        schedule_rows = [g for g in schedules if str(g.get("season", "")) == str(season)]
        try:
            weekly_rows = read_csv(f"{BASE}/stats_team/stats_team_week_{season}.csv")
            print(f"{season}: {len(weekly_rows)} filas de team stats")
        except Exception as exc:
            # Do not silently publish an empty replacement for a failed download.
            if season == CURRENT:
                print(f"{season}: team stats todavía no disponible ({exc}); se conserva temporada sin stats")
                weekly_rows = []
            else:
                print(f"{season}: no se pudo descargar team stats ({exc}); se omite temporada")
                continue

        # PBP is required for longest-play and down-conversion fields.
        # Stop the build instead of publishing misleading zeroes if it is unavailable.
        pbp_summaries = load_pbp_summaries(season)

        reg = build_type(season, "REG", schedule_rows, weekly_rows, pbp_summaries["REG"])
        post = build_type(season, "POST", schedule_rows, weekly_rows, pbp_summaries["POST"])
        output["seasons"][str(season)] = {
            "teams": reg["teams"], "games": reg["games"],
            "types": {"REG": reg, "POST": post},
            "advancedAvailable": reg["advancedAvailable"],
        }
    os.makedirs("data", exist_ok=True)
    tmp = "data/nfl.json.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, "data/nfl.json")
    print(f"Listo: {len(output['seasons'])} temporadas escritas en data/nfl.json")

if __name__ == "__main__":
    main()
