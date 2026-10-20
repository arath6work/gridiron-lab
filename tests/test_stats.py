import importlib.util, os
spec=importlib.util.spec_from_file_location('stats',os.path.join(os.path.dirname(__file__), '..', 'scripts', 'update_nfl_data.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
schedules=[{'season':'2025','game_type':'REG','away_team':'ARI','home_team':'ATL','week':'1','away_score':'20','home_score':'10','gameday':'2025-09-07','game_id':'x'}]
pbp=[
 {'season':'2025','game_type':'REG','posteam':'ARI','defteam':'ATL','play_type':'pass','pass_attempt':'1','complete_pass':'1','passing_yards':'20','receiving_yards':'20','yards_gained':'20','pass_touchdown':'1','first_down':'1','first_down_pass':'1','down':'3','third_down_converted':'1'},
 {'season':'2025','game_type':'REG','posteam':'ARI','defteam':'ATL','play_type':'run','rush_attempt':'1','rushing_yards':'10','yards_gained':'10','first_down':'1','first_down_rush':'1','down':'1'},
 {'season':'2025','game_type':'REG','posteam':'ATL','defteam':'ARI','play_type':'pass','sack':'1','sack_yards':'5','yards_gained':'-5','down':'2'}]
r=m.build_type(2025,'REG',schedules,pbp)
a=next(t for t in r['teams'] if t['abbr']=='ARI'); b=next(t for t in r['teams'] if t['abbr']=='ATL')
assert a['totalYards']==30, a['totalYards']
assert a['firstDowns']==2 and a['firstDownPass']==1 and a['firstDownRush']==1, (a['firstDowns'],a['firstDownPass'],a['firstDownRush'])
assert b['passAllowedNet']==20 and b['yardsAllowed']==30, (b['passAllowedNet'],b['yardsAllowed'])
assert next(t for t in r['teams'] if t['abbr']=='ATL')['passAtt']==0
assert a['receiving']==20 and a['receiving'] != a['totalYards']
assert len(r['teams'])==2 and len(r['games'])==1
print('synthetic tests passed:', {'ARI_totalYards':a['totalYards'],'ARI_firstDowns':a['firstDowns'],'ATL_yardsAllowed':b['yardsAllowed']})
