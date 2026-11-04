const $ = s => document.querySelector(s);
const fmt = n => Math.round(Number(n)||0).toLocaleString('es-MX');
let allData = null;
let teams = [];
let games = [];
let offenseChart = null;
const tableSort = { offense: { key: 'totalYards', dir: 'desc' }, defense: { key: 'yardsAllowed', dir: 'asc' }, standings: { key: 'pct', dir: 'desc' } };
let standingsView = 'league';
let standingsSubfilter = 'all';
let statsMode = 'offense';
let standingsRecords = {};
const divisions = ['AFC East','AFC North','AFC South','AFC West','NFC East','NFC North','NFC South','NFC West'];
function newestSeason(){
 const seasons=Object.keys(allData?.seasons||{}).sort((a,b)=>Number(b)-Number(a));
 return seasons.find(s=>(allData.seasons[s].games||[]).length>0)||seasons[0]||'';
}
function sortValue(team,key){
 const gp=Number(team.gp)||0;
 const values={totalYards:team.totalYards, yardsPerGame:gp?team.totalYards/gp:0, pass:team.pass, passPerGame:team.passPerGame, rush:team.rush, rushPerGame:team.rushPerGame, receiving:team.receiving, receivingPerGame:team.receivingPerGame, points:team.points, pointsPerGame:gp?team.points/gp:0, yardsAllowed:team.yardsAllowed, yardsAllowedPerGame:gp?team.yardsAllowed/gp:0, passAllowed:team.passAllowed, passAllowedPerGame:team.passAllowedPerGame, rushAllowed:team.rushAllowed, rushAllowedPerGame:team.rushAllowedPerGame, receivingAllowed:team.receivingAllowed, receivingAllowedPerGame:team.receivingAllowedPerGame, pointsAllowed:team.pointsAllowed, pointsAllowedPerGame:gp?team.pointsAllowed/gp:0, sacks:team.sacks, sacksAllowed:team.sacksAllowed, firstDowns:team.firstDowns, firstDownsAllowed:team.firstDownsAllowed, thirdDownConv:team.thirdDownConv, thirdDownAtt:team.thirdDownAtt, thirdDownRate:team.thirdDownRate, thirdDownConvAllowed:team.thirdDownConvAllowed, thirdDownAttAllowed:team.thirdDownAttAllowed, thirdDownRateAllowed:team.thirdDownRateAllowed, gp:team.gp, pct:pct(team), w:team.w, l:team.l, t:team.t, diff:team.diff, div:team.div, name:team.name, local:team.standingRecords?.local?.pct||0, visitor:team.standingRecords?.visitor?.pct||0, division:team.standingRecords?.division?.pct||0, conference:team.standingRecords?.conference?.pct||0, interconference:team.standingRecords?.interconference?.pct||0};
 return values[key]??team[key]??0;
}
function sortedTeams(list,kind){const s=tableSort[kind];return [...list].sort((a,b)=>{const av=sortValue(a,s.key),bv=sortValue(b,s.key);const cmp=typeof av==='string'?String(av).localeCompare(String(bv)):((Number(av)||0)-(Number(bv)||0));return (s.dir==='asc'?cmp:-cmp)||String(a.name).localeCompare(String(b.name));});}
function setupSortableHeaders(){document.querySelectorAll('th[data-sort-table][data-sort-key]').forEach(th=>{th.tabIndex=0;th.setAttribute('role','button');th.title='Pulsa para ordenar';const run=()=>{const kind=th.dataset.sortTable,key=th.dataset.sortKey,s=tableSort[kind];if(!s)return;if(s.key===key)s.dir=s.dir==='desc'?'asc':'desc';else{s.key=key;s.dir=kind==='defense'?'asc':'desc';}renderSortable(kind);};th.addEventListener('click',run);th.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run();}});});}
function renderSortable(kind){if(kind==='offense')renderOffense();if(kind==='defense')renderDefense();if(kind==='standings')renderStandings();document.querySelectorAll(`th[data-sort-table="${kind}"][data-sort-key]`).forEach(th=>{const s=tableSort[kind];th.classList.toggle('sort-active',th.dataset.sortKey===s.key);const base=th.dataset.label||th.textContent.replace(/[ ↑↓↕]+$/,'');th.dataset.label=base;th.textContent=base+(th.dataset.sortKey===s.key?(s.dir==='asc'?' ↑':' ↓'):' ↕');});
 const tableIds={standings:'#standings-head',offense:'#view-estadisticas #stats-offense-panel thead',defense:'#view-estadisticas #stats-defense-panel thead'};
 const tableHead=document.querySelector(tableIds[kind]);
 if(tableHead){const active=[...tableHead.querySelectorAll('th[data-sort-key]')].find(th=>th.dataset.sortKey===tableSort[kind].key);const idx=active?active.cellIndex:-1;const table=tableHead.closest('table');if(table){table.querySelectorAll('tr').forEach(tr=>[...tr.cells].forEach((cell,i)=>cell.classList.toggle('sorted-column',idx>=0&&i===idx)));}}
}
const views = {
  overview:["El juego, en números.","Estadísticas, tendencias y contexto para cada enfrentamiento."],
  partidos:["Partidos","Resultados, calendario y registros de cada juego."],
  estadisticas:["Estadísticas de equipo","Compara la producción ofensiva y defensiva de los 32 equipos."],
  tabla:["Posiciones","Clasificación general, por conferencia y por división."],
  playoffs:["Playoff Picture","Panorama de clasificación rumbo a la postemporada."]
};
function teamName(abbr){return teams.find(t=>t.abbr===abbr)?.name || abbr}
function pct(t){
 const w=Number(t.w)||0, l=Number(t.l)||0, ties=Number(t.t)||0;
 const gp=w+l+ties;
 return gp?(w+0.5*ties)/gp:0;
}
function sortGames(list){return [...list].sort((a,b)=>(b.week-a.week)||String(b.gameday||'').localeCompare(String(a.gameday||'')))}
function gameRow(g,compact=false){
 const score = g.status === 'FINAL' && g.awayPts != null && g.homePts != null ? `${g.awayPts} — ${g.homePts}` : '—';
 const status = g.status === 'FINAL' ? 'FINAL' : (g.status || 'PROGRAMADO');
 return compact
  ? `<tr class="game-clickable" data-game-id="${g.gameId||''}" tabindex="0" role="button" aria-label="Ver estadísticas ${g.awayName} contra ${g.homeName}"><td>W${g.week}</td><td class="team-cell">${g.awayName} <span class="muted">(${g.away})</span></td><td class="score">${score}</td><td class="team-cell">${g.homeName} <span class="muted">(${g.home})</span></td><td><span class="${status==='FINAL'?'status-final':'muted'}">${status}</span></td></tr>`
  : `<tr class="game-clickable" data-game-id="${g.gameId||''}" tabindex="0" role="button" aria-label="Ver estadísticas ${g.awayName} contra ${g.homeName}"><td>W${g.week}</td><td class="team-cell">${g.awayName} <span class="muted">(${g.away})</span></td><td class="score">${g.awayPts ?? '—'}</td><td>@</td><td class="score">${g.homePts ?? '—'}</td><td class="team-cell">${g.homeName} <span class="muted">(${g.home})</span></td><td><span class="${status==='FINAL'?'status-final':'muted'}">${status}</span></td></tr>`;
}
function renderGames(){
 const search=($('#game-search')?.value||'').toLowerCase();
 const week=$('#week-filter')?.value||'all';
 const filtered=sortGames(games).filter(g=>(week==='all'||String(g.week)===week)&&`${g.away} ${g.home} ${g.awayName} ${g.homeName}`.toLowerCase().includes(search));
 $('#games-table').innerHTML=filtered.map(g=>gameRow(g)).join('')||'<tr><td colspan="7">No hay partidos para esos filtros.</td></tr>';
 $('#recent-games').innerHTML=sortGames(games).slice(0,5).map(g=>gameRow(g,true)).join('')||'<tr><td colspan="5">Todavía no hay partidos disponibles.</td></tr>';
}
function renderOffense(){
 const q=($('#offense-search')?.value||'').toLowerCase(), mode=$('#offense-mode')?.value||'total';
 const columns={
  total:[['GP','gp'],['TOTAL YDS','totalYards'],['YDS/G','yardsPerGame'],['PASSING YDS','passNet'],['YDS/G','passPerGame'],['RUSHING YDS','rush'],['YDS/G','rushPerGame'],['PTS','points'],['PTS/G','pointsPerGame']],
  pass:[['GP','gp'],['CMP','passComp'],['ATT','passAtt'],['CMP%','passPct'],['YDS','passNet'],['AVG','passAvg'],['YDS/G','passPerGame'],['LNG','passLong'],['TD','passTD'],['INT','interceptions'],['SACK','sacksAllowed'],['SYL','sackYardsAllowed'],['RTG','passerRating']],
  rush:[['GP','gp'],['ATT','rushAtt'],['YDS','rush'],['AVG','rushAvg'],['YDS/G','rushPerGame'],['LNG','rushLong'],['TD','rushTD'],['FUM','rushFumbles'],['LST','rushFumblesLost']],
  receiving:[['GP','gp'],['REC','receptions'],['YDS','receiving'],['AVG','receivingAvg'],['YDS/G','receivingPerGame'],['LNG','receivingLong'],['TD','receivingTD'],['FUM','receivingFumbles'],['LST','receivingFumblesLost']],
  downs:[['GP','gp'],['1ST DOWNS','firstDowns'],['RUSH','firstDownRush'],['PASS','firstDownPass'],['PEN','firstDownPenalty'],['3RD MD','thirdDownConv'],['3RD ATT','thirdDownAtt'],['3RD %','thirdDownRate'],['4TH MD','fourthDownConv'],['4TH ATT','fourthDownAtt'],['4TH %','fourthDownRate'],['PEN','penalties'],['PEN YDS','penaltyYards']]
 };
 const cols=columns[mode]||columns.total, list=sortedTeams(teams.filter(t=>(t.name+' '+t.abbr).toLowerCase().includes(q)),'offense');
 const table=$('#offense-table'); table.closest('table').querySelector('thead tr').innerHTML='<th>#</th><th>EQUIPO</th>'+cols.map(([label,key])=>`<th data-sort-table="offense" data-sort-key="${key}">${label} ↕</th>`).join('');
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${t.name} <span class="muted">${t.abbr}</span></button></td>`+cols.map(([label,key])=>{const v=t[key];let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPct'?(Number(v)*100).toFixed(1)+'%':(['passAvg','rushAvg','receivingAvg','passerRating','yardsPerGame','passPerGame','rushPerGame','receivingPerGame','pointsPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
}
function renderDefense(){
 const q=($('#defense-search')?.value||'').toLowerCase(), mode=$('#defense-mode')?.value||'total';
 const columns={
  total:[['GP','gp'],['TOTAL YDS PERMITIDAS','yardsAllowed'],['YDS/G','yardsAllowedPerGame'],['PASSING YDS','passAllowedNet'],['YDS/G','passAllowedPerGame'],['RUSHING YDS','rushAllowed'],['YDS/G','rushAllowedPerGame'],['PTS','pointsAllowed'],['PTS/G','pointsAllowedPerGame']],
  pass:[['GP','gp'],['CMP PERMITIDAS','passCompAllowed'],['ATT','passAttAllowed'],['CMP%','passPctAllowed'],['YDS','passAllowedNet'],['AVG','passAvgAllowed'],['YDS/G','passAllowedPerGame'],['LNG','passLongAllowed'],['TD','passTDAllowed'],['INT','interceptionsMade'],['SACK','sacksMade'],['SYL','sacksMadeYards'],['RTG','passerRatingAllowed']],
  rush:[['GP','gp'],['ATT','rushAttAllowed'],['YDS','rushAllowed'],['AVG','rushAvgAllowed'],['YDS/G','rushAllowedPerGame'],['LNG','rushLongAllowed'],['TD','rushTDAllowed'],['FUM','rushFumblesAllowed'],['LST','rushFumblesLostAllowed']],
  receiving:[['GP','gp'],['REC','receptionsAllowed'],['YDS','receivingAllowed'],['AVG','receivingAvgAllowed'],['YDS/G','receivingAllowedPerGame'],['LNG','receivingLongAllowed'],['TD','receivingTDAllowed'],['FUM','receivingFumblesAllowed'],['LST','receivingFumblesLostAllowed']],
  downs:[['GP','gp'],['1ST DOWNS PERMITIDOS','firstDownsAllowed'],['RUSH','firstDownRushAllowed'],['PASS','firstDownPassAllowed'],['PEN','firstDownPenaltyAllowed'],['3RD MD','thirdDownConvAllowed'],['3RD ATT','thirdDownAttAllowed'],['3RD %','thirdDownRateAllowed'],['4TH MD','fourthDownConvAllowed'],['4TH ATT','fourthDownAttAllowed'],['4TH %','fourthDownRateAllowed'],['PEN','penaltiesAllowed'],['PEN YDS','penaltyYardsAllowed']]
 };
 const cols=columns[mode]||columns.total, list=sortedTeams(teams.filter(t=>(t.name+' '+t.abbr).toLowerCase().includes(q)),'defense');
 const table=$('#defense-table'); table.closest('table').querySelector('thead tr').innerHTML='<th>#</th><th>EQUIPO</th>'+cols.map(([label,key])=>`<th data-sort-table="defense" data-sort-key="${key}">${label} ↕</th>`).join('');
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${t.name} <span class="muted">${t.abbr}</span></button></td>`+cols.map(([label,key])=>{const v=t[key];let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPctAllowed'?(Number(v)*100).toFixed(1)+'%':(['passAvgAllowed','rushAvgAllowed','receivingAvgAllowed','passerRatingAllowed','yardsAllowedPerGame','passAllowedPerGame','rushAllowedPerGame','receivingAllowedPerGame','pointsAllowedPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
}
function ensureGameDetailModal(){
 if($('#game-detail-modal'))return;
 const style=document.createElement('style');
 style.textContent=`#game-detail-modal{position:fixed;inset:0;z-index:1000;background:rgba(3,9,14,.78);display:none;align-items:center;justify-content:center;padding:18px}#game-detail-modal.open{display:flex}#game-detail-modal .gd-card{width:min(980px,100%);max-height:90vh;overflow:auto;background:#111d27;color:#eaf0f4;border:1px solid #344654;border-radius:14px;padding:22px;box-shadow:0 20px 70px #0009}#game-detail-modal .gd-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}#game-detail-modal h2{margin:0 0 6px;font-size:clamp(20px,3vw,30px)}#game-detail-modal .gd-sub{color:#9eafbb;font-size:13px}#game-detail-modal button{cursor:pointer}#game-detail-modal .gd-close{border:1px solid #526675;background:#1a2a36;color:#fff;border-radius:8px;padding:8px 12px}#game-detail-modal .gd-score{font-size:24px;font-weight:800;color:#f0b323;margin:14px 0}#game-detail-modal .gd-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}#game-detail-modal .gd-tabs button{border:1px solid #415462;background:#1a2a36;color:#dce5eb;border-radius:8px;padding:8px 12px}#game-detail-modal .gd-tabs button.active{background:#f0b323;color:#101820;border-color:#f0b323}#game-detail-modal .gd-table{width:100%;border-collapse:collapse;font-size:13px}#game-detail-modal .gd-table th,#game-detail-modal .gd-table td{padding:10px 8px;border-bottom:1px solid #2a3a46;text-align:right}#game-detail-modal .gd-table th:first-child,#game-detail-modal .gd-table td:first-child{text-align:left}#game-detail-modal .gd-table th{color:#9eafbb;font-size:11px}#game-detail-modal .gd-team{color:#f0b323;background:none;border:0;padding:0;font:inherit;font-weight:700;text-align:left}#game-detail-modal .gd-history-row{cursor:pointer}#game-detail-modal .gd-history-row:hover,.game-clickable:hover{background:rgba(240,179,35,.08)}.game-clickable{cursor:pointer}.game-clickable:focus{outline:2px solid #f0b323;outline-offset:-2px}`;
 style.textContent+=`\n/* Contraste del detalle de partido: evita que estilos globales claros se filtren al modal */\n#game-detail-modal .gd-card{background:#101c26;color:#edf3f7}\n#game-detail-modal .gd-table{background:#142431;color:#edf3f7;border-collapse:separate;border-spacing:0}\n#game-detail-modal .gd-table thead th{background:#243947!important;color:#f3f6f8!important;border-bottom:1px solid #526775!important}\n#game-detail-modal .gd-table tbody tr{background:#172936!important;color:#e8eff4!important}\n#game-detail-modal .gd-table tbody tr:nth-child(even){background:#1d303d!important}\n#game-detail-modal .gd-table tbody td{background:transparent!important;color:#e8eff4!important;border-bottom:1px solid #344956!important}\n#game-detail-modal .gd-table tbody td:first-child{color:#c6d2db!important;font-weight:600}\n#game-detail-modal .gd-table .gd-team{color:#ffc247!important}\n#game-detail-modal .gd-table .gd-team:hover{color:#ffda83!important;text-decoration:underline}\n#game-detail-modal .gd-sub{color:#b8c6d0!important}\n#game-detail-modal .gd-history-row:hover{background:#2a4050!important}\n#game-detail-modal .gd-tabs button{color:#e8eff4!important;background:#203441!important}\n#game-detail-modal .gd-tabs button.active{color:#17212a!important;background:#f0b323!important}\n#game-detail-modal .gd-close{color:#f4f7f9!important;background:#203441!important}\n#game-detail-modal .gd-score{color:#ffc247!important}\n`;
document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='game-detail-modal';modal.innerHTML=`<div class="gd-card" role="dialog" aria-modal="true" aria-labelledby="gd-title"><div class="gd-top"><div><h2 id="gd-title">Estadísticas del partido</h2><div class="gd-sub" id="gd-sub"></div></div><button class="gd-close" type="button" data-gd-close>Cerrar ✕</button></div><div id="gd-content"></div></div>`;
 modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-gd-close]'))closeGameDetail();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeGameDetail();});
 document.body.appendChild(modal);
}
function gdNum(v){return v==null?'—':fmt(v)}
function gdCompareTable(g){
 const a=g.awayStats||{},h=g.homeStats||{};
 const rows=[['Puntos',g.awayPts,g.homePts],['Pase neto (yds)',a.passNet,h.passNet],['Pase bruto (yds)',a.passGross,h.passGross],['Completos / intentos',`${gdNum(a.passComp)} / ${gdNum(a.passAtt)}`,`${gdNum(h.passComp)} / ${gdNum(h.passAtt)}`],['TD por pase',a.passTD,h.passTD],['Intercepciones',a.interceptions,h.interceptions],['Capturas permitidas',a.sacksAllowed,h.sacksAllowed],['Carrera (yds)',a.rush,h.rush],['Acarreos',a.rushAtt,h.rushAtt],['TD por carrera',a.rushTD,h.rushTD],['Recepciones',a.receptions,h.receptions],['Yardas recibidas',a.receiving,h.receiving],['TD por recepción',a.receivingTD,h.receivingTD],['Primeros downs',a.firstDowns,h.firstDowns],['3er down',`${gdNum(a.thirdDownConv)} / ${gdNum(a.thirdDownAtt)}`,`${gdNum(h.thirdDownConv)} / ${gdNum(h.thirdDownAtt)}`],['4to down',`${gdNum(a.fourthDownConv)} / ${gdNum(a.fourthDownAtt)}`,`${gdNum(h.fourthDownConv)} / ${gdNum(h.fourthDownAtt)}`],['Castigos (yds)',`${gdNum(a.penalties)} (${gdNum(a.penaltyYards)})`,`${gdNum(h.penalties)} (${gdNum(h.penaltyYards)})`],['Turnovers',a.turnovers,h.turnovers],['Jugadas',a.plays,h.plays],['EPA',a.epa==null?'—':Number(a.epa).toFixed(1),h.epa==null?'—':Number(h.epa).toFixed(1)]];
 return `<table class="gd-table"><thead><tr><th>Estadística</th><th><button class="gd-team" data-team-history="${g.away}">${g.awayName}</button></th><th><button class="gd-team" data-team-history="${g.home}">${g.homeName}</button></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${typeof r[1]==='number'?gdNum(r[1]):r[1]??'—'}</td><td>${typeof r[2]==='number'?gdNum(r[2]):r[2]??'—'}</td></tr>`).join('')}</tbody></table>`;
}
function openGameDetail(game){
 ensureGameDetailModal();
 const modal=$('#game-detail-modal');
 $('#gd-title').textContent=`${game.awayName} vs. ${game.homeName}`;
 $('#gd-sub').textContent=`Temporada ${game.season} · Semana ${game.week} · ${game.gameday||''} · ${game.status}`;
 const hasStats=!!(game.awayStats||game.homeStats);
 $('#gd-content').innerHTML=`<div class="gd-score">${game.awayPts??'—'} — ${game.homePts??'—'}</div>${hasStats?gdCompareTable(game):'<p class="gd-sub">Las estadísticas detalladas de este partido todavía no están disponibles en la fuente de datos.</p>'}`;
 modal.classList.add('open');
}
function openTeamHistory(abbr){
 ensureGameDetailModal();
 const team=teams.find(t=>t.abbr===abbr);if(!team)return;
 const history=sortGames(games.filter(g=>g.home===abbr||g.away===abbr));
 $('#gd-title').textContent=`Historial · ${team.name}`;
 $('#gd-sub').textContent=`${team.w}-${team.l}-${team.t} · ${team.gp} partidos en temporada ${currentSeason()}`;
 $('#gd-content').innerHTML=`<div class="gd-tabs"><button class="active" type="button">Todos los partidos</button></div><table class="gd-table"><thead><tr><th>Semana</th><th>Rival</th><th>Marcador</th><th>Estado</th></tr></thead><tbody>${history.map(g=>{const home=g.home===abbr,opp=home?g.awayName:g.homeName,forPts=home?g.homePts:g.awayPts,against=home?g.awayPts:g.homePts;return `<tr class="gd-history-row" data-history-game="${g.gameId||''}"><td>W${g.week}</td><td>${home?'vs':'@'} ${opp}</td><td>${forPts??'—'} – ${against??'—'}</td><td>${g.status}</td></tr>`}).join('')||'<tr><td colspan="4">Sin partidos disponibles.</td></tr>'}</tbody></table>`;
 modal.classList.add('open');
}
function closeGameDetail(){const modal=$('#game-detail-modal');if(modal)modal.classList.remove('open');}
function setupGameDetailInteractions(){
 document.addEventListener('click',e=>{
  const teamBtn=e.target.closest('[data-team-history]');if(teamBtn){openTeamHistory(teamBtn.dataset.teamHistory);return;}
  const historyRow=e.target.closest('[data-history-game]');if(historyRow){const game=games.find(g=>String(g.gameId)===historyRow.dataset.historyGame);if(game)openGameDetail(game);return;}
  const row=e.target.closest('tr[data-game-id]');if(row){const game=games.find(g=>String(g.gameId)===row.dataset.gameId);if(game)openGameDetail(game);}
 });
 document.addEventListener('keydown',e=>{const row=e.target.closest?.('tr[data-game-id]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const game=games.find(g=>String(g.gameId)===row.dataset.gameId);if(game)openGameDetail(game);}});
}

function ensureTeamPageStyles(){
 if($('#team-page-styles'))return;
 const st=document.createElement('style');st.id='team-page-styles';st.textContent=`
 #team-page-root{position:fixed;inset:0;z-index:950;background:#0b151e;color:#eaf1f6;overflow:auto;padding:26px clamp(16px,4vw,56px) 56px}
 #team-page-root .tp-wrap{max-width:1320px;margin:0 auto}
 #team-page-root .tp-back{border:1px solid #425968;background:#1b2d3a;color:#f3f7fa;border-radius:9px;padding:9px 14px;cursor:pointer}
 #team-page-root .tp-hero{margin:22px 0 20px;padding:28px;border:1px solid #2d4655;border-radius:16px;background:linear-gradient(120deg,#172b39,#101e29 72%);display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}
 #team-page-root .tp-kicker{color:#ffc247;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
 #team-page-root h1{font-size:clamp(28px,4vw,46px);margin:8px 0;color:#f5f8fb}
 #team-page-root .tp-record{font-size:26px;font-weight:850;color:#ffc247}
 #team-page-root .tp-hero-side{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
 #team-page-root .tp-standing-badges{display:grid;gap:7px}
 #team-page-root .tp-standing-badges span{display:block;background:#263c49;border:1px solid #405867;border-radius:8px;padding:7px 10px;color:#f1c45c;font-size:12px;font-weight:850;text-transform:capitalize}
 #team-page-root .tp-per-unit{font-size:12px;color:#b2c1cb;font-weight:700}

 #team-page-root .tp-muted{color:#b2c1cb}
 #team-page-root .tp-section{margin-top:27px}
 #team-page-root h2{font-size:19px;margin:0 0 12px;color:#f5f8fb}
 #team-page-root .tp-section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}
 #team-page-root .tp-group{margin:18px 0 22px}
 #team-page-root .tp-group-title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#aebfca;font-weight:850;margin:0 0 10px}
 #team-page-root .tp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
 #team-page-root .tp-card{background:#152936;border:1px solid #2c4351;border-radius:12px;padding:15px;min-width:0}
 #team-page-root .tp-card-top{display:flex;justify-content:space-between;gap:8px;align-items:center}
 #team-page-root .tp-label{font-size:10px;color:#b4c4ce;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
 #team-page-root .tp-rank{font-size:10px;font-weight:850;color:#ffc247;background:#3a3322;border:1px solid #66552e;border-radius:20px;padding:4px 8px;white-space:nowrap}
 #team-page-root .tp-value{font-size:25px;font-weight:850;margin-top:9px;color:#f6f8fa}
 #team-page-root .tp-sub{font-size:12px;color:#b2c1cb;margin-top:3px}
 #team-page-root .tp-breakdown{display:flex;align-items:center;gap:13px;margin-top:12px}
 #team-page-root .tp-donut{width:66px;height:66px;flex:0 0 66px;border-radius:50%;position:relative}
 #team-page-root .tp-donut:after{content:'';position:absolute;inset:10px;border-radius:50%;background:#152936}
 #team-page-root .tp-donut-legend{display:grid;gap:5px;font-size:11px;color:#c4d0d8}
 #team-page-root .tp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
 #team-page-root .tp-table-wrap{overflow-x:auto;border:1px solid #304957;border-radius:12px;background:#12232e}
 #team-page-root .tp-table{width:100%;border-collapse:collapse;min-width:620px;color:#e7eef3}
 #team-page-root .tp-table th,#team-page-root .tp-table td{padding:12px 14px;border-bottom:1px solid #2a414e;text-align:left;font-size:13px;color:#e3ebf0}
 #team-page-root .tp-table th{background:#29404e;color:#f0c45d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
 #team-page-root .tp-table tbody tr:nth-child(odd){background:#142936}
 #team-page-root .tp-table tbody tr:nth-child(even){background:#1a3341}
 #team-page-root .tp-table tbody tr[data-team-game]{cursor:pointer}
 #team-page-root .tp-table tbody tr[data-team-game]:hover{background:#294757}
 #team-page-root .tp-pill{display:inline-block;border-radius:30px;padding:4px 8px;background:#294351;color:#e8f0f5;font-size:11px;font-weight:800}
 #team-page-root .tp-result-win{color:#55d69a;font-weight:900}
 #team-page-root .tp-result-loss{color:#ff8585;font-weight:900}
 #team-page-root .tp-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 #team-page-root .tp-form-chip{background:#172d3a;border:1px solid #314b5a;border-radius:9px;padding:9px 12px;font-weight:850;letter-spacing:.08em}
 #team-page-root .tp-streak{color:#ffc247;font-weight:850}
 @media(max-width:900px){#team-page-root .tp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:560px){#team-page-root .tp-grid{grid-template-columns:1fr}#team-page-root .tp-hero{padding:20px}}
 `;document.head.appendChild(st);
}
function teamStatValue(t,key){const v=Number(t?.[key]);return Number.isFinite(v)?v:0;}
function teamMetricRank(team,key,lowerIsBetter=false){
 const vals=teams.map(t=>teamStatValue(t,key));
 const value=teamStatValue(team,key);
 return 1+vals.filter(v=>lowerIsBetter?v<value:v>value).length;
}
function teamStandingsRank(team,scope){
 const pool=scope==='division'?teams.filter(t=>t.div===team.div):teams.filter(t=>t.conf===team.conf);
 const ordered=[...pool].sort((a,b)=>(pct(b)-pct(a))||((Number(b.diff)||0)-(Number(a.diff)||0))||((Number(b.points)||0)-(Number(a.points)||0))||a.name.localeCompare(b.name));
 return ordered.findIndex(t=>t.abbr===team.abbr)+1;
}
function teamMetricCard(team,{label,key,rankKey=key,lower=false,shareKey,shareLabel}){
 const total=teamStatValue(team,key),gp=teamStatValue(team,'gp');
 const average=gp?total/gp:0;
 const rank=teamMetricRank(team,rankKey,lower);
 let visual='';
 if(shareKey){
  const a=Math.max(0,teamStatValue(team,shareKey)),b=Math.max(0,teamStatValue(team,shareLabel.key)),sum=a+b;
  const pctShare=sum?Math.round(a/sum*100):0;
  visual=`<div class="tp-breakdown"><div class="tp-donut" style="background:conic-gradient(#f2b632 0 ${pctShare}%,#4f9fc4 ${pctShare}% 100%)"></div><div class="tp-donut-legend"><div><span class="tp-dot" style="background:#f2b632"></span>${shareLabel.name}: ${fmt(a)} yds (${pctShare}%)</div><div><span class="tp-dot" style="background:#4f9fc4"></span>${shareLabel.other}: ${fmt(b)} yds (${100-pctShare}%)</div></div></div>`;
 }
 return `<article class="tp-card"><div class="tp-card-top"><div class="tp-label">${label}</div><span class="tp-rank">#${rank}</span></div><div class="tp-value">${average.toFixed(1)}<span class="tp-per-unit"> / partido</span></div><div class="tp-sub">Total de temporada: ${fmt(total)}</div>${visual}</article>`;
}
function teamProfileMarkup(team){
 const teamGames=games.filter(g=>g.home===team.abbr||g.away===team.abbr).sort((a,b)=>Number(a.week)-Number(b.week)||String(a.gameday||'').localeCompare(String(b.gameday||'')));
 const played=teamGames.filter(gameIsFinal).sort((a,b)=>Number(b.week)-Number(a.week));
 const upcoming=teamGames.filter(g=>!gameIsFinal(g)).sort((a,b)=>Number(a.week)-Number(b.week));
 const lastFive=played.slice(0,5);
 const results=lastFive.map(g=>{const home=g.home===team.abbr,forPts=Number(home?g.homePts:g.awayPts),against=Number(home?g.awayPts:g.homePts);return forPts>against?'W':forPts<against?'L':'T'});
 const form=results.length?results.join(' · '):'Sin partidos';
 let currentStreak='Sin racha';
 if(results.length){const first=results[0],count=results.findIndex(x=>x!==first);currentStreak=`${first==='W'?'Victoria':first==='L'?'Derrota':'Empate'}${(count<0?results.length:count)>1?'s':''} consecutiva${(count<0?results.length:count)>1?'s':''}: ${count<0?results.length:count}`;}
 const rows=teamGames.map(g=>{const home=g.home===team.abbr,opp=home?g.awayName:g.homeName,forPts=home?g.homePts:g.awayPts,against=home?g.awayPts:g.homePts;const result=gameIsFinal(g)?(forPts>against?'W':forPts<against?'L':'T'):'—';const cls=result==='W'?'tp-result-win':result==='L'?'tp-result-loss':'';return `<tr data-team-game="${g.gameId||''}" tabindex="0"><td>W${g.week}</td><td>${home?'vs':'@'} ${opp}</td><td>${gameIsFinal(g)?`${forPts}–${against}`:'—'}</td><td><span class="tp-pill">${g.status||'PROGRAMADO'}</span></td><td class="${cls}">${result}</td></tr>`}).join('');
 const gp=teamStatValue(team,'gp'), per=(v)=>gp?(v/gp).toFixed(1):'—';
 const pass=teamStatValue(team,'passNet')||teamStatValue(team,'pass'), rush=teamStatValue(team,'rush');
 const passAllowed=teamStatValue(team,'passAllowedNet')||teamStatValue(team,'passAllowed'), rushAllowed=teamStatValue(team,'rushAllowed');
 const offenseTotal=pass+rush, defenseTotal=passAllowed+rushAllowed;
 return `<div class="tp-wrap"><button class="tp-back" type="button" data-team-back>← Volver</button><header class="tp-hero"><div><div class="tp-kicker">NFL · ${team.conf} · ${team.div}</div><h1>${team.name}</h1><div class="tp-muted">Temporada ${currentSeason()} · ${gp} partidos disputados</div></div><div class="tp-hero-side"><div class="tp-record">${team.w}-${team.l}-${team.t}<div class="tp-muted" style="font-size:12px;font-weight:650">RÉCORD</div></div><div class="tp-standing-badges"><span>${teamStandingsRank(team,'division')}° en ${String(team.div||'').toLowerCase()}</span><span>${teamStandingsRank(team,'conference')}° en ${String(team.conf||'').toLowerCase()}</span></div></div></header>
 <section class="tp-group"><h2 class="tp-group-title">Producción ofensiva</h2><div class="tp-grid">
 ${teamMetricCard(team,{label:'Puntos anotados',key:'points'})}
 ${teamMetricCard(team,{label:'Yardas totales',key:'totalYards',shareKey:'passNet',shareLabel:{key:'rush',name:'Pase neto',other:'Carrera'}})}
 </div></section>
 <section class="tp-group"><h2 class="tp-group-title">Producción defensiva</h2><div class="tp-grid">
 ${teamMetricCard(team,{label:'Puntos permitidos',key:'pointsAllowed',lower:true})}
 ${teamMetricCard(team,{label:'Yardas permitidas',key:'yardsAllowed',lower:true,shareKey:'passAllowedNet',shareLabel:{key:'rushAllowed',name:'Pase permitido',other:'Carrera permitida'}})}
 </div></section>
 <section class="tp-group"><h2 class="tp-group-title">Desglose de yardas</h2><div class="tp-grid">
 ${teamMetricCard(team,{label:'Pase neto',key:'passNet',sub:`${per(pass)} por partido`})}
 ${teamMetricCard(team,{label:'Carrera',key:'rush',sub:`${per(rush)} por partido`})}
 ${teamMetricCard(team,{label:'Pase permitido',key:'passAllowedNet',lower:true,sub:`${per(passAllowed)} por partido`})}
 ${teamMetricCard(team,{label:'Carrera permitida',key:'rushAllowed',lower:true,sub:`${per(rushAllowed)} por partido`})}
 </div></section>
 <section class="tp-section"><h2>Forma reciente</h2><article class="tp-card"><div class="tp-form">${results.map((r,i)=>`<span class="tp-form-chip ${r==='W'?'tp-result-win':r==='L'?'tp-result-loss':''}">${r}</span>`).join('')||'Sin partidos terminados'}</div><div class="tp-streak" style="margin-top:12px">${currentStreak}</div><div class="tp-muted" style="font-size:12px;margin-top:4px">Últimos ${lastFive.length} partidos terminados · del más reciente al más antiguo</div></article></section>
 <section class="tp-section"><h2>Calendario e historial</h2><div class="tp-table-wrap"><table class="tp-table"><thead><tr><th>Semana</th><th>Rival</th><th>Marcador</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Sin partidos disponibles.</td></tr>'}</tbody></table></div><div class="tp-muted" style="font-size:12px;margin-top:8px">Ordenado de la semana más antigua a la más reciente.</div></section>
 <section class="tp-section"><h2>Próximos partidos</h2><div class="tp-muted">${upcoming.length?upcoming.map(g=>`<span class="tp-pill" style="margin:0 6px 8px 0">W${g.week} · ${g.awayName} vs ${g.homeName}</span>`).join(''):'No hay partidos pendientes en el calendario disponible.'}</div></section>
 <p class="tp-muted" style="margin-top:24px;font-size:12px">Fuente estadística: nflverse. Las posiciones comparan a los 32 equipos en la temporada seleccionada. Lesiones y probabilidades se integrarán en una siguiente fase.</p></div>`;
}
function openTeamProfile(abbr,push=true){
 const team=teams.find(t=>t.abbr===abbr);if(!team)return;
 ensureTeamPageStyles();let root=$('#team-page-root');if(!root){root=document.createElement('main');root.id='team-page-root';document.body.appendChild(root);}
 root.innerHTML=teamProfileMarkup(team);root.hidden=false;
 if(push)history.pushState({gridironTeam:abbr},'',`#equipo/${encodeURIComponent(abbr)}`);
}
function closeTeamProfile(){const root=$('#team-page-root');if(root)root.hidden=true;if(location.hash.startsWith('#equipo/'))history.pushState({},'',location.pathname+location.search);}
function setupTeamProfiles(){
 document.addEventListener('click',e=>{
  const teamBtn=e.target.closest('[data-team-profile]');if(teamBtn){e.preventDefault();openTeamProfile(teamBtn.dataset.teamProfile);return;}
  const back=e.target.closest('[data-team-back]');if(back){if(history.state?.gridironTeam)history.back();else closeTeamProfile();return;}
  const game=e.target.closest('[data-team-game]');if(game){const g=games.find(x=>String(x.gameId)===game.dataset.teamGame);if(g)openGameDetail(g);}
 });
 window.addEventListener('popstate',()=>{const m=location.hash.match(/^#equipo\/([^/]+)/);if(m)openTeamProfile(decodeURIComponent(m[1]),false);else{$('#team-page-root')?.setAttribute('hidden','');}});
}

function gameIsFinal(g){return String(g.status||'').toUpperCase()==='FINAL' && g.awayPts!=null && g.homePts!=null;}
function recordBucket(){return {w:0,l:0,t:0,gp:0,pct:0};}
function addRecord(bucket, scored, allowed){bucket.gp++; if(scored>allowed)bucket.w++; else if(scored<allowed)bucket.l++; else bucket.t++; bucket.pct=(bucket.w+0.5*bucket.t)/bucket.gp;}
function computeStandingsRecords(){
 const byAbbr=Object.fromEntries(teams.map(t=>[t.abbr,t]));
 const result={};
 teams.forEach(t=>result[t.abbr]={local:recordBucket(),visitor:recordBucket(),division:recordBucket(),conference:recordBucket(),interconference:recordBucket()});
 games.filter(gameIsFinal).forEach(g=>{
  const home=byAbbr[g.home], away=byAbbr[g.away]; if(!home||!away)return;
  const homeWon=Number(g.homePts)>Number(g.awayPts), awayWon=Number(g.awayPts)>Number(g.homePts);
  addRecord(result[g.home].local,Number(g.homePts),Number(g.awayPts));
  addRecord(result[g.away].visitor,Number(g.awayPts),Number(g.homePts));
  if(home.div===away.div){addRecord(result[g.home].division,Number(g.homePts),Number(g.awayPts));addRecord(result[g.away].division,Number(g.awayPts),Number(g.homePts));}
  if(home.conf===away.conf){addRecord(result[g.home].conference,Number(g.homePts),Number(g.awayPts));addRecord(result[g.away].conference,Number(g.awayPts),Number(g.homePts));}
  else {addRecord(result[g.home].interconference,Number(g.homePts),Number(g.awayPts));addRecord(result[g.away].interconference,Number(g.awayPts),Number(g.homePts));}
 });
 teams.forEach(t=>{t.standingRecords=result[t.abbr]||{};});
}
function recordText(r){return r&&r.gp?`${r.w}-${r.l}-${r.t}`:'—';}
function renderStandingsSubfilters(){
 const el=$('#standings-subfilters'); if(!el)return;
 // Conference/division views show every group on the same page; no single-group filter is needed.
 el.hidden=true; el.innerHTML='';
}
function renderStandings(){
 computeStandingsRecords();
 const state=tableSort.standings;
 const columns=[['G','w'],['P','l'],['E','t'],['PCT','pct'],['LOCAL','local'],['VIS','visitor'],['DIV','division'],['CONF','conference'],['INTERCONF','interconference'],['PF','points'],['PC','pointsAllowed'],['DIF.','diff']];
 const head=$('#standings-head');
 if(head)head.innerHTML='<tr><th>#</th><th>EQUIPO</th><th>DIVISIÓN</th>'+columns.map(([label,key])=>`<th data-sort-table="standings" data-sort-key="${key}">${label}</th>`).join('')+'</tr>';
 const compare=(a,b)=>{
   const av=sortValue(a,state.key),bv=sortValue(b,state.key);
   const cmp=typeof av==='string'?String(av).localeCompare(String(bv)):((Number(av)||0)-(Number(bv)||0));
   return (state.dir==='asc'?cmp:-cmp)||String(a.name).localeCompare(String(b.name));
 };
 const row=(t,i)=>{const r=t.standingRecords||{};return `<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${t.name} <span class="muted">${t.abbr}</span></button></td><td>${t.div}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${pct(t).toFixed(3)}</td><td>${recordText(r.local)}</td><td>${recordText(r.visitor)}</td><td>${recordText(r.division)}</td><td>${recordText(r.conference)}</td><td>${recordText(r.interconference)}</td><td>${fmt(t.points)}</td><td>${fmt(t.pointsAllowed)}</td><td class="${t.diff>0?'winner':t.diff<0?'loser':''}">${t.diff>0?'+':''}${fmt(t.diff)}</td></tr>`;};
 let html='';
 if(standingsView==='league'){
   const sorted=[...teams].sort(compare);
   html=sorted.map(row).join('');
 }else{
   const groups=standingsView==='conference'
     ?[{key:'AFC',label:'Conferencia Americana (AFC)',teams:teams.filter(t=>t.conf==='AFC')},{key:'NFC',label:'Conferencia Nacional (NFC)',teams:teams.filter(t=>t.conf==='NFC')}]
     :divisions.map(d=>({key:d,label:d,teams:teams.filter(t=>t.div===d)}));
   html=groups.map(group=>{
     const sorted=[...group.teams].sort(compare);
     if(!sorted.length)return '';
     return `<tr class="standings-group-row"><td colspan="15">${group.label}</td></tr>`+sorted.map(row).join('');
   }).join('');
 }
 $('#standings-table').innerHTML=html||'<tr><td colspan="15">Sin datos para esta selección.</td></tr>';
}
function renderPower(){
 const top=[...teams].sort((a,b)=>(b.diff+b.pct*20)-(a.diff+a.pct*20)).slice(0,5);
 $('#power-list').innerHTML=top.map((t,i)=>`<div class="power-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div class="team-id"><span class="team-badge">${t.abbr}</span><div>${t.name}<div class="team-record">${t.w}-${t.l}-${t.t} · ${t.conf}</div></div></div><span class="power-score">${Math.round(t.pct*100+t.diff/4)}</span></div>`).join('')||'<p class="muted">Sin datos disponibles.</p>';
}

function playoffGameIsFinal(g){return gameIsFinal(g);}
function playoffTeamGames(team){
 return games.filter(g=>playoffGameIsFinal(g)&&(g.home===team.abbr||g.away===team.abbr));
}
function playoffOpponent(team,g){return g.home===team.abbr?g.away:g.home;}
function playoffScoreFor(team,g){return Number(g.home===team.abbr?g.homePts:g.awayPts);}
function playoffScoreAgainst(team,g){return Number(g.home===team.abbr?g.awayPts:g.homePts);}
function playoffRecord(team, predicate){
 const bucket=recordBucket();
 playoffTeamGames(team).forEach(g=>{
  const opp=playoffOpponent(team,g);
  if(!predicate(opp,g))return;
  addRecord(bucket,playoffScoreFor(team,g),playoffScoreAgainst(team,g));
 });
 return bucket;
}
function playoffPct(team, predicate){return playoffRecord(team,predicate).pct;}
function playoffHeadToHead(a,b){
 const r=playoffRecord(a,opp=>opp===b.abbr);
 return r.gp?r.pct:null;
}
function playoffCommonOpponents(a,b){
 const ao=new Set(playoffTeamGames(a).map(g=>playoffOpponent(a,g)));
 const bo=new Set(playoffTeamGames(b).map(g=>playoffOpponent(b,g)));
 return new Set([...ao].filter(x=>bo.has(x)));
}
function playoffStats(team){
 const played=playoffTeamGames(team);
 const beaten=new Set(played.filter(g=>playoffScoreFor(team,g)>playoffScoreAgainst(team,g)).map(g=>playoffOpponent(team,g)));
 const opponents=new Set(played.map(g=>playoffOpponent(team,g)));
 const teamByAbbr=Object.fromEntries(teams.map(t=>[t.abbr,t]));
 // NFL strength of victory/schedule use aggregate opponent records, not an
 // unweighted average of each opponent's winning percentage.
 const aggregatePct=abbrs=>{
  let w=0,l=0,t=0;
  for(const abbr of abbrs){const o=teamByAbbr[abbr];if(!o)continue;w+=Number(o.w)||0;l+=Number(o.l)||0;t+=Number(o.t)||0;}
  return w+l+t?(w+0.5*t)/(w+l+t):0;
 };
 const netAll=played.reduce((n,g)=>n+playoffScoreFor(team,g)-playoffScoreAgainst(team,g),0);
 const netConference=played.filter(g=>teamByAbbr[playoffOpponent(team,g)]?.conf===team.conf).reduce((n,g)=>n+playoffScoreFor(team,g)-playoffScoreAgainst(team,g),0);
 const netTD=(Number(team.passTD)||0)+(Number(team.rushTD)||0)-(Number(team.passTDAllowed)||0)-(Number(team.rushTDAllowed)||0);
 return {strengthVictory:aggregatePct(beaten),strengthSchedule:aggregatePct(opponents),netAll,netConference,netTD};
}
function playoffCommonStats(team, common){
 const relevant=playoffTeamGames(team).filter(g=>common.has(playoffOpponent(team,g)));
 return {record:playoffRecord(team,opp=>common.has(opp)), net:relevant.reduce((n,g)=>n+playoffScoreFor(team,g)-playoffScoreAgainst(team,g),0), games:relevant.length};
}
function playoffCombinedRanks(team){
 const rank=(pool,key,descending)=>{
  const ordered=[...pool].sort((a,b)=>descending?(Number(b[key]||0)-Number(a[key]||0)):(Number(a[key]||0)-Number(b[key]||0)));
  const index=ordered.findIndex(t=>t.abbr===team.abbr);
  if(index<0)return pool.length+1;
  // Competition ranking: tied values share the same rank.
  const value=Number(ordered[index][key]||0);
  return 1+ordered.filter(t=>descending?Number(t[key]||0)>value:Number(t[key]||0)<value).length;
 };
 const conferenceTeams=teams.filter(t=>t.conf===team.conf);
 return {conference:rank(conferenceTeams,'points',true)+rank(conferenceTeams,'pointsAllowed',false),league:rank(teams,'points',true)+rank(teams,'pointsAllowed',false)};
}
function playoffCriterionValue(team, group, mode, step){
 const teamByAbbr=Object.fromEntries(teams.map(t=>[t.abbr,t]));
 const inGroup=new Set(group.map(t=>t.abbr));
 const gamesFor=playoffTeamGames(team);
 const head=playoffRecord(team,opp=>inGroup.has(opp));
 const headToHeadSweep=(()=>{
  if(mode!=='wildcard'||group.length<3)return head.gp?head.pct:null;
  let allWon=true,allLost=true,playedAny=false;
  for(const other of group){if(other.abbr===team.abbr)continue;const r=playoffRecord(team,opp=>opp===other.abbr);if(!r.gp){allWon=false;allLost=false;continue;}playedAny=true;if(r.l!==0)allWon=false;if(r.w!==0)allLost=false;}
  return playedAny&&allWon?1:playedAny&&allLost?0:null;
 })();
 const common=group.length>1?group.reduce((set,other)=>other.abbr===team.abbr?set:new Set([...set].filter(x=>playoffCommonOpponents(team,other).has(x))),new Set(playoffTeamGames(team).map(g=>playoffOpponent(team,g)))):new Set();
 const commonStats=playoffCommonStats(team,common);
 const stats=playoffStats(team), ranks=playoffCombinedRanks(team);
 const division=pct(team.standingRecords?.division||{}), conference=pct(team.standingRecords?.conference||{});
 // Return values where higher is better; only criteria specified by the NFL
 // for this tie type are considered. Coin toss cannot be reproduced digitally.
 const divisionSteps=[
  ()=>head.gp?head.pct:null,
  ()=>division,
  ()=>commonStats.games?commonStats.record.pct:null,
  ()=>conference,
  ()=>stats.strengthVictory,
  ()=>stats.strengthSchedule,
  ()=>-ranks.conference,
  ()=>-ranks.league,
  ()=>commonStats.games?commonStats.net:null,
  ()=>stats.netAll,
  ()=>stats.netTD
 ];
 const wildcardSteps=[
  ()=>headToHeadSweep,
  ()=>conference,
  ()=>commonStats.games>=4?commonStats.record.pct:null,
  ()=>stats.strengthVictory,
  ()=>stats.strengthSchedule,
  ()=>-ranks.conference,
  ()=>-ranks.league,
  ()=>stats.netConference,
  ()=>stats.netAll,
  ()=>stats.netTD
 ];
 const steps=mode==='division'?divisionSteps:wildcardSteps;
 return step<steps.length?steps[step]():null;
}
function playoffRankTieGroup(group, mode, startStep=0){
 if(group.length<=1)return [...group];
 const maxSteps=mode==='division'?11:10;
 for(let step=startStep;step<maxSteps;step++){
  const scored=group.map(team=>({team,value:playoffCriterionValue(team,group,mode,step)}));
  // Criteria that are not applicable to the entire group are skipped.
  if(scored.every(x=>x.value===null))continue;
  const applicable=scored.filter(x=>x.value!==null);
  if(applicable.length!==group.length)continue;
  const values=[...new Set(scored.map(x=>Math.round(x.value*1e9)/1e9))].sort((a,b)=>b-a);
  if(values.length>1){
   const output=[];
   for(const value of values){
    const subgroup=scored.filter(x=>Math.abs(x.value-value)<1e-9).map(x=>x.team);
    // NFL rules restart the applicable procedure when a criterion separates
    // a multi-team tie. Wild-card multi-team procedure starts at criterion 2.
    const restartStep=(mode==='wildcard'&&group.length>2&&subgroup.length>2)?1:0;
    output.push(...(subgroup.length>1?playoffRankTieGroup(subgroup,mode,restartStep):subgroup));
   }
   return output;
  }
 }
 // NFL's final coin toss cannot be determined from the supplied game data.
 // Stable alphabetical order is explicitly only a display fallback.
 return [...group].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function playoffTieCompare(a,b,mode){
 const ranked=playoffRankTieGroup([a,b],mode,0);
 return ranked[0]?.abbr===a.abbr?-1:ranked[0]?.abbr===b.abbr?1:0;
}
function playoffRankDivision(list){
 const sorted=[...list].sort((a,b)=>pct(b)-pct(a));
 const groups=[];
 for(const team of sorted){const last=groups[groups.length-1];if(last&&Math.abs(pct(last[0])-pct(team))<1e-9)last.push(team);else groups.push([team]);}
 return groups.flatMap(group=>playoffRankTieGroup(group,'division'));
}
function playoffRankWildcard(list){
 const sorted=[...list].sort((a,b)=>pct(b)-pct(a));
 const groups=[];
 for(const team of sorted){const last=groups[groups.length-1];if(last&&Math.abs(pct(last[0])-pct(team))<1e-9)last.push(team);else groups.push([team]);}
 return groups.flatMap(group=>playoffRankTieGroup(group,'wildcard'));
}
function playoffConferenceOrder(conf){
 const conferenceTeams=teams.filter(t=>t.conf===conf);
 const divisionsInConference=[...new Set(conferenceTeams.map(t=>t.div))];
 const winners=[];
 for(const division of divisionsInConference){
  const ranked=playoffRankDivision(conferenceTeams.filter(t=>t.div===division));
  if(ranked.length)winners.push(ranked[0]);
 }
 const orderedWinners=playoffRankWildcard(winners);
 const selected=[...orderedWinners];
 const selectedSet=new Set(selected.map(t=>t.abbr));
 for(let seed=0;seed<3;seed++){
  const candidates=[];
  for(const division of divisionsInConference){
   const remaining=playoffRankDivision(conferenceTeams.filter(t=>t.div===division&&!selectedSet.has(t.abbr)));
   if(remaining.length)candidates.push(remaining[0]);
  }
  if(!candidates.length)break;
  const winner=playoffRankWildcard(candidates)[0];
  selected.push(winner);selectedSet.add(winner.abbr);
 }
 const rest=playoffRankWildcard(conferenceTeams.filter(t=>!selectedSet.has(t.abbr)));
 return [...selected,...rest];
}
function renderPlayoffs(){
 for(const conf of ['AFC','NFC']){
  const list=playoffConferenceOrder(conf);
  const html=list.map((t,i)=>{
   let status='Fuera de zona de clasificación';
   if(i<4)status='Campeón divisional';
   else if(i<7)status='En zona de Wild Card';
   else status='Fuera de zona · En la pelea';
   return `<div class="playoff-row"><span class="seed">${i+1}</span><div class="team-id"><span class="team-badge">${t.abbr}</span><div>${t.name}<div class="playoff-record">${t.div} · ${status}</div></div></div><strong>${t.w}-${t.l}-${t.t}</strong></div>`;
  }).join('');
  $('#'+conf.toLowerCase()+'-playoffs').innerHTML=html||'<p class="muted">Sin datos disponibles.</p>';
 }
}
function renderMetrics(){
 const played=games.filter(g=>g.status==='FINAL'&&g.awayPts!=null&&g.homePts!=null);
 const points=played.reduce((s,g)=>s+g.awayPts+g.homePts,0);
 const avgPoints=played.length?points/(played.length*2):0;
 const avgYards=teams.reduce((s,t)=>s+t.totalYards,0)/(teams.reduce((s,t)=>s+t.gp,0)||1);
 const perfect=teams.filter(t=>t.gp>0&&t.l===0&&t.t===0).length;
 const avgDiff=teams.reduce((s,t)=>s+t.diff,0)/(teams.reduce((s,t)=>s+t.gp,0)||1);
 const values=document.querySelectorAll('.metric-value');
 if(values[0]) values[0].textContent=avgPoints?avgPoints.toFixed(1):'—';
 if(values[1]) values[1].textContent=avgYards?avgYards.toFixed(1):'—';
 if(values[2]) values[2].innerHTML=`${perfect} <small>equipos</small>`;
 if(values[3]) values[3].textContent=avgDiff?(avgDiff>0?'+':'')+avgDiff.toFixed(1):'—';
 const chip=$('.season-chip'); if(chip) chip.innerHTML=`<span class="live-dot"></span> NFL · TEMPORADA ${currentSeason()} · ${($('#game-type')?.value||'REG')==='POST'?'PLAYOFFS':'REGULAR'}`;
}
function renderChart(){
 if(!window.Chart||!$('#offenseChart'))return;
 const top=[...teams].sort((a,b)=>b.totalYards-a.totalYards).slice(0,6);
 if(offenseChart) offenseChart.destroy();
 offenseChart=new Chart($('#offenseChart'),{type:'bar',data:{labels:top.map(t=>t.abbr),datasets:[{label:'Yardas totales',data:top.map(t=>t.gp?Math.round(t.totalYards/t.gp):0),backgroundColor:top.map((_,i)=>i===0?'#f0b323':'#4b9bd8'),borderRadius:2,maxBarThickness:28}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0c1319'}},scales:{x:{grid:{display:false},ticks:{color:'#9aabb7',font:{size:10}},border:{display:false}},y:{grid:{color:'#2a3944'},ticks:{color:'#8294a1',font:{size:10}},border:{display:false}}}}});
}
function currentSeason(){return $('#season')?.value||String(new Date().getFullYear())}

function defaultScheduleWeek() {
  const weeks = [...new Set(games.map(g => Number(g.week)).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  // Primera semana que todavía tiene partidos sin terminar: semana en curso o próxima.
  const pendingWeeks = weeks.filter(week =>
    games.some(g => Number(g.week) === week && !gameIsFinal(g))
  );
  return pendingWeeks[0] ?? weeks[weeks.length - 1] ?? null;
}

function populateWeekFilter(resetToDefault = true) {
  const select = $('#week-filter');
  if (!select) return;

  const previous = select.value;
  const weeks = [...new Set(games.map(g => Number(g.week)).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  select.innerHTML = '<option value="all">Todas</option>' + weeks.map(w =>
    `<option value="${w}">Semana ${w}</option>`
  ).join('');

  const defaultWeek = defaultScheduleWeek();
  if (resetToDefault) {
    select.value = defaultWeek == null ? 'all' : String(defaultWeek);
  } else if (weeks.includes(Number(previous))) {
    select.value = previous;
  } else {
    select.value = defaultWeek == null ? 'all' : String(defaultWeek);
  }
}

function loadSeason(){
 const key=currentSeason();
 const chip=document.querySelector('.season-chip'); if(chip) chip.innerHTML=`<span class="live-dot"></span> NFL · TEMPORADA ${key} · ${($('#game-type')?.value||'REG')==='POST'?'PLAYOFFS':'REGULAR'}`;
 const seasonData=allData?.seasons?.[key];
 const type=$('#game-type')?.value||'REG';
 const data=seasonData?.types?.[type] || (type==='REG'?seasonData:null);
 if(!data){ teams=[]; games=[]; } else { teams=data.teams||[]; games=data.games||[]; }
 populateWeekFilter();
renderGames();renderOffense();renderDefense();renderStandings();renderSortable('standings');renderSortable('offense');renderSortable('defense');renderPower();renderPlayoffs();renderMetrics();renderChart();
}
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
 const seasonSelect=$('#season'); const latest=newestSeason();
 if(seasonSelect&&latest&&seasonSelect.value!==latest){seasonSelect.value=latest;loadSeason();}
 if(btn.dataset.view==='partidos') populateWeekFilter(true);
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+btn.dataset.view));
 const meta=views[btn.dataset.view]; if(meta){$('#page-title').textContent=meta[0];$('#page-subtitle').textContent=meta[1];}
}));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>document.querySelector(`[data-view="${btn.dataset.go}"]`)?.click()));
['game-search','week-filter'].forEach(id=>$('#'+id)?.addEventListener('input',renderGames));
$('#offense-search')?.addEventListener('input',renderOffense);
$('#defense-search')?.addEventListener('input',renderDefense);
$('#offense-mode')?.addEventListener('change',()=>{
 const mode=$('#offense-mode').value;
 tableSort.offense.key=({total:'totalYards',pass:'passNet',rush:'rush',receiving:'receiving',downs:'firstDowns'})[mode]||'totalYards';
 tableSort.offense.dir='desc'; renderSortable('offense');
});
$('#defense-mode')?.addEventListener('change',()=>{
 const mode=$('#defense-mode').value;
 tableSort.defense.key=({total:'yardsAllowed',pass:'passAllowedNet',rush:'rushAllowed',receiving:'receivingAllowed',downs:'firstDownsAllowed'})[mode]||'yardsAllowed';
 tableSort.defense.dir='asc'; renderSortable('defense');
});
document.querySelectorAll('[data-stats-mode]').forEach(btn=>btn.addEventListener('click',()=>{
 statsMode=btn.dataset.statsMode;
 document.querySelectorAll('[data-stats-mode]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',String(b===btn));});
 $('#stats-offense-panel').hidden=statsMode!=='offense'; $('#stats-defense-panel').hidden=statsMode!=='defense';
}));
document.querySelectorAll('[data-standings-view]').forEach(btn=>btn.addEventListener('click',()=>{
 standingsView=btn.dataset.standingsView; standingsSubfilter='all';
 document.querySelectorAll('[data-standings-view]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',String(b===btn));});
 renderStandingsSubfilters(); renderStandings(); renderSortable('standings');
}));

$('#season')?.addEventListener('change',loadSeason);
$('#game-type')?.addEventListener('change',loadSeason);
async function init(){
 try{
  const response=await fetch('data/nfl.json?cache='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo cargar data/nfl.json ('+response.status+')');
  allData=await response.json();
  const select=$('#season');
  if(select&&allData.seasons){
   const seasons=Object.keys(allData.seasons).sort((a,b)=>Number(b)-Number(a));
   select.innerHTML=seasons.map(s=>`<option value="${s}">${s}</option>`).join('');
   const newestWithGames=seasons.find(s=>(allData.seasons[s].games||[]).length)||seasons[0];
   if(newestWithGames)select.value=newestWithGames;
  }
  renderStandingsSubfilters();
  loadSeason();
  const teamRoute=location.hash.match(/^#equipo\/([^/]+)/);if(teamRoute)openTeamProfile(decodeURIComponent(teamRoute[1]),false);
 }catch(error){
  console.error(error);
  $('#games-table').innerHTML='<tr><td colspan="7">No se pudieron cargar los datos.</td></tr>';
 }
}
setupGameDetailInteractions();
setupTeamProfiles();
init();

document.addEventListener('click', e=>{const th=e.target.closest('th[data-sort-table][data-sort-key]'); if(!th)return; const kind=th.dataset.sortTable,key=th.dataset.sortKey,state=tableSort[kind]; if(!state)return; if(state.key===key)state.dir=state.dir==='desc'?'asc':'desc';else{state.key=key;state.dir=kind==='defense'?'asc':'desc';} renderSortable(kind);});

document.head.insertAdjacentHTML('beforeend','<style>.team-link{border:0;background:none;color:inherit;font:inherit;font-weight:700;text-align:left;padding:0;cursor:pointer}.team-link:hover{color:#f0b323;text-decoration:underline}.team-link .muted{font-weight:600}</style>');
