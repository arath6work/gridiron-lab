import csv, io, json, os, urllib.request, datetime, gzip

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
    req = urllib.request.Request(url, headers={'User-Agent':'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    if compressed or url.endswith('.gz'):
        raw = gzip.decompress(raw)
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace'))))

def num(row, key):
    try:
        v = row.get(key, '')
        return float(v) if v not in ('', None, 'NA', 'nan', 'NaN') else 0.0
    except (ValueError, TypeError):
        return 0.0

def played_score(v):
    return v not in ('', None, 'NA', 'nan', 'NaN')

def main():
    schedules = read_csv(f'{BASE}/schedules/games.csv')
    output = {'source':'nflverse','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'firstSeason':FIRST_SEASON, 'seasons':{}}
    for season in SEASONS:
        all_games = [g for g in schedules if str(g.get('season','')) == str(season)]
        # Include regular season and postseason; preserve game_type for filtering.
       
        season_teams = sorted({
            team
            for g in all_games
            for team in (g.get('away_team', ''), g.get('home_team', ''))
            if team in TEAM_INFO
        })

        stats = {
            abbr: {
                'abbr': abbr,
                'name': TEAM_INFO[abbr][0],
                'conf': TEAM_INFO[abbr][1],
                'div': TEAM_INFO[abbr][2],
                'gp': 0, 'w': 0, 'l': 0, 't': 0,
                'points': 0, 'pointsAllowed': 0,
                'pass': 0, 'rush': 0,
                'passAllowed': 0, 'rushAllowed': 0,
                'epa': 0, 'plays': 0,
                'successPlays': 0, 'epaPlays': 0,
                'turnovers': 0
            }
            for abbr in season_teams
        }

        cooked_games=[]
        for g in all_games:
            away, home = g.get('away_team',''), g.get('home_team','')
            if away not in stats or home not in stats: continue
            week = int(num(g,'week'))
            ascore, hscore = g.get('away_score',''), g.get('home_score','')
            has_score = played_score(ascore) and played_score(hscore)
            ap, hp = (int(num(g,'away_score')),int(num(g,'home_score'))) if has_score else (None,None)
            game_type = g.get('game_type','REG') or 'REG'
            status = 'FINAL' if has_score else 'PROGRAMADO'
            cooked_games.append({'season':season,'week':week,'gameType':game_type,'away':away,'awayName':stats[away]['name'],'awayPts':ap,'home':home,'homeName':stats[home]['name'],'homePts':hp,'status':status,'gameday':g.get('gameday',''),'gameId':g.get('game_id','')})
            if has_score and game_type == 'REG':
                for abbr in (away,home): stats[abbr]['gp'] += 1
                stats[away]['points'] += ap; stats[away]['pointsAllowed'] += hp
                stats[home]['points'] += hp; stats[home]['pointsAllowed'] += ap
                if ap > hp: stats[away]['w'] += 1; stats[home]['l'] += 1
                elif hp > ap: stats[home]['w'] += 1; stats[away]['l'] += 1
                else: stats[away]['t'] += 1; stats[home]['t'] += 1
        pbp_loaded = False
        # Historical play-by-play is available from 1999 in the source; try compressed first.
        pbp_urls = [f'{BASE}/pbp/play_by_play_{season}.csv.gz', f'{BASE}/pbp/play_by_play_{season}.csv']
        for url in pbp_urls:
            try:
                pbp = read_csv(url, compressed=url.endswith('.gz'))
                pbp_loaded = True
                break
            except Exception:
                pbp = []
        for p in pbp:
            if str(p.get('season','')) != str(season): continue
            offense, defense = p.get('posteam',''), p.get('defteam','')
            if offense not in stats or defense not in stats: continue
            if p.get('play_type') not in ('pass','run') and num(p,'pass_attempt') == 0 and num(p,'rush_attempt') == 0: continue
            py, ry = num(p,'passing_yards'), num(p,'rushing_yards')
            stats[offense]['pass'] += py; stats[offense]['rush'] += ry
            stats[defense]['passAllowed'] += py; stats[defense]['rushAllowed'] += ry
            epa = p.get('epa','')
            if epa not in ('',None,'NA','nan','NaN'):
                ev = num(p,'epa'); stats[offense]['epa'] += ev; stats[offense]['epaPlays'] += 1
            stats[offense]['plays'] += 1
            if num(p,'success') == 1: stats[offense]['successPlays'] += 1
            if num(p,'interception') == 1 or num(p,'fumble_lost') == 1: stats[offense]['turnovers'] += 1
        teams=[]
        for t in stats.values():
            t['totalYards']=t['pass']+t['rush']; t['yardsAllowed']=t['passAllowed']+t['rushAllowed']
            t['pct']=(t['w']+0.5*t['t'])/t['gp'] if t['gp'] else 0
            t['pointsPerGame']=t['points']/t['gp'] if t['gp'] else 0
            t['pointsAllowedPerGame']=t['pointsAllowed']/t['gp'] if t['gp'] else 0
            t['yardsPerGame']=t['totalYards']/t['gp'] if t['gp'] else 0
            t['yardsAllowedPerGame']=t['yardsAllowed']/t['gp'] if t['gp'] else 0
            t['epaPerPlay']=t['epa']/t['epaPlays'] if t['epaPlays'] else None
            t['successRate']=t['successPlays']/t['plays'] if t['plays'] else None
            t['advancedAvailable']=pbp_loaded
            t['diff']=t['points']-t['pointsAllowed']
            for k in ('points','pointsAllowed','pass','rush','passAllowed','rushAllowed','totalYards','yardsAllowed','diff','pointsPerGame','pointsAllowedPerGame','yardsPerGame','yardsAllowedPerGame','epa','epaPerPlay','successRate','pct'):
                if isinstance(t.get(k),(int,float)): t[k]=round(t[k],3)
            teams.append(t)
        output['seasons'][str(season)]={'teams':teams,'games':sorted(cooked_games,key=lambda x:(x['week'],x['gameday'],x['away'])),'advancedAvailable':pbp_loaded}
        print(f'{season}: {len(cooked_games)} partidos; play-by-play: {"sí" if pbp_loaded else "no disponible"}')
    os.makedirs('data',exist_ok=True)
    tmp='data/nfl.json.tmp'
    with open(tmp,'w',encoding='utf-8') as f: json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    os.replace(tmp,'data/nfl.json')
    print(f'Escrito data/nfl.json con {len(output["seasons"])} temporadas')

if __name__ == '__main__': main()
