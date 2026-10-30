#!/usr/bin/env python3
"""Build data/nfl.json from nflverse's processed weekly team-stat releases.

The frontend contract remains unchanged: seasons -> types -> REG/POST -> teams/games.
Team production comes from stats_team_week_<season>.csv, not a local PBP re-calculation.
"""
import csv
import datetime as dt
import io
import json
import os
import urllib.request
from collections import defaultdict

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FIRST_SEASON = 1999
CURRENT = dt.datetime.now(dt.timezone.utc).year

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
        "passTD": 0, "passInt": 0, "passAvg": 0, "passPct": 0,
        "passPerGame": 0, "passNetPerGame": 0,
        "rush": 0, "rushAtt": 0, "rushTD": 0, "rushAvg": 0,
        "rushPerGame": 0, "receiving": 0, "receptions": 0,
        "receivingTD": 0, "receivingAvg": 0, "receivingPerGame": 0,
        "totalYards": 0, "yardsPerGame": 0,
        "passAllowed": 0, "passAllowedNet": 0, "passAttAllowed": 0,
        "passCompAllowed": 0, "passTDAllowed": 0, "passIntAllowed": 0,
        "passAvgAllowed": 0, "passPctAllowed": 0, "passAllowedPerGame": 0,
        "rushAllowed": 0, "rushAttAllowed": 0, "rushTDAllowed": 0,
        "rushAvgAllowed": 0, "rushAllowedPerGame": 0,
        "receivingAllowed": 0, "receptionsAllowed": 0,
        "receivingTDAllowed": 0, "receivingAvgAllowed": 0,
        "receivingAllowedPerGame": 0,
        "yardsAllowed": 0, "yardsAllowedPerGame": 0,
        "sacksAllowed": 0, "sackYardsAllowed": 0,
        "interceptions": 0, "fumblesLost": 0, "turnovers": 0,
        "epa": 0, "epaPerPlay": None, "plays": 0,
        "successPlays": 0, "successRate": None, "epaPlays": 0,
        "thirdDownAtt": 0, "thirdDownConv": 0, "thirdDownRate": 0,
        "thirdDownAttAllowed": 0, "thirdDownConvAllowed": 0,
        "thirdDownRateAllowed": 0, "firstDowns": 0,
        "firstDownsAllowed": 0, "penalties": 0, "penaltyYards": 0,
        "penaltiesAllowed": 0, "penaltyYardsAllowed": 0,
        "sacks": 0, "sacksAllowed": 0, "receivingFumbles": 0,
        "receivingFumblesLost": 0, "rushFumbles": 0, "rushFumblesLost": 0,
        "advancedAvailable": True,
    }

def build_type(season, kind, schedule_rows, weekly_rows):
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
        t["passPct"] = 100 * t["passComp"] / t["passAtt"] if t["passAtt"] else 0
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
        t["interceptions"] = summed(own_rows, "def_interceptions")
        t["fumblesLost"] = summed(own_rows, "fumble_recovery_opp")
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
        t["passPctAllowed"] = 100 * t["passCompAllowed"] / t["passAttAllowed"] if t["passAttAllowed"] else 0
        t["rushAvgAllowed"] = t["rushAllowed"] / t["rushAttAllowed"] if t["rushAttAllowed"] else 0
        t["yardsPerGame"] = t["totalYards"] / gp if gp else 0
        t["yardsAllowedPerGame"] = t["yardsAllowed"] / gp if gp else 0
        t["thirdDownRate"] = 100 * t["thirdDownConv"] / t["thirdDownAtt"] if t["thirdDownAtt"] else 0
        t["thirdDownRateAllowed"] = 100 * t["thirdDownConvAllowed"] / t["thirdDownAttAllowed"] if t["thirdDownAttAllowed"] else 0
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

        reg = build_type(season, "REG", schedule_rows, weekly_rows)
        post = build_type(season, "POST", schedule_rows, weekly_rows)
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
