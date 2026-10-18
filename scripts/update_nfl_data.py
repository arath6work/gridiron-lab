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

def read_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent':'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r: raw = r.read()
    if url.endswith('.gz'): raw = gzip.decompress(raw)
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace'))))

def num(row, key):
    try:
        v = row.get(key, '')
        return float(v) if v not in ('', None, 'NA', 'nan') else 0.0
    except (ValueError, TypeError):
        return 0.0

def main():
    schedules = read_csv(f'{BASE}/schedules/games.csv')
    output = {'source':'nflverse','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seasons':{}}
    for season in SEASONS:
        games = [g for g in schedules if str(g.get('season','')) == str(season) and g.get('game_type','REG') == 'REG']
        pbp = []
        try:
            pbp = read_csv(f'{BASE}/pbp/play_by_play_{season}.csv')
        except Exception as e:
            print(f'PBP {season} not available yet: {e}')
        season_teams = sorted({team for g in games for team in (g.get('away_team',''), g.get('home_team','')) if team in TEAM_INFO})
        stats = {abbr:{'abbr':abbr,'name':TEAM_INFO[abbr][0],'conf':TEAM_INFO[abbr][1],'div':TEAM_INFO[abbr][2],
          'gp':0,'w':0,'l':0,'t':0,'points':0,'pointsAllowed':0,'pass':0,'rush':0,'passAllowed':0,'rushAllowed':0,
          'receiving':0,'receivingAllowed':0,'thirdDownAtt':0,'thirdDownConv':0,'thirdDownAttAllowed':0,'thirdDownConvAllowed':0,
          'firstDowns':0,'firstDownsAllowed':0,'sacks':0,'sacksAllowed':0} for abbr in season_teams}
        cooked_games=[]
        for g in games:
            away, home = g.get('away_team',''), g.get('home_team','')
            if away not in stats or home not in stats: continue
            week = int(num(g,'week'))
            ascore, hscore = g.get('away_score',''), g.get('home_score','')
            played = ascore not in ('',None,'NA') and hscore not in ('',None,'NA')
            ap, hp = (int(num(g,'away_score')),int(num(g,'home_score'))) if played else (None,None)
            status = 'FINAL' if played else 'PROGRAMADO'
            cooked_games.append({'season':season,'week':week,'away':away,'awayName':stats[away]['name'],'awayPts':ap,'home':home,'homeName':stats[home]['name'],'homePts':hp,'status':status,'gameday':g.get('gameday',''),'gameId':g.get('game_id','')})
            if played:
                for abbr in (away,home): stats[abbr]['gp'] += 1
                stats[away]['points'] += ap; stats[away]['pointsAllowed'] += hp
                stats[home]['points'] += hp; stats[home]['pointsAllowed'] += ap
                if ap > hp: stats[away]['w'] += 1; stats[home]['l'] += 1
                elif hp > ap: stats[home]['w'] += 1; stats[away]['l'] += 1
                else: stats[away]['t'] += 1; stats[home]['t'] += 1
        for p in pbp:
            if str(p.get('season','')) != str(season): continue
            if p.get('game_type') not in ('REG', '', None): continue
            offense, defense = p.get('posteam',''), p.get('defteam','')
            if offense not in stats or defense not in stats: continue
            if p.get('play_type') not in ('pass','run') and num(p,'pass_attempt') == 0 and num(p,'rush_attempt') == 0 and num(p,'sack') == 0: continue
            py = num(p,'passing_yards')
            # nflverse sack_yards is generally negative; sack_yards_lost, when present, is positive.
            if p.get('sack_yards_lost') not in ('', None, 'NA', 'nan'):
                sack_loss = abs(num(p,'sack_yards_lost'))
            else:
                sack_loss = abs(min(0, num(p,'sack_yards')))
            net_py = py - sack_loss
            ry = num(p,'rushing_yards')
            stats[offense]['pass'] += net_py
            stats[offense]['rush'] += ry
            stats[defense]['passAllowed'] += net_py
            stats[defense]['rushAllowed'] += ry
            stats[offense]['receiving'] += num(p,'receiving_yards')
            stats[defense]['receivingAllowed'] += num(p,'receiving_yards')
            if num(p,'first_down') == 1:
                stats[offense]['firstDowns'] += 1; stats[defense]['firstDownsAllowed'] += 1
            if num(p,'third_down') == 1 or num(p,'down') == 3:
                stats[offense]['thirdDownAtt'] += 1; stats[defense]['thirdDownAttAllowed'] += 1
                if num(p,'first_down') == 1:
                    stats[offense]['thirdDownConv'] += 1; stats[defense]['thirdDownConvAllowed'] += 1
            if num(p,'sack') == 1:
                stats[defense]['sacks'] += 1; stats[offense]['sacksAllowed'] += 1
        teams=[]
        for t in stats.values():
            t['totalYards']=t['pass']+t['rush']; t['yardsAllowed']=t['passAllowed']+t['rushAllowed']
            t['pct']=(t['w']+0.5*t['t'])/t['gp'] if t['gp'] else 0
            t['diff']=t['points']-t['pointsAllowed']
            t['receivingPerGame']=t['receiving']/t['gp'] if t['gp'] else 0
            t['passPerGame']=t['pass']/t['gp'] if t['gp'] else 0
            t['rushPerGame']=t['rush']/t['gp'] if t['gp'] else 0
            t['passAllowedPerGame']=t['passAllowed']/t['gp'] if t['gp'] else 0
            t['rushAllowedPerGame']=t['rushAllowed']/t['gp'] if t['gp'] else 0
            t['firstDowns']=int(t['firstDowns']); t['firstDownsAllowed']=int(t['firstDownsAllowed'])
            t['thirdDownRate']=t['thirdDownConv']/t['thirdDownAtt'] if t['thirdDownAtt'] else None
            t['thirdDownRateAllowed']=t['thirdDownConvAllowed']/t['thirdDownAttAllowed'] if t['thirdDownAttAllowed'] else None
            for k in ('points','pointsAllowed','pass','rush','passAllowed','rushAllowed','receiving','receivingAllowed','totalYards','yardsAllowed','diff','thirdDownRate','thirdDownRateAllowed'):
                if isinstance(t[k], (int, float)):
    t[k] = round(t[k], 1)
            teams.append(t)
        output['seasons'][str(season)]={'teams':teams,'games':sorted(cooked_games,key=lambda x:(x['week'],x['gameday'],x['away']))}
    os.makedirs('data',exist_ok=True)
    with open('data/nfl.json','w',encoding='utf-8') as f: json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    print('Wrote data/nfl.json')
if __name__ == '__main__': main()
