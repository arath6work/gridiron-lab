import csv, io, json, os, urllib.request, datetime

BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
CURRENT = datetime.datetime.now(datetime.timezone.utc).year
SEASONS = [CURRENT, CURRENT - 1]

TEAM_INFO = {
 'ARI':('Arizona Cardinals','NFC','NFC West'),'ATL':('Atlanta Falcons','NFC','NFC South'),'BAL':('Baltimore Ravens','AFC','AFC North'),'BUF':('Buffalo Bills','AFC','AFC East'),
 'CAR':('Carolina Panthers','NFC','NFC South'),'CHI':('Chicago Bears','NFC','NFC North'),'CIN':('Cincinnati Bengals','AFC','AFC North'),'CLE':('Cleveland Browns','AFC','AFC North'),
 'DAL':('Dallas Cowboys','NFC','NFC East'),'DEN':('Denver Broncos','AFC','AFC West'),'DET':('Detroit Lions','NFC','NFC North'),'GB':('Green Bay Packers','NFC','NFC North'),
 'HOU':('Houston Texans','AFC','AFC South'),'IND':('Indianapolis Colts','AFC','AFC South'),'JAX':('Jacksonville Jaguars','AFC','AFC South'),'KC':('Kansas City Chiefs','AFC','AFC West'),
 'LA':('Los Angeles Rams','NFC','NFC West'),'LAC':('Los Angeles Chargers','AFC','AFC West'),'LV':('Las Vegas Raiders','AFC','AFC West'),'MIA':('Miami Dolphins','AFC','AFC East'),
 'MIN':('Minnesota Vikings','NFC','NFC North'),'NE':('New England Patriots','AFC','AFC East'),'NO':('New Orleans Saints','NFC','NFC South'),'NYG':('New York Giants','NFC','NFC East'),
 'NYJ':('New York Jets','AFC','AFC East'),'PHI':('Philadelphia Eagles','NFC','NFC East'),'PIT':('Pittsburgh Steelers','AFC','AFC North'),'SF':('San Francisco 49ers','NFC','NFC West'),
 'SEA':('Seattle Seahawks','NFC','NFC West'),'TB':('Tampa Bay Buccaneers','NFC','NFC South'),'TEN':('Tennessee Titans','AFC','AFC South'),'WAS':('Washington Commanders','NFC','NFC East')
}

def read_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent':'GridironLab/1.0'})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read().decode('utf-8-sig')
    return list(csv.DictReader(io.StringIO(raw)))

def num(row, key):
    try:
        v = row.get(key, '')
        return float(v) if v not in ('', None, 'NA', 'nan') else 0.0
    except (ValueError, TypeError):
        return 0.0

def main():
    schedules = read_csv(f'{BASE}/schedules/schedules.csv')
    output = {'source':'nflverse','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seasons':{}}
    for season in SEASONS:
        games = [g for g in schedules if str(g.get('season','')) == str(season) and g.get('game_type','REG') == 'REG']
        pbp = []
        try:
            pbp = read_csv(f'{BASE}/pbp/play_by_play_{season}.csv')
        except Exception as e:
            print(f'PBP {season} not available yet: {e}')
        stats = {abbr:{'abbr':abbr,'name':info[0],'conf':info[1],'div':info[2],'gp':0,'w':0,'l':0,'t':0,'points':0,'pointsAllowed':0,'pass':0,'rush':0,'passAllowed':0,'rushAllowed':0} for abbr,info in TEAM_INFO.items()}
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
            offense, defense = p.get('posteam',''), p.get('defteam','')
            if offense not in stats or defense not in stats: continue
            if p.get('play_type') not in ('pass','run') and num(p,'pass_attempt') == 0 and num(p,'rush_attempt') == 0: continue
            py = num(p,'passing_yards')
            ry = num(p,'rushing_yards')
            # PBP records passing/rushing yardage on the corresponding play.
            stats[offense]['pass'] += py
            stats[offense]['rush'] += ry
            stats[defense]['passAllowed'] += py
            stats[defense]['rushAllowed'] += ry
        teams=[]
        for t in stats.values():
            t['totalYards']=t['pass']+t['rush']; t['yardsAllowed']=t['passAllowed']+t['rushAllowed']
            t['pct']=(t['w']+0.5*t['t'])/t['gp'] if t['gp'] else 0
            t['diff']=t['points']-t['pointsAllowed']
            for k in ('points','pointsAllowed','pass','rush','passAllowed','rushAllowed','totalYards','yardsAllowed','diff'):
                t[k]=round(t[k],1)
            teams.append(t)
        output['seasons'][str(season)]={'teams':teams,'games':sorted(cooked_games,key=lambda x:(x['week'],x['gameday'],x['away']))}
    os.makedirs('data',exist_ok=True)
    with open('data/nfl.json','w',encoding='utf-8') as f: json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    print('Wrote data/nfl.json')
if __name__ == '__main__': main()
