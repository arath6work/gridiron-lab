#!/usr/bin/env python3
"""Build season/team statistics for Gridiron Lab from nflverse schedules and play-by-play."""
import csv, datetime, gzip, io, json, os, urllib.request

BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
CURRENT = datetime.datetime.now(datetime.timezone.utc).year
FIRST_SEASON = 1999
SEASONS = range(FIRST_SEASON, CURRENT + 1)
TEAM_INFO = {
 'ARI':('Arizona Cardinals','NFC','NFC West'),'ATL':('Atlanta Falcons','NFC','NFC South'),'BAL':('Baltimore Ravens','AFC','AFC North'),'BUF':('Buffalo Bills','AFC','AFC East'),
 'CAR':('Carolina Panthers','NFC','NFC South'),'CHI':('Chicago Bears','NFC','NFC North'),'CIN':('Cincinnati Bengals','AFC','AFC North'),'CLE':('Cleveland Browns','AFC','AFC North'),
 'DAL':('Dallas Cowboys','NFC','NFC East'),'DEN':('Denver Broncos','AFC','AFC West'),'DET':('Detroit Lions','NFC','NFC North'),'GB':('Green Bay Packers','NFC','NFC North'),
 'HOU':('Houston Texans','AFC','AFC South'),'IND':('Indianapolis Colts','AFC','AFC South'),'JAX':('Jacksonville Jaguars','AFC','AFC South'),'KC':('Kansas City Chiefs','AFC','AFC West'),
 'LA':('Los Angeles Rams','NFC','NFC West'),'LAR':('Los Angeles Rams','NFC','NFC West'),'STL':('St. Louis Rams','NFC','NFC West'),
 'LAC':('Los Angeles Chargers','AFC','AFC West'),'SD':('San Diego Chargers','AFC','AFC West'),'LV':('Las Vegas Raiders','AFC','AFC West'),'OAK':('Oakland Raiders','AFC','AFC West'),
 'MIA':('Miami Dolphins','AFC','AFC East'),'MIN':('Minnesota Vikings','NFC','NFC North'),'NE':('New England Patriots','AFC','AFC East'),'NO':('New Orleans Saints','NFC','NFC South'),
 'NYG':('New York Giants','NFC','NFC East'),'NYJ':('New York Jets','AFC','AFC East'),'PHI':('Philadelphia Eagles','NFC','NFC East'),'PIT':('Pittsburgh Steelers','AFC','AFC North'),
 'SF':('San Francisco 49ers','NFC','NFC West'),'SEA':('Seattle Seahawks','NFC','NFC West'),'TB':('Tampa Bay Buccaneers','NFC','NFC South'),
 'TEN':('Tennessee Titans','AFC','AFC South'),'WAS':('Washington Commanders','NFC','NFC East'),'WSH':('Washington Commanders','NFC','NFC East')
}
ALIASES = {'JAC':'JAX','JAX':'JAX','WSH':'WAS','OAK':'LV','SD':'LAC','STL':'LA','LAR':'LA'}

def read_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent':'GridironLab/2.0'})
    with urllib.request.urlopen(req, timeout=150) as r: raw = r.read()
    if url.endswith('.gz'): raw = gzip.decompress(raw)
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace'))))

def n(row, key):
    try:
        v = row.get(key, '')
        return float(v) if v not in ('', None, 'NA', 'nan', 'NaN') else 0.0
    except (ValueError, TypeError): return 0.0

def team_key(abbr):
    return ALIASES.get(abbr, abbr)

def fresh_team(abbr):
    name, conf, div = TEAM_INFO[abbr]
    t = {'abbr':abbr,'name':name,'conf':conf,'div':div,'gp':0,'w':0,'l':0,'t':0,'points':0,'pointsAllowed':0}
    for k in ('passAtt','passComp','pass','passTD','interceptions','sacksAllowed','sackYardsAllowed','passLong','rushAtt','rush','rushTD','rushLong','rushFumbles','rushFumblesLost','receiving','receptions','receivingTD','receivingLong','receivingFumbles','receivingFumblesLost','firstDowns','firstDownRush','firstDownPass','firstDownPenalty','thirdDownAtt','thirdDownConv','fourthDownAtt','fourthDownConv','penalties','penaltyYards','passAttAllowed','passCompAllowed','passAllowed','passTDAllowed','interceptionsMade','sacksMade','sacksMadeYards','passLongAllowed','rushAttAllowed','rushAllowed','rushTDAllowed','rushLongAllowed','rushFumblesAllowed','rushFumblesLostAllowed','receivingAllowed','receptionsAllowed','receivingTDAllowed','receivingLongAllowed','receivingFumblesAllowed','receivingFumblesLostAllowed','firstDownsAllowed','firstDownRushAllowed','firstDownPassAllowed','firstDownPenaltyAllowed','thirdDownAttAllowed','thirdDownConvAllowed','fourthDownAttAllowed','fourthDownConvAllowed','penaltiesAllowed','penaltyYardsAllowed'):
        t[k] = 0
    return t

def passer_rating(t):
    att, comp, yards, td, ints = (t['passAtt'], t['passComp'], t['pass'], t['passTD'], t['interceptions'])
    if not att: return None
    a=max(0,min(2.375,((comp/att)-.3)*5)); b=max(0,min(2.375,((yards/att)-3)*.25))
    c=max(0,min(2.375,(td/att)*20)); d=max(0,min(2.375,2.375-(ints/att)*25))
    return round(((a+b+c+d)/6)*100,1)

def build_type(season, game_type, schedules, pbp):
    games = [g for g in schedules if str(g.get('season','')) == str(season) and g.get('game_type') == game_type]
    team_ids = sorted({team_key(x) for g in games for x in (g.get('away_team',''),g.get('home_team','')) if team_key(x) in TEAM_INFO})
    stats = {abbr:fresh_team(abbr) for abbr in team_ids}
    cooked=[]
    for g in games:
        away, home = team_key(g.get('away_team','')), team_key(g.get('home_team',''))
        if away not in stats or home not in stats: continue
        week=int(n(g,'week')); av,hv=g.get('away_score',''),g.get('home_score','')
        played=av not in ('',None,'NA') and hv not in ('',None,'NA')
        ap,hp=(int(n(g,'away_score')),int(n(g,'home_score'))) if played else (None,None)
        cooked.append({'season':season,'gameType':game_type,'week':week,'away':away,'awayName':stats[away]['name'],'awayPts':ap,'home':home,'homeName':stats[home]['name'],'homePts':hp,'status':'FINAL' if played else 'PROGRAMADO','gameday':g.get('gameday',''),'gameId':g.get('game_id','')})
        if played:
            stats[away]['gp']+=1; stats[home]['gp']+=1
            stats[away]['points']+=ap; stats[away]['pointsAllowed']+=hp; stats[home]['points']+=hp; stats[home]['pointsAllowed']+=ap
            if ap>hp: stats[away]['w']+=1; stats[home]['l']+=1
            elif hp>ap: stats[home]['w']+=1; stats[away]['l']+=1
            else: stats[away]['t']+=1; stats[home]['t']+=1
    # Aggregate only matching game type; this prevents regular-season/playoff leakage.
    for p in pbp:
        if str(p.get('season','')) != str(season): continue
        ptype=p.get('game_type') or p.get('season_type') or 'REG'
        if ptype != game_type: continue
        off, deff=team_key(p.get('posteam','')),team_key(p.get('defteam',''))
        if off not in stats or deff not in stats: continue
        o,d=stats[off],stats[deff]
        is_pass=n(p,'pass_attempt')==1 or (p.get('play_type')=='pass' and n(p,'sack')!=1)
        is_rush=n(p,'rush_attempt')==1 or p.get('play_type')=='run'
        is_sack=n(p,'sack')==1
        if not (is_pass or is_rush or is_sack or n(p,'penalty')==1): continue
        py=n(p,'passing_yards'); ry=n(p,'rushing_yards'); sy=n(p,'sack_yards') or n(p,'yards_sacked')
        if is_pass:
            o['passAtt']+=1; d['passAttAllowed']=d.get('passAttAllowed',0)+1
            o['passComp']+=int(n(p,'complete_pass')==1); d['passCompAllowed']=d.get('passCompAllowed',0)+int(n(p,'complete_pass')==1)
            o['pass']+=py; d['passAllowed']=d.get('passAllowed',0)+py; d['passLongAllowed']=max(d.get('passLongAllowed',0),n(p,'yards_gained'))
            o['passTD']+=int(n(p,'pass_touchdown')==1); d['passTDAllowed']=d.get('passTDAllowed',0)+int(n(p,'pass_touchdown')==1)
            o['interceptions']+=int(n(p,'interception')==1); d['interceptionsMade']=d.get('interceptionsMade',0)+int(n(p,'interception')==1)
            o['passLong']=max(o['passLong'],n(p,'yards_gained'))
        if is_rush:
            o['rushAtt']+=1; o['rush']+=ry; d['rushAttAllowed']=d.get('rushAttAllowed',0)+1; d['rushAllowed']=d.get('rushAllowed',0)+ry; d['rushLongAllowed']=max(d.get('rushLongAllowed',0),ry or n(p,'yards_gained'))
            o['rushTD']+=int(n(p,'rush_touchdown')==1); d['rushTDAllowed']=d.get('rushTDAllowed',0)+int(n(p,'rush_touchdown')==1); o['rushLong']=max(o['rushLong'],ry or n(p,'yards_gained'))
            o['rushFumbles']+=int(n(p,'fumble')==1); o['rushFumblesLost']+=int(n(p,'fumble_lost')==1); d['rushFumblesAllowed']=d.get('rushFumblesAllowed',0)+int(n(p,'fumble')==1); d['rushFumblesLostAllowed']=d.get('rushFumblesLostAllowed',0)+int(n(p,'fumble_lost')==1)
        if is_sack:
            o['sacksAllowed']+=1; o['sackYardsAllowed']+=sy or max(0,-n(p,'yards_gained')); d['sacksMade']=d.get('sacksMade',0)+1; d['sacksMadeYards']=d.get('sacksMadeYards',0)+(sy or max(0,-n(p,'yards_gained')))
        # Receiving stats are tracked separately and never added to team total yards.
        if n(p,'complete_pass')==1:
            o['receptions']+=1; o['receiving']+=n(p,'receiving_yards')
            o['receivingTD']+=int(n(p,'pass_touchdown')==1)
            o['receivingLong']=max(o['receivingLong'],n(p,'receiving_yards'))
            o['receivingFumbles']+=int(n(p,'fumble')==1); o['receivingFumblesLost']+=int(n(p,'fumble_lost')==1)
            d['receptionsAllowed']=d.get('receptionsAllowed',0)+1; d['receivingAllowed']=d.get('receivingAllowed',0)+n(p,'receiving_yards')
            d['receivingTDAllowed']=d.get('receivingTDAllowed',0)+int(n(p,'pass_touchdown')==1); d['receivingLongAllowed']=max(d.get('receivingLongAllowed',0),n(p,'receiving_yards')); d['receivingFumblesAllowed']=d.get('receivingFumblesAllowed',0)+int(n(p,'fumble')==1); d['receivingFumblesLostAllowed']=d.get('receivingFumblesLostAllowed',0)+int(n(p,'fumble_lost')==1)
        if n(p,'first_down')==1: o['firstDowns']+=1; d['firstDownsAllowed']=d.get('firstDownsAllowed',0)+1
        o['firstDownRush']+=int(n(p,'first_down_rush')==1); d['firstDownRushAllowed']=d.get('firstDownRushAllowed',0)+int(n(p,'first_down_rush')==1)
        o['firstDownPass']+=int(n(p,'first_down_pass')==1); d['firstDownPassAllowed']=d.get('firstDownPassAllowed',0)+int(n(p,'first_down_pass')==1)
        o['firstDownPenalty']+=int(n(p,'first_down_penalty')==1); d['firstDownPenaltyAllowed']=d.get('firstDownPenaltyAllowed',0)+int(n(p,'first_down_penalty')==1)
        down=int(n(p,'down'))
        if down==3:
            o['thirdDownAtt']+=1; d['thirdDownAttAllowed']=d.get('thirdDownAttAllowed',0)+1
            converted=int(n(p,'third_down_converted')==1 or n(p,'first_down')==1)
            o['thirdDownConv']+=converted; d['thirdDownConvAllowed']=d.get('thirdDownConvAllowed',0)+converted
        if down==4:
            o['fourthDownAtt']+=1; d['fourthDownAttAllowed']=d.get('fourthDownAttAllowed',0)+1
            converted=int(n(p,'fourth_down_converted')==1 or n(p,'first_down')==1)
            o['fourthDownConv']+=converted; d['fourthDownConvAllowed']=d.get('fourthDownConvAllowed',0)+converted
        if n(p,'penalty')==1:
            o['penalties']+=1; o['penaltyYards']+=n(p,'penalty_yards')
            d['penaltiesAllowed']=d.get('penaltiesAllowed',0)+1; d['penaltyYardsAllowed']=d.get('penaltyYardsAllowed',0)+n(p,'penalty_yards')
    teams=[]
    for t in stats.values():
        # NFL team total offense uses net passing yards (gross pass yards minus sack yards) + rushing yards.
        t['passNet']=t['pass']-t['sackYardsAllowed']
        t['totalYards']=t['passNet']+t['rush']
        # Defensive net passing yards allowed = opponent gross passing yards minus sack yards by this defense.
        t['passAllowedNet']=t.get('passAllowed',0)-t.get('sacksMadeYards',0)
        t['yardsAllowed']=t['passAllowedNet']+t.get('rushAllowed',0)
        gp=t['gp']; t['pct']=(t['w']+.5*t['t'])/gp if gp else 0; t['diff']=t['points']-t['pointsAllowed']
        # Per-game values and rates are computed from their respective denominators.
        t['yardsPerGame']=t['totalYards']/gp if gp else 0
        t['passPerGame']=t['passNet']/gp if gp else 0; t['rushPerGame']=t['rush']/gp if gp else 0
        t['yardsAllowedPerGame']=t['yardsAllowed']/gp if gp else 0; t['passAllowedPerGame']=t['passAllowedNet']/gp if gp else 0
        t['rushAllowedPerGame']=t.get('rushAllowed',0)/gp if gp else 0
        t['receivingPerGame']=t['receiving']/gp if gp else 0; t['receivingAllowedPerGame']=t.get('receivingAllowed',0)/gp if gp else 0
        t['pointsPerGame']=t['points']/gp if gp else 0; t['pointsAllowedPerGame']=t['pointsAllowed']/gp if gp else 0
        t['passPct']=t['passComp']/t['passAtt'] if t['passAtt'] else 0
        t['passAvg']=t['pass']/t['passAtt'] if t['passAtt'] else 0
        t['rushAvg']=t['rush']/t['rushAtt'] if t['rushAtt'] else 0
        t['rushAvgAllowed']=t.get('rushAllowed',0)/t.get('rushAttAllowed',0) if t.get('rushAttAllowed',0) else 0
        t['receivingAvg']=t['receiving']/t['receptions'] if t['receptions'] else 0
        t['receivingAvgAllowed']=t.get('receivingAllowed',0)/t.get('receptionsAllowed',0) if t.get('receptionsAllowed',0) else 0
        t['thirdDownRate']=t['thirdDownConv']/t['thirdDownAtt'] if t['thirdDownAtt'] else 0
        t['fourthDownRate']=t['fourthDownConv']/t['fourthDownAtt'] if t['fourthDownAtt'] else 0
        t['thirdDownRateAllowed']=t.get('thirdDownConvAllowed',0)/t.get('thirdDownAttAllowed',0) if t.get('thirdDownAttAllowed',0) else 0
        t['fourthDownRateAllowed']=t.get('fourthDownConvAllowed',0)/t.get('fourthDownAttAllowed',0) if t.get('fourthDownAttAllowed',0) else 0
        t['passerRating']=passer_rating(t)
        t['passerRatingAllowed']=passer_rating({'passAtt':t['passAttAllowed'],'passComp':t['passCompAllowed'],'pass':t['passAllowed'],'passTD':t['passTDAllowed'],'interceptions':t['interceptionsMade']})
        for k,v in list(t.items()):
            if isinstance(v,float): t[k]=round(v,1)
        teams.append(t)
    return {'teams':teams,'games':sorted(cooked,key=lambda x:(x['week'],x['gameday'],x['away']))}

def main():
    schedules=read_csv(f'{BASE}/schedules/games.csv')
    output={'source':'nflverse','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seasons':{}}
    for season in SEASONS:
        try: pbp=read_csv(f'{BASE}/pbp/play_by_play_{season}.csv.gz')
        except Exception:
            try: pbp=read_csv(f'{BASE}/pbp/play_by_play_{season}.csv')
            except Exception as e: print(f'PBP {season} unavailable: {e}'); pbp=[]
        regular=build_type(season,'REG',schedules,pbp)
        playoffs=build_type(season,'POST',schedules,pbp)
        # Keep legacy top-level REG fields for compatibility with existing UI.
        output['seasons'][str(season)]={**regular,'types':{'REG':regular,'POST':playoffs}}
        print(f"{season}: REG {len(regular['teams'])} teams / {len(regular['games'])} games; POST {len(playoffs['teams'])} teams / {len(playoffs['games'])} games")
    os.makedirs('data',exist_ok=True)
    with open('data/nfl.json','w',encoding='utf-8') as f: json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    print('Wrote data/nfl.json')
if __name__=='__main__': main()
