const $ = s => document.querySelector(s);

// Logos NFL centralizados. ESPN utiliza WSH para Washington (el dataset usa WAS).
function teamLogo(abbr, className='team-logo'){
 const raw=String(abbr||'').toUpperCase().replace(/[^A-Z]/g,'');
 const code=({WAS:'wsh'}[raw]||raw.toLowerCase());
 if(!code)return '';
 return `<img class="${className}" src="https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png" alt="${raw}" loading="lazy" decoding="async" onerror="this.style.display='none'">`;
}
function teamIdentity(abbr,name,opts={}){
 const {className='team-identity',nameClass='team-identity-name'}=opts;
 return `<span class="${className}">${teamLogo(abbr)}<span class="${nameClass}">${name||abbr||''}</span></span>`;
}

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
function teamStat(team,key){
 const gp=Number(team?.gp)||0;
 const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 if(key==='passNet'){
  if(finite(team.passNet)) return Number(team.passNet);
  // No asumir que las yardas brutas son netas si el JSON no trae la pérdida por sacks.
  if(finite(team.pass) && finite(team.sackYardsAllowed)) return Number(team.pass)-Number(team.sackYardsAllowed);
  return null;
 }
 if(key==='passPerGame'){
  if(finite(team.passPerGame)) return Number(team.passPerGame);
  const net=teamStat(team,'passNet'); return gp&&net!==null?net/gp:null;
 }
 if(key==='passAllowedNet'){
  if(finite(team.passAllowedNet)) return Number(team.passAllowedNet);
  if(finite(team.passAllowed) && finite(team.sacksMadeYards)) return Number(team.passAllowed)-Number(team.sacksMadeYards);
  return null;
 }
 if(key==='passAllowedPerGame'){
  if(finite(team.passAllowedPerGame)) return Number(team.passAllowedPerGame);
  const net=teamStat(team,'passAllowedNet'); return gp&&net!==null?net/gp:null;
 }
 return team?.[key] ?? null;
}
function sortValue(team,key){
 const gp=Number(team.gp)||0;
 const isPatriotsRushingCorrection=currentSeason()==='2026'&&($('#game-type')?.value||'REG')==='REG'&&($('#offense-mode')?.value||'total')==='rush'&&team.abbr==='NE';
 const rushYards=Number(team.rush)||0;
 const correctedRushYards=isPatriotsRushingCorrection?rushYards+1:rushYards;
 const values={totalYards:team.totalYards, yardsPerGame:gp?team.totalYards/gp:0, pass:team.pass, passNet:teamStat(team,'passNet'), passPerGame:teamStat(team,'passPerGame'), rush:correctedRushYards, rushPerGame:gp?correctedRushYards/gp:team.rushPerGame, receiving:team.receiving, receivingPerGame:team.receivingPerGame, points:team.points, pointsPerGame:gp?team.points/gp:0, yardsAllowed:team.yardsAllowed, yardsAllowedPerGame:gp?team.yardsAllowed/gp:0, passAllowed:team.passAllowed, passAllowedNet:teamStat(team,'passAllowedNet'), passAllowedPerGame:teamStat(team,'passAllowedPerGame'), rushAllowed:team.rushAllowed, rushAllowedPerGame:team.rushAllowedPerGame, receivingAllowed:team.receivingAllowed, receivingAllowedPerGame:team.receivingAllowedPerGame, pointsAllowed:team.pointsAllowed, pointsAllowedPerGame:gp?team.pointsAllowed/gp:0, sacks:team.sacks, sacksAllowed:team.sacksAllowed, firstDowns:team.firstDowns, firstDownsAllowed:team.firstDownsAllowed, thirdDownConv:team.thirdDownConv, thirdDownAtt:team.thirdDownAtt, thirdDownRate:team.thirdDownRate, thirdDownConvAllowed:team.thirdDownConvAllowed, thirdDownAttAllowed:team.thirdDownAttAllowed, thirdDownRateAllowed:team.thirdDownRateAllowed, gp:team.gp, pct:pct(team), w:team.w, l:team.l, t:team.t, diff:team.diff, div:team.div, name:team.name, local:team.standingRecords?.local?.pct||0, visitor:team.standingRecords?.visitor?.pct||0, division:team.standingRecords?.division?.pct||0, conference:team.standingRecords?.conference?.pct||0, interconference:team.standingRecords?.interconference?.pct||0};
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
function sortGames(list){
 return [...list].sort((a,b)=>{
  const week=(Number(a.week)||0)-(Number(b.week)||0);
  if(week) return week;
  const dateA=String(a.gameday||a.gameDate||'');
  const dateB=String(b.gameday||b.gameDate||'');
  const date=dateA.localeCompare(dateB);
  if(date) return date;
  const timeA=kickoffMinutes(a);
  const timeB=kickoffMinutes(b);
  return timeA-timeB||String(a.gameId||'').localeCompare(String(b.gameId||''));
 });
}
function kickoffMinutes(g){
 const raw=String(g.gametime||g.gameTime||'').trim();
 const m=raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)||raw.match(/^(\d{1,2})(\d{2})\s*(AM|PM)$/i);
 if(!m)return 0;
 let h=Number(m[1]);const mer=(m[3]||'').toUpperCase();
 if(mer==='PM'&&h<12)h+=12;if(mer==='AM'&&h===12)h=0;
 return h*60+Number(m[2]);
}
function gameLocalDateTime(g){
 const rawDate=String(g.gameday||g.gameDate||'').slice(0,10);
 const rawTime=String(g.gametime||g.gameTime||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return {date:'—',time:''};
 const [year,month,day]=rawDate.split('-').map(Number);
 // La fecha se presenta siempre en formato mexicano; la hora se convierte
 // desde la hora oficial de calendario NFL (Eastern) a la zona del dispositivo.
 const date=`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
 if(!rawTime || gameIsFinal(g)) return {date,time:''};
 let match=rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
 if(!match) match=rawTime.match(/^(\d{1,2})(\d{2})\s*(AM|PM)$/i);
 if(!match) return {date,time:''};
 let hour=Number(match[1]), minute=Number(match[2]);
 const meridiem=(match[3]||'').toUpperCase();
 if(meridiem==='PM'&&hour<12) hour+=12;
 if(meridiem==='AM'&&hour===12) hour=0;
 const target={year,month,day,hour,minute};
 const tz='America/New_York';
 let utc=Date.UTC(year,month-1,day,hour,minute);
 for(let n=0;n<4;n++){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));
  const values=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const represented=Date.UTC(+values.year,+values.month-1,+values.day,+values.hour,+values.minute);
  const desired=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute);
  const delta=desired-represented;
  utc+=delta;
  if(delta===0) break;
 }
 const instant=new Date(utc);
 const localDate=new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).format(instant);
 return {date:localDate,time:new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant)};
}
function gameRow(g,compact=false){
 const mobileSchedule=window.matchMedia('(max-width:700px)').matches;
 const score = g.status === 'FINAL' && g.awayPts != null && g.homePts != null ? `${g.awayPts} — ${g.homePts}` : '—';
 const status = g.status === 'FINAL' ? 'FINAL' : (g.status || 'PROGRAMADO');
 const localDateTime=gameLocalDateTime(g);
 return compact
  ? `<tr class="game-clickable game-row-compact" data-game-id="${g.gameId||''}" tabindex="0" role="button"><td class="game-week">W${g.week}</td><td class="team-cell game-away">${teamLogo(g.away)}<span class="game-team-name">${g.awayName}</span></td><td class="score game-away-score">${g.awayPts ?? '—'}</td><td class="team-cell game-home">${teamLogo(g.home)}<span class="game-team-name">${g.homeName}</span></td><td class="score game-home-score">${g.homePts ?? '—'}</td><td class="game-datetime">${localDateTime.date}${localDateTime.time?` · ${localDateTime.time}`:''}</td><td class="game-status">${status}</td></tr>`
  : `<tr class="game-clickable game-row-full" data-game-id="${g.gameId||''}" tabindex="0" role="button" aria-label="Ver estadísticas ${g.awayName} contra ${g.homeName}"><td class="game-week">W${g.week}</td><td class="game-datetime"><span>${localDateTime.date}</span>${localDateTime.time?`<span>${localDateTime.time}</span>`:''}${status==='FINAL'?'<span class="game-mobile-final">FINAL</span>':''}</td><td class="team-cell game-away">${teamLogo(g.away)}<span class="game-team-name">${g.awayName}</span></td><td class="score game-away-score">${g.awayPts ?? '—'}</td><td class="game-at">${mobileSchedule ? "" : "@"}</td><td class="score game-home-score">${g.homePts ?? '—'}</td><td class="team-cell game-home">${teamLogo(g.home)}<span class="game-team-name">${g.homeName}</span></td><td class="game-status"><span class="${status==='FINAL'?'status-final':'muted'}">${mobileSchedule ? "" : status}</span></td></tr>`;
}
function renderGames(){
 const search=($('#game-search')?.value||'').toLowerCase();
 const week=$('#week-filter')?.value||'all';
 const filtered=sortGames(games).filter(g=>(week==='all'||String(g.week)===week)&&`${g.away} ${g.home} ${g.awayName} ${g.homeName}`.toLowerCase().includes(search));
 const gamesTable=$('#games-table');
 const table=gamesTable?.closest('table');
 const header=table?.querySelector('thead tr');
 if(header) header.innerHTML='<th>SEM.</th><th>FECHA / HORA</th><th>VISITANTE</th><th>PTS</th><th></th><th>PTS</th><th>LOCAL</th><th>ESTADO</th>';
 gamesTable.innerHTML=filtered.map(g=>gameRow(g)).join('')||'<tr><td colspan="8">No hay partidos para esos filtros.</td></tr>';
 $('#recent-games').innerHTML=sortGames(games).slice(0,5).map(g=>gameRow(g,true)).join('')||'<tr><td colspan="7">Todavía no hay partidos disponibles.</td></tr>';
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
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${teamLogo(t.abbr)}<span class="team-full-name">${t.name}</span> <span class="muted">${t.abbr}</span></button></td>`+cols.map(([label,key])=>{let v=teamStat(t,key);
  // Ajuste visual puntual: ESPN muestra una yarda terrestre adicional para NE en 2026 REG.
  // No modifica el objeto team ni el JSON de origen.
  if(mode==='rush'&&currentSeason()==='2026'&&($('#game-type')?.value||'REG')==='REG'&&t.abbr==='NE'){
   if(key==='rush')v=(Number(t.rush)||0)+1;
   else if(key==='rushPerGame')v=t.gp?((Number(t.rush)||0)+1)/Number(t.gp):0;
  }
  let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPct'?(Number(v)*100).toFixed(1)+'%':(['passAvg','rushAvg','receivingAvg','passerRating','yardsPerGame','passPerGame','rushPerGame','receivingPerGame','pointsPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
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
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${teamLogo(t.abbr)}<span class="team-full-name">${t.name}</span> <span class="muted">${t.abbr}</span></button></td>`+cols.map(([label,key])=>{const v=teamStat(t,key);let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPctAllowed'?(Number(v)*100).toFixed(1)+'%':(['passAvgAllowed','rushAvgAllowed','receivingAvgAllowed','passerRatingAllowed','yardsAllowedPerGame','passAllowedPerGame','rushAllowedPerGame','receivingAllowedPerGame','pointsAllowedPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
}
function ensureGameDetailModal(){
 if($('#game-detail-modal'))return;
 const style=document.createElement('style');
 style.textContent=`#game-detail-modal{position:fixed;inset:0;z-index:1000;background:rgba(3,9,14,.78);display:none;align-items:center;justify-content:center;padding:18px}#game-detail-modal.open{display:flex}#game-detail-modal .gd-card{width:min(980px,100%);max-height:90vh;overflow:auto;background:#111d27;color:#eaf0f4;border:1px solid #344654;border-radius:14px;padding:22px;box-shadow:0 20px 70px #0009}#game-detail-modal .gd-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}#game-detail-modal h2{margin:0 0 6px;font-size:clamp(20px,3vw,30px)}#game-detail-modal .gd-sub{color:#9eafbb;font-size:13px}#game-detail-modal button{cursor:pointer}#game-detail-modal .gd-close{border:1px solid #526675;background:#1a2a36;color:#fff;border-radius:8px;padding:8px 12px}#game-detail-modal .gd-score{font-size:24px;font-weight:800;color:#f0b323;margin:14px 0}#game-detail-modal .gd-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}#game-detail-modal .gd-tabs button{border:1px solid #415462;background:#1a2a36;color:#dce5eb;border-radius:8px;padding:8px 12px}#game-detail-modal .gd-tabs button.active{background:#f0b323;color:#101820;border-color:#f0b323}#game-detail-modal .gd-table{width:100%;border-collapse:collapse;font-size:13px}#game-detail-modal .gd-table th,#game-detail-modal .gd-table td{padding:10px 8px;border-bottom:1px solid #2a3a46;text-align:right}#game-detail-modal .gd-table th:first-child,#game-detail-modal .gd-table td:first-child{text-align:left}#game-detail-modal .gd-table th{color:#9eafbb;font-size:11px}#game-detail-modal .gd-team{color:#f0b323;background:none;border:0;padding:0;font:inherit;font-weight:700;text-align:left}#game-detail-modal .gd-history-row{cursor:pointer}#game-detail-modal .gd-history-row:hover,.game-clickable:hover{background:rgba(240,179,35,.08)}.game-clickable{cursor:pointer}.game-clickable:focus{outline:2px solid #f0b323;outline-offset:-2px}`;
 style.textContent+=`\n/* Contraste del detalle de partido: evita que estilos globales claros se filtren al modal */\n#game-detail-modal .gd-card{background:#101c26;color:#edf3f7}\n#game-detail-modal .gd-table{background:#142431;color:#edf3f7;border-collapse:separate;border-spacing:0}\n#game-detail-modal .gd-table thead th{background:#243947!important;color:#f3f6f8!important;border-bottom:1px solid #526775!important}\n#game-detail-modal .gd-table tbody tr{background:#172936!important;color:#e8eff4!important}\n#game-detail-modal .gd-table tbody tr:nth-child(even){background:#1d303d!important}\n#game-detail-modal .gd-table tbody td{background:transparent!important;color:#e8eff4!important;border-bottom:1px solid #344956!important}\n#game-detail-modal .gd-table tbody td:first-child{color:#c6d2db!important;font-weight:600}\n#game-detail-modal .gd-table .gd-team{color:#ffc247!important}\n#game-detail-modal .gd-table .gd-team:hover{color:#ffda83!important;text-decoration:underline}\n#game-detail-modal .gd-sub{color:#b8c6d0!important}\n#game-detail-modal .gd-history-row:hover{background:#2a4050!important}\n#game-detail-modal .gd-tabs button{color:#e8eff4!important;background:#203441!important}\n#game-detail-modal .gd-tabs button.active{color:#17212a!important;background:#f0b323!important}\n#game-detail-modal .gd-close{color:#f4f7f9!important;background:#203441!important}\n#game-detail-modal .gd-score{color:#ffc247!important}\n
 /* Calendario: fecha y hora local */
 #games-table{width:100%}
 #games-table .game-datetime{white-space:nowrap;font-variant-numeric:tabular-nums;color:#687482;font-size:12px}
`;

 style.textContent+=`
 /* Responsive móvil: calendario en tarjetas verticales y ficha sin scroll horizontal */
 @media(max-width:640px){
  #games-table{display:block;width:100%;min-width:0}
  #games-table thead{display:none}
  #games-table tbody{display:grid;gap:10px;padding:8px}
  #games-table tr.game-row-full{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"week status" "away awayScore" "home homeScore";gap:0 10px;padding:8px 12px;background:#fff;border:1px solid #d7dee5;border-radius:12px;box-shadow:0 2px 7px #10203010}
  #games-table tr.game-row-full td{display:block;min-width:0;padding:7px 0;border:0!important;text-align:left!important;white-space:normal}
  #games-table tr.game-row-full .game-week{grid-area:week;color:#7b8794;font-size:11px;font-weight:800;padding-bottom:3px}
  #games-table tr.game-row-full .game-status{grid-area:status;text-align:right!important;font-size:10px;font-weight:800;padding-bottom:3px}
  #games-table tr.game-row-full .game-away{grid-area:away;font-size:14px;font-weight:750;overflow-wrap:anywhere}
  #games-table tr.game-row-full .game-away-score{grid-area:awayScore;text-align:right!important;font-size:17px;font-weight:850;align-self:center}
  #games-table tr.game-row-full .game-at{display:none!important}
  #games-table tr.game-row-full .game-home{grid-area:home;font-size:14px;font-weight:750;overflow-wrap:anywhere}
  #games-table tr.game-row-full .game-home-score{grid-area:homeScore;text-align:right!important;font-size:17px;font-weight:850;align-self:center}
  #games-table tr.game-row-full .muted{font-size:11px}
  #game-detail-modal{padding:8px!important;align-items:center}
  #game-detail-modal .gd-card{width:100%!important;max-width:100vw;max-height:94dvh!important;padding:15px 12px!important;border-radius:14px;overflow-x:hidden!important}
  #game-detail-modal .gd-top{gap:10px;align-items:flex-start}
  #game-detail-modal .gd-top>div{min-width:0;flex:1}
  #game-detail-modal h2{font-size:clamp(18px,5.2vw,23px);line-height:1.2;overflow-wrap:anywhere}
  #game-detail-modal .gd-sub{font-size:11px;line-height:1.4;overflow-wrap:anywhere}
  #game-detail-modal .gd-close{flex:0 0 auto;padding:7px 9px;font-size:12px}
  #game-detail-modal .gd-score{font-size:25px;margin:12px 0}
  #game-detail-modal #gd-content{width:100%;min-width:0}
  #game-detail-modal .gd-table{display:table;width:100%!important;min-width:0!important;table-layout:fixed;font-size:12px}
  #game-detail-modal .gd-table thead th{padding:9px 5px;font-size:10px;line-height:1.2;overflow-wrap:anywhere;word-break:normal}
  #game-detail-modal .gd-table thead th:first-child{width:36%}
  #game-detail-modal .gd-table thead th:nth-child(2),#game-detail-modal .gd-table thead th:nth-child(3){width:32%}
  #game-detail-modal .gd-table th,#game-detail-modal .gd-table td{padding:9px 5px;white-space:normal;overflow-wrap:anywhere}
  #game-detail-modal .gd-table td:first-child{text-align:left;font-size:11px}
  #game-detail-modal .gd-table td:nth-child(2),#game-detail-modal .gd-table td:nth-child(3){text-align:center;font-variant-numeric:tabular-nums}
  #game-detail-modal .gd-table .gd-team{display:block;width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center;font-size:10px;line-height:1.2}
  /* Refuerzo de layout: la ficha no debe modificar el ancho de las filas del calendario */
  #games-table{table-layout:fixed!important}
  #games-table tbody{width:100%!important;min-width:100%!important}
  #games-table tbody tr.game-row-full{display:grid!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:"week status" "date date" "away awayScore" "home homeScore"!important}
  #games-table tbody tr.game-row-full .game-week{grid-area:week!important}
  #games-table tbody tr.game-row-full .game-datetime{grid-area:date!important;font-size:11px;color:#7b8794;padding:2px 0 5px!important}
  #games-table tbody tr.game-row-full .game-away{grid-area:away!important}
  #games-table tbody tr.game-row-full .game-away-score{grid-area:awayScore!important}
  #games-table tbody tr.game-row-full .game-home{grid-area:home!important}
  #games-table tbody tr.game-row-full .game-home-score{grid-area:homeScore!important}
  #games-table tbody tr.game-row-full .game-at{display:none!important}
  #games-table tbody tr.game-row-full td{min-width:0!important;max-width:100%!important;box-sizing:border-box!important;word-break:normal!important;overflow-wrap:break-word!important}
 }
 @media(max-width:380px){
  #game-detail-modal .gd-card{padding:12px 9px!important}
  #game-detail-modal .gd-table{font-size:11px}
  #game-detail-modal .gd-table thead th:first-child{width:34%}
  #game-detail-modal .gd-table thead th:nth-child(2),#game-detail-modal .gd-table thead th:nth-child(3){width:33%}
 }
 `;
 document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='game-detail-modal';modal.innerHTML=`<div class="gd-card" role="dialog" aria-modal="true" aria-labelledby="gd-title"><div class="gd-top"><div><h2 id="gd-title">Estadísticas del partido</h2><div class="gd-sub" id="gd-sub"></div></div><button class="gd-close" type="button" data-gd-close>Cerrar ✕</button></div><div id="gd-content"></div></div>`;
 modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-gd-close]'))closeGameDetail();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeGameDetail();});
 document.body.appendChild(modal);
}
function gdNum(v){return v==null?'—':fmt(v)}
function gdCompareTable(g){
 const a=g.awayStats||{},h=g.homeStats||{};
 const rows=[['Puntos',g.awayPts,g.homePts],['Pase neto (yds)',teamStat(a,'passNet'),teamStat(h,'passNet')],['Pase bruto (yds)',a.pass??a.passGross,h.pass??h.passGross],['Completos / intentos',`${gdNum(a.passComp)} / ${gdNum(a.passAtt)}`,`${gdNum(h.passComp)} / ${gdNum(h.passAtt)}`],['TD por pase',a.passTD,h.passTD],['Intercepciones',a.interceptions,h.interceptions],['Capturas permitidas',a.sacksAllowed,h.sacksAllowed],['Carrera (yds)',a.rush,h.rush],['Acarreos',a.rushAtt,h.rushAtt],['TD por carrera',a.rushTD,h.rushTD],['Recepciones',a.receptions,h.receptions],['Yardas recibidas',a.receiving,h.receiving],['TD por recepción',a.receivingTD,h.receivingTD],['Primeros downs',a.firstDowns,h.firstDowns],['3er down',`${gdNum(a.thirdDownConv)} / ${gdNum(a.thirdDownAtt)}`,`${gdNum(h.thirdDownConv)} / ${gdNum(h.thirdDownAtt)}`],['4to down',`${gdNum(a.fourthDownConv)} / ${gdNum(a.fourthDownAtt)}`,`${gdNum(h.fourthDownConv)} / ${gdNum(h.fourthDownAtt)}`],['Castigos (yds)',`${gdNum(a.penalties)} (${gdNum(a.penaltyYards)})`,`${gdNum(h.penalties)} (${gdNum(h.penaltyYards)})`],['Turnovers',a.turnovers,h.turnovers],['Jugadas',a.plays,h.plays],['EPA',a.epa==null?'—':Number(a.epa).toFixed(1),h.epa==null?'—':Number(h.epa).toFixed(1)]];
 return `<table class="gd-table"><thead><tr><th>Estadística</th><th><button class="gd-team" data-team-history="${g.away}">${teamLogo(g.away)}<span class="gd-team-name">${g.awayName}</span><span class="gd-team-abbr">${g.away}</span></button></th><th><button class="gd-team" data-team-history="${g.home}">${teamLogo(g.home)}<span class="gd-team-name">${g.homeName}</span><span class="gd-team-abbr">${g.home}</span></button></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${typeof r[1]==='number'?gdNum(r[1]):r[1]??'—'}</td><td>${typeof r[2]==='number'?gdNum(r[2]):r[2]??'—'}</td></tr>`).join('')}</tbody></table>`;
}
function openGameDetail(game){
 ensureGameDetailModal();
 const modal=$('#game-detail-modal');
 $('#gd-title').innerHTML=`<span class="gd-matchup-team">${teamLogo(game.away)}<span>${game.awayName}</span></span><span class="gd-matchup-vs">vs.</span><span class="gd-matchup-team">${teamLogo(game.home)}<span>${game.homeName}</span></span>`;
 const detailDateTime=gameLocalDateTime(game);
 $('#gd-sub').textContent=`Temporada ${game.season} · Semana ${game.week} · ${detailDateTime.date}${detailDateTime.time?` · ${detailDateTime.time}`:''} · ${game.status}`;
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
 #team-page-root .tp-metric-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(210px,1fr);gap:12px;align-items:stretch}
 #team-page-root .tp-primary-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 #team-page-root .tp-side-metrics{display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:12px}
 #team-page-root .tp-side-metrics .tp-card{padding:13px 15px;display:flex;flex-direction:column;justify-content:center}
 #team-page-root .tp-side-metrics .tp-value{font-size:22px;margin-top:7px}
 #team-page-root .tp-league-compare{margin-top:4px;padding-top:5px;border-top:1px solid #38505e;color:#f3c75f;font-size:11px;font-weight:800}

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
 @media(max-width:900px){#team-page-root .tp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#team-page-root .tp-metric-layout{grid-template-columns:1fr}#team-page-root .tp-side-metrics{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:none}}
 @media(max-width:560px){#team-page-root .tp-grid{grid-template-columns:1fr}#team-page-root .tp-primary-metrics{grid-template-columns:1fr}#team-page-root .tp-side-metrics{grid-template-columns:1fr}#team-page-root .tp-hero{padding:20px}}
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
function teamLeagueShareAverage(primaryKey,secondaryKey){
 const shares=teams.map(t=>{const a=Math.max(0,teamStatValue(t,primaryKey)),b=Math.max(0,teamStatValue(t,secondaryKey));return a+b?(a/(a+b))*100:null;}).filter(v=>v!==null);
 return shares.length?Math.round(shares.reduce((sum,v)=>sum+v,0)/shares.length):0;
}
function teamMetricCard(team,{label,key,rankKey=key,lower=false,shareKey,shareLabel}){
 const total=teamStatValue(team,key),gp=teamStatValue(team,'gp');
 const average=gp?total/gp:0;
 const rank=teamMetricRank(team,rankKey,lower);
 let visual='';
 if(shareKey){
  const a=Math.max(0,teamStatValue(team,shareKey)),b=Math.max(0,teamStatValue(team,shareLabel.key)),sum=a+b;
  const pctShare=sum?Math.round(a/sum*100):0;
  const leaguePct=teamLeagueShareAverage(shareKey,shareLabel.key);
  visual=`<div class="tp-breakdown"><div class="tp-donut" style="background:conic-gradient(#f2b632 0 ${pctShare}%,#4f9fc4 ${pctShare}% 100%)"></div><div class="tp-donut-legend"><div><span class="tp-dot" style="background:#f2b632"></span>${shareLabel.name}: ${fmt(a)} yds · ${pctShare}%</div><div><span class="tp-dot" style="background:#4f9fc4"></span>${shareLabel.other}: ${fmt(b)} yds · ${100-pctShare}%</div><div class="tp-league-compare">Promedio liga: ${leaguePct}% pase · ${100-leaguePct}% carrera</div></div></div>`;
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
 return `<div class="tp-wrap"><button class="tp-back" type="button" data-team-back>← Volver</button><header class="tp-hero"><div><div class="tp-kicker">NFL · ${team.conf} · ${team.div}</div><div class="tp-team-heading">${teamLogo(team.abbr)}<h1>${team.name}</h1></div><div class="tp-muted">Temporada ${currentSeason()} · ${gp} partidos disputados</div></div><div class="tp-hero-side"><div class="tp-record">${team.w}-${team.l}-${team.t}<div class="tp-muted" style="font-size:12px;font-weight:650">RÉCORD</div></div><div class="tp-standing-badges"><span>${teamStandingsRank(team,'division')}° en ${String(team.div||'').toLowerCase()}</span><span>${teamStandingsRank(team,'conference')}° en ${String(team.conf||'').toLowerCase()}</span></div></div></header>
 <section class="tp-group"><h2 class="tp-group-title">Producción ofensiva</h2><div class="tp-metric-layout"><div class="tp-primary-metrics">
 ${teamMetricCard(team,{label:'Puntos anotados',key:'points'})}
 ${teamMetricCard(team,{label:'Yardas totales',key:'totalYards',shareKey:'passNet',shareLabel:{key:'rush',name:'Pase neto',other:'Carrera'}})}
 </div><div class="tp-side-metrics">
 ${teamMetricCard(team,{label:'Pase neto',key:'passNet'})}
 ${teamMetricCard(team,{label:'Carrera',key:'rush'})}
 </div></div></section>
 <section class="tp-group"><h2 class="tp-group-title">Producción defensiva</h2><div class="tp-metric-layout"><div class="tp-primary-metrics">
 ${teamMetricCard(team,{label:'Puntos permitidos',key:'pointsAllowed',lower:true})}
 ${teamMetricCard(team,{label:'Yardas permitidas',key:'yardsAllowed',lower:true,shareKey:'passAllowedNet',shareLabel:{key:'rushAllowed',name:'Pase permitido',other:'Carrera permitida'}})}
 </div><div class="tp-side-metrics">
 ${teamMetricCard(team,{label:'Pase permitido',key:'passAllowedNet',lower:true})}
 ${teamMetricCard(team,{label:'Carrera permitida',key:'rushAllowed',lower:true})}
 </div></div></section>
 <section class="tp-section"><h2>Forma reciente</h2><article class="tp-card"><div class="tp-form">${results.map((r,i)=>`<span class="tp-form-chip ${r==='W'?'tp-result-win':r==='L'?'tp-result-loss':''}">${r}</span>`).join('')||'Sin partidos terminados'}</div><div class="tp-streak" style="margin-top:12px">${currentStreak}</div><div class="tp-muted" style="font-size:12px;margin-top:4px">Últimos ${lastFive.length} partidos terminados · del más reciente al más antiguo</div></article></section>
 <section class="tp-section"><h2>Calendario e historial</h2><div class="tp-table-wrap"><table class="tp-table"><thead><tr><th>Semana</th><th>Rival</th><th>Marcador</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Sin partidos disponibles.</td></tr>'}</tbody></table></div><div class="tp-muted" style="font-size:12px;margin-top:8px">Ordenado de la semana más antigua a la más reciente.</div></section>
 <section class="tp-section"><h2>Próximos partidos</h2><div class="tp-muted">${upcoming.length?upcoming.map(g=>`<span class="tp-pill" style="margin:0 6px 8px 0">W${g.week} · ${teamLogo(g.away)}${g.awayName} vs ${teamLogo(g.home)}${g.homeName}</span>`).join(''):'No hay partidos pendientes en el calendario disponible.'}</div></section>
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
 const row=(t,i)=>{const r=t.standingRecords||{};return `<tr><td>${i+1}</td><td class="team-cell"><button class="team-link" data-team-profile="${t.abbr}" type="button">${teamLogo(t.abbr)}<span class="team-full-name">${t.name}</span> <span class="muted">${t.abbr}</span></button></td><td>${t.div}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${pct(t).toFixed(3)}</td><td>${recordText(r.local)}</td><td>${recordText(r.visitor)}</td><td>${recordText(r.division)}</td><td>${recordText(r.conference)}</td><td>${recordText(r.interconference)}</td><td>${fmt(t.points)}</td><td>${fmt(t.pointsAllowed)}</td><td class="${t.diff>0?'winner':t.diff<0?'loser':''}">${t.diff>0?'+':''}${fmt(t.diff)}</td></tr>`;};
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
 $('#power-list').innerHTML=top.map((t,i)=>`<div class="power-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div class="team-id"><span class="team-badge">${teamLogo(t.abbr)}</span><div>${t.name}<div class="team-record">${t.w}-${t.l}-${t.t} · ${t.conf}</div></div></div><span class="power-score">${Math.round(t.pct*100+t.diff/4)}</span></div>`).join('')||'<p class="muted">Sin datos disponibles.</p>';
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
   return `<div class="playoff-row"><span class="seed">${i+1}</span><div class="team-id"><span class="team-badge">${teamLogo(t.abbr)}</span><div class="playoff-team-copy">${t.name}<span class="playoff-abbr">${t.abbr}</span><div class="playoff-record">${t.div} · ${status}</div></div></div><strong>${t.w}-${t.l}-${t.t}</strong></div>`;
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
// Conserva y restaura la pestaña activa inmediatamente, antes de cargar los datos.
const ACTIVE_VIEW_KEY = 'gridiron-lab-active-view';
const savedViewAtStartup = sessionStorage.getItem(ACTIVE_VIEW_KEY);
if(savedViewAtStartup){
 const savedButtonAtStartup = document.querySelector(`.nav-item[data-view="${savedViewAtStartup}"]`);
 if(savedButtonAtStartup){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===savedButtonAtStartup));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+savedViewAtStartup));
  const savedMetaAtStartup = views[savedViewAtStartup];
  if(savedMetaAtStartup){
   $('#page-title').textContent=savedMetaAtStartup[0];
   $('#page-subtitle').textContent=savedMetaAtStartup[1];
  }
 }
}
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
 sessionStorage.setItem(ACTIVE_VIEW_KEY, btn.dataset.view);
 const seasonSelect=$('#season'); const latest=newestSeason();
 if(seasonSelect&&latest&&seasonSelect.value!==latest){seasonSelect.value=latest;loadSeason();}
 if(btn.dataset.view==='partidos') populateWeekFilter(true);
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));
 if(window.matchMedia('(max-width:700px)').matches){
  const nav=btn.closest('.sidebar');
  if(nav){
   const left=btn.offsetLeft-nav.offsetLeft-(nav.clientWidth-btn.offsetWidth)/2;
   nav.scrollTo({left:Math.max(0,left),behavior:'smooth'});
  }
 }
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

 /* GRIDIRON LAB — logos NFL en todas las vistas. Solo presentación. */
 (function addTeamLogoStyles(){
  if(document.getElementById('gridiron-team-logo-styles')) return;
  const style=document.createElement('style');
  style.id='gridiron-team-logo-styles';
  style.textContent=`
   .team-logo{width:27px;height:27px;min-width:27px;min-height:27px;object-fit:contain;display:inline-block!important;flex:0 0 27px;vertical-align:middle;margin-right:9px}
   .team-identity{display:inline-flex;align-items:center;gap:7px;min-width:0;vertical-align:middle}
   .team-identity-name{min-width:0}
   .team-link{display:inline-flex;align-items:center;gap:9px;white-space:nowrap}.team-link .team-logo{width:25px;height:25px;min-width:25px;flex-basis:25px;margin-right:0}
   .game-row-full .team-logo,.game-row-compact .team-logo{width:26px;height:26px;min-width:26px;flex-basis:26px;margin-right:8px}
   .gd-team{display:inline-flex;align-items:center;gap:9px}.gd-team .team-logo{width:28px;height:28px;min-width:28px;flex-basis:28px;margin-right:0}
   .tp-hero .team-logo{width:58px;height:58px;flex-basis:58px}.tp-team-heading{display:flex;align-items:center;gap:12px}.tp-team-heading h1{margin:0}
   .team-badge{width:auto!important;height:auto!important;min-width:0!important;flex:0 0 auto!important;padding:0!important;margin:0 10px 0 0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;display:inline-flex!important;align-items:center;justify-content:center;overflow:visible!important;font-size:0!important;color:transparent!important}.team-badge .team-logo{width:34px;height:34px;min-width:34px;flex-basis:34px;margin:0!important}
   .power-row .team-badge{display:flex;align-items:center;justify-content:center;overflow:hidden}
   @media(max-width:700px){
    .team-logo{width:24px;height:24px;min-width:24px;min-height:24px;flex-basis:24px;display:inline-block!important;margin-right:7px}
    .game-row-full .team-logo,.game-row-compact .team-logo{width:24px;height:24px;min-width:24px;min-height:24px;flex-basis:24px;display:inline-block!important;margin-right:7px}
    .team-identity{gap:5px}
    .team-link{display:inline-flex!important;align-items:center!important;gap:7px!important}.team-link .team-logo{width:22px;height:22px;min-width:22px;flex-basis:22px;margin:0!important}.team-badge .team-logo{width:29px;height:29px;min-width:29px;flex-basis:29px}
   }

   /* Overrides mobile: logos visibles aunque otras reglas compacten tablas. */
   @media(max-width:700px){
    .view table img.team-logo,#team-page-root table img.team-logo,
    .game-row-full img.team-logo,.game-row-compact img.team-logo,
    .team-link img.team-logo,.team-badge img.team-logo{
      display:inline-block!important;visibility:visible!important;opacity:1!important;
      object-fit:contain!important;vertical-align:middle!important;
    }
    .team-badge{background:transparent!important;background-color:transparent!important;box-shadow:none!important;border:0!important;border-radius:0!important;outline:0!important}
    #afc-playoffs .team-badge,#nfc-playoffs .team-badge,
    .playoff-grid .team-badge,.playoff-row .team-badge{
      background:transparent!important;background-color:transparent!important;
      box-shadow:none!important;border:0!important;border-radius:0!important;
      width:34px!important;height:34px!important;min-width:34px!important;
      padding:0!important;margin:0 11px 0 0!important;overflow:visible!important;
    }
    .playoff-row .team-badge img.team-logo{
      width:34px!important;height:34px!important;min-width:34px!important;
      min-height:34px!important;margin:0!important;background:transparent!important;
      object-fit:contain!important;
    }
    .playoff-team-copy{display:flex;align-items:center;flex-wrap:wrap;column-gap:7px;row-gap:2px;min-width:0}
    .playoff-abbr{display:inline!important;font-size:10px!important;font-weight:800!important;
      color:#687382!important;letter-spacing:.04em}
    .playoff-record{flex-basis:100%}
    .team-id{display:flex;align-items:center;gap:0}

    /* TABLAS MOVILES: compactas, con abreviaturas y separadores sutiles. */
    .view table,#team-page-root table{
      border-collapse:separate!important;border-spacing:0!important;
      width:max-content!important;min-width:100%!important;font-size:11px!important;
    }
    .view table th,.view table td,#team-page-root table th,#team-page-root table td{
      padding:7px 6px!important;line-height:1.2!important;
      border-right:1px solid #e1e6eb!important;
      border-bottom:1px solid #e1e6eb!important;
      white-space:nowrap!important;font-variant-numeric:tabular-nums;
    }
    .view table th:last-child,.view table td:last-child,
    #team-page-root table th:last-child,#team-page-root table td:last-child{border-right:0!important}
    .view table thead th,#team-page-root table thead th{
      padding:7px 6px!important;font-size:9px!important;letter-spacing:.025em;
    }
    .view table tbody tr,#team-page-root table tbody tr{height:34px!important}
    .view table td:first-child,#team-page-root table td:first-child{text-align:center}
    /* Clasificación, ofensiva y defensiva: logo + abreviatura, sin nombre largo. */
    .view table .team-link,#team-page-root table .team-link{
      display:inline-flex!important;align-items:center!important;gap:6px!important;
      white-space:nowrap!important;font-size:11px!important;
    }
    .view table .team-link .team-full-name,
    #team-page-root table .team-link .team-full-name{display:none!important}
    .view table .team-link .muted,
    #team-page-root table .team-link .muted{
      display:inline!important;font-size:11px!important;font-weight:800!important;
      color:inherit!important;
    }
    .view table .team-link img.team-logo,
    #team-page-root table .team-link img.team-logo{
      width:21px!important;height:21px!important;min-width:21px!important;
      min-height:21px!important;flex:0 0 21px!important;margin:0 3px 0 0!important;
    }
    /* En partidos se conserva el display:grid definido por el diseño móvil. */
    .game-row-full .team-cell img.team-logo,
    .game-row-compact .team-cell img.team-logo{
      width:22px!important;height:22px!important;min-width:22px!important;
      flex:0 0 22px!important;margin:0 7px 0 0!important;
    }
    .game-row-full .team-cell .muted,
    .game-row-compact .team-cell .muted{display:inline!important;font-size:10px!important}
    /* Playoff Picture: sin placa oscura detrás del escudo. */
    #afc-playoffs .team-badge,#nfc-playoffs .team-badge,
    .playoff-grid .team-badge,.playoff-row .team-badge{
      background:none!important;background-color:transparent!important;
      background-image:none!important;box-shadow:none!important;border:0!important;
      border-radius:0!important;outline:0!important;
      width:31px!important;height:31px!important;min-width:31px!important;
      padding:0!important;margin:0 12px 0 0!important;overflow:visible!important;
    }
    #afc-playoffs .team-badge img.team-logo,#nfc-playoffs .team-badge img.team-logo,
    .playoff-grid .team-badge img.team-logo,.playoff-row .team-badge img.team-logo{
      display:block!important;width:31px!important;height:31px!important;
      min-width:31px!important;min-height:31px!important;flex:0 0 31px!important;
      margin:0!important;background:transparent!important;
    }
    .playoff-row .team-id{display:flex!important;align-items:center!important;gap:0!important}
    .playoff-team-copy{display:flex!important;align-items:baseline!important;
      flex-wrap:wrap!important;column-gap:6px!important;row-gap:2px!important;min-width:0}
    .playoff-abbr{display:inline!important;font-size:10px!important;font-weight:800!important;
      color:#687382!important;letter-spacing:.04em}
    .playoff-record{flex-basis:100%!important;font-size:9px!important;line-height:1.2!important}
    .playoff-row{grid-template-columns:20px minmax(0,1fr) auto!important;gap:7px!important;
      padding:9px 0!important}
   }
  `;
  document.head.appendChild(style);
 })();

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



/* GRIDIRON LAB — RESPONSIVE GLOBAL. Solo afecta pantallas de 700px o menos. */
(function addGlobalMobileStyles(){
 if(document.getElementById('gridiron-global-mobile-styles')) return;
 const style=document.createElement('style');
 style.id='gridiron-global-mobile-styles';
 style.textContent=`
 @media (max-width:700px){
  html,body{max-width:100%;overflow-x:hidden}
  body{font-size:13px;-webkit-text-size-adjust:100%}
  .topbar{height:auto;min-height:58px;padding:10px 13px;gap:8px;flex-wrap:wrap}
  .brand{font-size:15px;letter-spacing:1px;gap:8px;min-width:0}
  .brand-mark{width:29px;height:29px;font-size:22px;flex:0 0 29px}
  .season-chip{font-size:8px;letter-spacing:.5px;padding:6px 8px;max-width:48%;white-space:normal;text-align:center;line-height:1.25}
  .shell{display:block;min-width:0;width:100%}
  .sidebar{position:sticky;top:0;z-index:20;display:flex;flex-direction:row;overflow-x:auto;overflow-y:hidden;white-space:nowrap;gap:4px;padding:7px 8px;background:#0d151c;border-right:0;border-bottom:1px solid var(--line);scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .nav-item{flex:0 0 auto;white-space:nowrap;padding:9px 10px;font-size:10px;gap:6px;border-radius:6px}
  .nav-item span{font-size:13px;width:auto}
  .main{width:100%;max-width:none;min-width:0;margin:0;padding:19px 12px 16px}
  .page-heading{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:17px}
  .page-heading>div:first-child{min-width:0}
  .page-heading h1{font-size:34px;line-height:1.02;margin-bottom:7px;overflow-wrap:anywhere}
  .page-heading .eyebrow{font-size:9px}
  .subheading{font-size:11px;line-height:1.45;max-width:none}
  .controls{width:100%;min-width:0}
  .controls select{width:100%;min-height:42px}
  .demo-banner{margin-bottom:18px;padding:10px 11px;font-size:10px;line-height:1.45}
  .section-head{align-items:flex-start;gap:8px;margin-bottom:12px}
  .section-head h2{font-size:25px;line-height:1.05}
  .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}
  .metric-card{min-width:0;min-height:104px;padding:12px 11px}
  .metric-label{font-size:8px;letter-spacing:.6px;gap:4px;line-height:1.3}
  .metric-label span{font-size:11px}
  .metric-value{font-size:32px;margin:9px 0 4px;overflow-wrap:anywhere}
  .metric-value small{font-size:10px}
  .metric-foot{font-size:9px;line-height:1.35}
  .content-grid{grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:10px}
  .panel{min-width:0;padding:13px;border-radius:8px}
  .panel-heading{gap:8px;margin-bottom:12px;align-items:flex-start}
  .panel-heading h3{font-size:13px;line-height:1.25}
  .panel-heading .eyebrow{font-size:8px;letter-spacing:1px}
  .tag{font-size:8px;padding:4px 5px}
  .chart-wrap{height:210px;max-width:100%;overflow:hidden}
  .power-row{grid-template-columns:20px minmax(0,1fr) auto;gap:7px;padding:10px 0}
  .team-id{gap:7px;min-width:0;font-size:11px}
  .team-badge{width:24px;height:24px;flex:0 0 24px}
  .power-score{font-size:17px}
  .table-panel{padding:0;min-width:0}
  .table-panel .panel-heading{padding:13px 12px 0}
  .table-scroll{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
  .filter-row{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;align-items:stretch;margin-bottom:12px}
  .filter-row label{display:block;width:100%;min-width:0;font-size:9px}
  .filter-row input,.filter-row select{width:100%;min-width:0;max-width:100%;min-height:42px;padding:10px 11px;margin-top:6px;font-size:13px}
  .filter-row>.muted{font-size:10px;line-height:1.4}
  .playoff-grid{grid-template-columns:minmax(0,1fr);gap:10px}
  .playoff-row{grid-template-columns:22px minmax(0,1fr) auto;gap:8px;padding:10px 0}
  .playoff-row .team-id{min-width:0;overflow-wrap:anywhere}
  .playoff-record{font-size:9px}
  .playoff-disclaimer{font-size:10px;line-height:1.5}
  footer{display:grid;grid-template-columns:1fr;gap:7px;padding:15px 0 5px;margin-top:20px;font-size:8px}
  footer span:last-child{width:auto}
  /* Perfil individual del equipo */
  #team-page-root{padding:12px 10px 28px!important;overflow-x:hidden!important}
  #team-page-root .tp-wrap{width:100%;max-width:100%;min-width:0}
  #team-page-root .tp-hero{margin:13px 0;padding:17px 14px;gap:12px}
  #team-page-root h1{font-size:29px;line-height:1.05;overflow-wrap:anywhere}
  #team-page-root .tp-hero-side{width:100%;justify-content:space-between;gap:10px}
  #team-page-root .tp-standing-badges{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  #team-page-root .tp-standing-badges span{font-size:9px;padding:7px 6px;text-align:center}
  #team-page-root .tp-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  #team-page-root .tp-metric-layout{grid-template-columns:minmax(0,1fr);gap:8px}
  #team-page-root .tp-primary-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  #team-page-root .tp-side-metrics{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:none;gap:8px}
  #team-page-root .tp-card{padding:11px 10px;min-width:0}
  #team-page-root .tp-label{font-size:8px;line-height:1.3}
  #team-page-root .tp-value{font-size:21px;overflow-wrap:anywhere}
  #team-page-root .tp-sub{font-size:9px;line-height:1.35}
  #team-page-root .tp-breakdown{gap:8px;align-items:center}
  #team-page-root .tp-donut{width:52px;height:52px;flex-basis:52px}
  #team-page-root .tp-donut:after{inset:8px}
  #team-page-root .tp-donut-legend{font-size:9px;gap:4px;min-width:0}
  #team-page-root .tp-league-compare{font-size:9px;line-height:1.35}
  #team-page-root .tp-table-wrap{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}
  #team-page-root .tp-table{min-width:560px}
  /* Modal/ficha del partido: mantener tres columnas dentro del viewport. */
  #game-detail-modal{padding:7px!important}
  #game-detail-modal .gd-card{width:100%!important;max-width:100%!important;max-height:94dvh!important;padding:13px 10px!important;overflow-x:hidden!important}
  #game-detail-modal .gd-top{gap:8px}
  #game-detail-modal .gd-top>div{min-width:0;flex:1}
  #game-detail-modal h2{font-size:clamp(17px,5vw,22px);line-height:1.2;overflow-wrap:anywhere}
  #game-detail-modal .gd-sub{font-size:10px;line-height:1.35;overflow-wrap:anywhere}
  #game-detail-modal .gd-close{padding:7px 8px;font-size:11px}
  #game-detail-modal .gd-table{width:100%!important;min-width:0!important;table-layout:fixed;font-size:11px}
  #game-detail-modal .gd-table th,#game-detail-modal .gd-table td{padding:8px 4px;white-space:normal;overflow-wrap:anywhere;word-break:normal}
  #game-detail-modal .gd-table th:first-child,#game-detail-modal .gd-table td:first-child{width:36%;font-size:10px}
  #game-detail-modal .gd-table th:nth-child(2),#game-detail-modal .gd-table td:nth-child(2),
  #game-detail-modal .gd-table th:nth-child(3),#game-detail-modal .gd-table td:nth-child(3){width:32%;text-align:center;font-variant-numeric:tabular-nums}
  #game-detail-modal .gd-team{display:block;width:100%;font-size:9px;line-height:1.2;white-space:normal;overflow-wrap:anywhere;text-align:center}
 }
 @media(max-width:390px){
  .main{padding-left:9px;padding-right:9px}
  .metric-card{padding:10px 9px}
  .metric-value{font-size:29px}
  #team-page-root .tp-primary-metrics,#team-page-root .tp-side-metrics{grid-template-columns:minmax(0,1fr)}
  #team-page-root .tp-breakdown{align-items:flex-start}
  #team-page-root .tp-donut{width:46px;height:46px;flex-basis:46px}
 }
 `;
 document.head.appendChild(style);
})();


/* GRIDIRON LAB V5 — calendario consistente en escritorio y móvil */
(function fixGamesLayoutV5(){
 if(document.getElementById('gridiron-games-v5')) return;
 const s=document.createElement('style'); s.id='gridiron-games-v5';
 s.textContent=`
 /* Escritorio: tabla completa, centrada y distribuida sin scroll lateral */
 #view-partidos .table-scroll:has(#games-table){overflow-x:hidden!important}
 #games-table{width:100%!important}
 #games-table:has(tr.game-row-full){ }
 #games-table{ }
 #games-table tr.game-row-full td{vertical-align:middle;text-align:center}
 #games-table tr.game-row-full .game-away,
 #games-table tr.game-row-full .game-home{font-weight:700}
 #games-table tr.game-row-full .game-datetime{white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.35}
 #games-table tr.game-row-full .game-datetime span{display:block}
 #games-table tr.game-row-full .game-week{white-space:nowrap}
 #games-table tr.game-row-full .game-status{white-space:nowrap}
 #games-table{ }
 #games-table:has(tr.game-row-full) td:nth-child(1){width:6%}
 #games-table:has(tr.game-row-full) td:nth-child(2){width:12%}
 #games-table:has(tr.game-row-full) td:nth-child(3){width:20%}
 #games-table:has(tr.game-row-full) td:nth-child(4),
 #games-table:has(tr.game-row-full) td:nth-child(6){width:6%}
 #games-table:has(tr.game-row-full) td:nth-child(5){width:4%}
 #games-table:has(tr.game-row-full) td:nth-child(7){width:20%}
 #games-table:has(tr.game-row-full) td:nth-child(8){width:12%}
 #games-table:has(tr.game-row-full) tr{height:auto}
 #games-table:has(tr.game-row-full) tr td{padding:13px 8px}
 #games-table:has(tr.game-row-full) tr td:nth-child(3),
 #games-table:has(tr.game-row-full) tr td:nth-child(7){overflow-wrap:normal;word-break:normal}
 /* Móvil: tarjetas verticales, sin desplazamiento horizontal */
 @media(max-width:640px){
  #view-partidos .table-scroll:has(#games-table){overflow:visible!important}
  #games-table:has(tr.game-row-full){display:grid!important;grid-template-columns:minmax(0,1fr);gap:9px;padding:8px;width:100%!important}
  thead:has(+ #games-table){display:none!important}
  #games-table tr.game-row-full{display:grid!important;grid-template-columns:minmax(0,1fr) 48px;grid-template-areas:"meta meta" "away awayScore" "home homeScore";align-items:center;gap:0 8px;padding:9px 12px!important;margin:0;background:#fff;border:1px solid #d7dee5;border-radius:11px;box-shadow:0 2px 7px #10203010}
  #games-table tr.game-row-full td{display:block!important;width:auto!important;min-width:0;padding:5px 0!important;border:0!important;text-align:left!important;white-space:normal!important}
  #games-table tr.game-row-full .game-week{grid-area:meta;font-size:10px;color:#687482;font-weight:800;display:inline-block!important}
  #games-table tr.game-row-full .game-datetime{grid-area:meta;justify-self:end;font-size:10px;color:#687482;text-align:right!important;display:block!important}
  #games-table tr.game-row-full .game-datetime span{display:inline}
  #games-table tr.game-row-full .game-datetime span+span:before{content:" · "}
  #games-table tr.game-row-full .game-away{grid-area:away;font-size:14px;font-weight:750;overflow-wrap:normal}
  #games-table tr.game-row-full .game-home{grid-area:home;font-size:14px;font-weight:750;overflow-wrap:normal}
  #games-table tr.game-row-full .game-away-score{grid-area:awayScore;text-align:right!important;font-size:16px;font-weight:850}
  #games-table tr.game-row-full .game-home-score{grid-area:homeScore;text-align:right!important;font-size:16px;font-weight:850}
  #games-table tr.game-row-full .game-at{display:none!important}
  #games-table tr.game-row-full .game-status{display:none!important}
  #games-table tr.game-row-full .muted{font-size:11px}
 }
 `;
 document.head.appendChild(s);
})();
/* GRIDIRON LAB V6 — distribución real de las 8 columnas en escritorio */
(function fixDesktopGamesWidthV6(){
 if(document.getElementById('gridiron-games-desktop-v6')) return;
 const style=document.createElement('style');
 style.id='gridiron-games-desktop-v6';
 style.textContent=`
 @media (min-width:641px){
  #view-partidos .table-panel,
  #view-partidos .table-scroll{width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important}
  #view-partidos .table-scroll{overflow-x:hidden!important}
  #view-partidos table:has(#games-table){display:table!important;width:100%!important;min-width:0!important;max-width:none!important;table-layout:fixed!important;border-collapse:collapse!important;margin:0!important}
  #view-partidos table:has(#games-table) thead{display:table-header-group!important;width:100%!important}
  #view-partidos table:has(#games-table) tbody#games-table{display:table-row-group!important;width:100%!important;min-width:0!important}
  #view-partidos table:has(#games-table) tbody#games-table tr.game-row-full{display:table-row!important;width:100%!important;min-width:0!important;max-width:none!important}
  #view-partidos table:has(#games-table) thead th,
  #view-partidos table:has(#games-table) tbody#games-table tr.game-row-full td{display:table-cell!important;box-sizing:border-box!important;text-align:center!important;vertical-align:middle!important;padding:13px 8px!important;white-space:normal!important}
  #view-partidos table:has(#games-table) thead th:nth-child(1),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(1){width:6%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(2),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(2){width:12%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(3),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(3){width:22%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(4),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(4){width:7%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(5),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(5){width:4%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(6),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(6){width:7%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(7),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(7){width:22%!important}
  #view-partidos table:has(#games-table) thead th:nth-child(8),#view-partidos table:has(#games-table) tbody#games-table td:nth-child(8){width:20%!important}
  #view-partidos table:has(#games-table) tbody#games-table td.game-away,
  #view-partidos table:has(#games-table) tbody#games-table td.game-home{font-weight:700;overflow-wrap:break-word;word-break:normal}
  #view-partidos table:has(#games-table) tbody#games-table td.game-datetime{font-variant-numeric:tabular-nums;line-height:1.35}
  #view-partidos table:has(#games-table) tbody#games-table td.game-datetime span{display:block}
  #view-partidos table:has(#games-table) tbody#games-table td.game-status{white-space:nowrap!important}
 }
 `;
 document.head.appendChild(style);
})();


/* GRIDIRON LAB V8 — restaurar tarjetas móviles de Partidos sin afectar escritorio */
(function restoreMobileGamesCardsV8(){
 if(document.getElementById('gridiron-games-mobile-v8')) return;
 const style=document.createElement('style');
 style.id='gridiron-games-mobile-v8';
 style.textContent=`
 @media (max-width:640px){
  #view-partidos .table-panel,
  #view-partidos .table-scroll{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;overflow:visible!important;box-sizing:border-box!important}
  #view-partidos table:has(> tbody#games-table){display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;table-layout:auto!important;overflow:visible!important;box-sizing:border-box!important}
  #view-partidos table:has(> tbody#games-table) thead{display:none!important}
  #view-partidos table:has(> tbody#games-table) tbody#games-table{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;width:100%!important;max-width:100%!important;min-width:0!important;padding:8px!important;box-sizing:border-box!important}
  #view-partidos table:has(> tbody#games-table) tbody#games-table tr.game-row-full{display:grid!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px!important;grid-template-areas:"week date status" "away away awayScore" "home home homeScore"!important;align-items:center!important;gap:2px 8px!important;margin:0!important;padding:10px 12px!important;background:#fff!important;border:1px solid #d7dee5!important;border-radius:12px!important;box-shadow:0 2px 7px #10203010!important;overflow:hidden!important}
  #view-partidos table:has(> tbody#games-table) tbody#games-table tr.game-row-full td{display:block!important;width:auto!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;padding:5px 0!important;margin:0!important;border:0!important;text-align:left!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
  #view-partidos tbody#games-table tr.game-row-full .game-week{grid-area:week!important;font-size:11px!important;font-weight:800!important;color:#687482!important;white-space:nowrap!important}
  #view-partidos tbody#games-table tr.game-row-full .game-datetime{grid-area:date!important;display:flex!important;justify-content:center!important;gap:5px!important;font-size:11px!important;line-height:1.3!important;color:#687482!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
  #view-partidos tbody#games-table tr.game-row-full .game-datetime span{display:inline!important}
  #view-partidos tbody#games-table tr.game-row-full .game-status{grid-area:status!important;display:block!important;text-align:right!important;font-size:9px!important;font-weight:800!important;white-space:normal!important;overflow-wrap:anywhere!important;color:#687482!important}
  #view-partidos tbody#games-table tr.game-row-full .game-away{grid-area:away!important;font-size:14px!important;font-weight:750!important}
  #view-partidos tbody#games-table tr.game-row-full .game-home{grid-area:home!important;font-size:14px!important;font-weight:750!important}
  #view-partidos tbody#games-table tr.game-row-full .game-away-score{grid-area:awayScore!important;text-align:right!important;font-size:16px!important;font-weight:850!important;white-space:nowrap!important}
  #view-partidos tbody#games-table tr.game-row-full .game-home-score{grid-area:homeScore!important;text-align:right!important;font-size:16px!important;font-weight:850!important;white-space:nowrap!important}
  #view-partidos tbody#games-table tr.game-row-full .game-at{display:none!important}
  #view-partidos tbody#games-table tr.game-row-full .muted{font-size:10px!important}
 }
 `;
 document.head.appendChild(style);
})();


/* GRIDIRON LAB V11 — móvil: navegación fija debajo del encabezado y tarjetas limpias. */
(function mobilePartidosV11(){
 const style=document.createElement('style');
 style.id='gridiron-mobile-v11';
 style.textContent=`
 @media(max-width:700px){
  body{scroll-padding-top:calc(var(--gl-topbar-height,82px) + var(--gl-nav-height,52px))}
  /* Navegación móvil en el flujo; queda sticky al llegar al borde superior. */
  .topbar{position:relative!important;top:auto!important;z-index:1!important;background:#fff!important}
  .shell{padding-top:0!important}
  .shell>.sidebar{position:sticky!important;top:0!important;left:auto!important;right:auto!important;width:100%!important;max-width:100vw!important;z-index:20!important;box-sizing:border-box!important;display:flex!important;flex-direction:row!important;align-items:center!important;overflow-x:auto!important;overflow-y:hidden!important;white-space:nowrap!important;gap:5px!important;padding:7px 10px!important;background:#fff!important;border:0!important;border-bottom:1px solid #d8dee5!important;box-shadow:0 3px 9px #14233418!important;scrollbar-width:none!important;-webkit-overflow-scrolling:touch!important;scroll-behavior:smooth!important}
  .shell>.sidebar::-webkit-scrollbar{display:none!important}
  #game-detail-modal{z-index:20000!important}
  .shell>.sidebar .nav-item{flex:0 0 auto!important;background:transparent!important;color:#596273!important;border:0!important;border-bottom:3px solid transparent!important;border-radius:4px 4px 0 0!important;box-shadow:none!important;padding:10px 12px 8px!important;font-size:12px!important;font-weight:700!important}
  .shell>.sidebar .nav-item span{color:inherit!important}
  .shell>.sidebar .nav-item.active{background:#fff!important;color:#d9272e!important;border-bottom-color:#d9272e!important;box-shadow:none!important}
  #view-partidos .table-panel,#view-partidos .table-scroll{width:100%!important;max-width:100%!important;min-width:0!important;overflow:visible!important}
  #view-partidos table:has(>tbody#games-table){display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;table-layout:auto!important;overflow:visible!important}
  #view-partidos table:has(>tbody#games-table)>thead{display:none!important}
  #view-partidos table:has(>tbody#games-table)>tbody#games-table{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;width:100%!important;max-width:100%!important;min-width:0!important;padding:8px!important;box-sizing:border-box!important}
  #view-partidos tbody#games-table tr.game-row-full{display:grid!important;grid-template-columns:minmax(0,1fr) 42px!important;grid-template-areas:"week date" "away awayScore" "home homeScore"!important;gap:8px 9px!important;align-items:center!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;padding:13px!important;background:#fff!important;border:1px solid #d7dee5!important;border-radius:12px!important;box-shadow:0 2px 7px #10203010!important;overflow:hidden!important}
  #view-partidos tbody#games-table tr.game-row-full>td{display:block!important;width:auto!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important;padding:0!important;border:0!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:left!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-week{grid-area:week!important;font-size:11px!important;font-weight:800!important;color:#697482!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-datetime{grid-area:date!important;justify-self:end!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:3px 6px!important;text-align:right!important;font-size:11px!important;line-height:1.3!important;color:#667381!important;font-variant-numeric:tabular-nums!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-datetime span{display:inline!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-datetime .game-mobile-final{font-weight:800!important;color:#d9272e!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-away{grid-area:away!important;font-size:14px!important;font-weight:750!important;line-height:1.35!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-home{grid-area:home!important;font-size:14px!important;font-weight:750!important;line-height:1.35!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-away-score{grid-area:awayScore!important;text-align:right!important;font-size:17px!important;font-weight:800!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-home-score{grid-area:homeScore!important;text-align:right!important;font-size:17px!important;font-weight:800!important}
  #view-partidos tbody#games-table tr.game-row-full>.game-at,
  #view-partidos tbody#games-table tr.game-row-full>.game-status{display:none!important}
  #view-partidos tbody#games-table tr.game-row-full .muted{font-size:10px!important}
 }
 `;
 document.head.appendChild(style);

 /* FIX DEFINITIVO — tarjetas de partidos en móvil.
    Se aplica al final para ganar a las reglas móviles anteriores.
    No afecta escritorio. */
 if(!document.getElementById('gridiron-games-cards-final')){
  const cardsFix=document.createElement('style');
  cardsFix.id='gridiron-games-cards-final';
  cardsFix.textContent=`
   @media(max-width:700px){
    #games-table{display:grid!important;grid-template-columns:minmax(0,1fr)!important;
      gap:10px!important;width:100%!important;max-width:100%!important;
      padding:8px!important;box-sizing:border-box!important}
    #games-table tr.game-row-full{
      display:grid!important;grid-template-columns:minmax(0,1fr) 44px!important;
      grid-template-areas:"meta meta" "away awayScore" "home homeScore"!important;
      align-items:center!important;gap:7px 9px!important;
      width:100%!important;max-width:100%!important;min-width:0!important;
      height:auto!important;min-height:96px!important;box-sizing:border-box!important;
      padding:12px 13px!important;margin:0!important;
      background:#fff!important;border:1px solid #d7dee5!important;
      border-radius:12px!important;box-shadow:0 2px 7px #10203010!important;
      overflow:hidden!important;
    }
    #games-table tr.game-row-full>td{
      display:block!important;position:static!important;visibility:visible!important;
      opacity:1!important;width:auto!important;max-width:100%!important;min-width:0!important;
      height:auto!important;min-height:0!important;box-sizing:border-box!important;
      padding:0!important;margin:0!important;border:0!important;
      white-space:normal!important;overflow:visible!important;text-align:left!important;
    }
    #games-table tr.game-row-full>.game-week{grid-area:meta!important;justify-self:start!important;
      font-size:11px!important;font-weight:800!important;color:#687482!important}
    #games-table tr.game-row-full>.game-datetime{grid-area:meta!important;justify-self:end!important;
      display:flex!important;gap:4px!important;align-items:center!important;
      font-size:10px!important;line-height:1.25!important;color:#687482!important;
      white-space:nowrap!important;text-align:right!important}
    #games-table tr.game-row-full>.game-away{grid-area:away!important;display:flex!important;
      align-items:center!important;gap:7px!important;font-size:14px!important;
      line-height:1.3!important;font-weight:750!important;overflow-wrap:anywhere!important}
    #games-table tr.game-row-full>.game-home{grid-area:home!important;display:flex!important;
      align-items:center!important;gap:7px!important;font-size:14px!important;
      line-height:1.3!important;font-weight:750!important;overflow-wrap:anywhere!important}
    #games-table tr.game-row-full>.game-away-score{grid-area:awayScore!important;
      display:block!important;text-align:right!important;font-size:17px!important;font-weight:850!important}
    #games-table tr.game-row-full>.game-home-score{grid-area:homeScore!important;
      display:block!important;text-align:right!important;font-size:17px!important;font-weight:850!important}
    #games-table tr.game-row-full>.game-at,
    #games-table tr.game-row-full>.game-status{display:none!important}
    #games-table tr.game-row-full .team-logo{display:inline-block!important;
      width:23px!important;height:23px!important;min-width:23px!important;
      flex:0 0 23px!important;margin:0 3px 0 0!important;object-fit:contain!important}
    #games-table tr.game-row-full .muted{display:inline!important;font-size:10px!important;
      font-weight:700!important;color:#687482!important}
    #view-partidos .table-scroll{overflow:visible!important}
    #view-partidos table:has(>tbody#games-table){display:block!important;
      width:100%!important;max-width:100%!important;min-width:0!important;
      table-layout:auto!important;overflow:visible!important}
    #view-partidos table:has(>tbody#games-table)>thead{display:none!important}
   }
  `;
  document.head.appendChild(cardsFix);
 }
 /* Ajustes de identidad de equipos en móvil: desktop conserva su presentación actual. */
 if(!document.getElementById('gridiron-mobile-team-alignment')){
  const teamMobile=document.createElement('style');
  teamMobile.id='gridiron-mobile-team-alignment';
  teamMobile.textContent=`
   /* Desktop: conservar el encabezado original en una sola línea con VS. */
   @media(min-width:701px){
    #game-detail-modal #gd-title{
      display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap;
    }
    #game-detail-modal .gd-matchup-team{display:inline-flex;align-items:center;gap:7px}
    #game-detail-modal .gd-matchup-vs{display:inline}
    #game-detail-modal .gd-team-name{display:inline}
    #game-detail-modal .gd-team-abbr{display:none}
   }
   @media(max-width:700px){
    #game-detail-modal .gd-top{display:block!important;position:relative!important;padding-right:76px!important}
    #game-detail-modal #gd-title{
      display:flex!important;flex-direction:column!important;align-items:flex-start!important;
      justify-content:flex-start!important;gap:7px!important;
      font-size:clamp(19px,5.1vw,23px)!important;line-height:1.2!important;
    }
    #game-detail-modal .gd-matchup-team{
      display:flex!important;align-items:center!important;gap:10px!important;
      min-width:0!important;width:100%!important;
    }
    #game-detail-modal .gd-matchup-team img.team-logo{
      display:block!important;width:28px!important;height:28px!important;
      min-width:28px!important;flex:0 0 28px!important;margin:0!important;object-fit:contain!important;
    }
    #game-detail-modal .gd-matchup-team>span{display:block!important;min-width:0!important}
    #game-detail-modal .gd-matchup-vs{display:none!important}
    #game-detail-modal .gd-close{position:absolute!important;right:0!important;top:0!important}
    #game-detail-modal .gd-table thead th:nth-child(2),
    #game-detail-modal .gd-table thead th:nth-child(3){text-align:center!important;vertical-align:middle!important}
    #game-detail-modal .gd-team{
      display:flex!important;flex-direction:row!important;align-items:center!important;
      justify-content:center!important;gap:7px!important;width:100%!important;
      min-width:0!important;text-align:center!important;white-space:nowrap!important;
      line-height:1.2!important;
    }
    #game-detail-modal .gd-team img.team-logo{
      display:block!important;width:27px!important;height:27px!important;
      min-width:27px!important;flex:0 0 27px!important;margin:0!important;
      object-fit:contain!important;
    }
    #game-detail-modal .gd-team-name{display:none!important}
    #game-detail-modal .gd-team-abbr{
      display:inline!important;font-size:12px!important;font-weight:800!important;
      color:#ffc247!important;line-height:1.2!important;
    }
    #game-detail-modal .gd-table thead th{padding:9px 4px!important}
    #games-table tr.game-row-full>.game-away,
    #games-table tr.game-row-full>.game-home{
      display:flex!important;align-items:center!important;justify-content:flex-start!important;
      gap:8px!important;text-align:left!important;line-height:1.3!important;
    }
    #games-table tr.game-row-full .team-logo{
      width:24px!important;height:24px!important;min-width:24px!important;
      flex:0 0 24px!important;margin:0!important;object-fit:contain!important;
    }
   }
  `;
  document.head.appendChild(teamMobile);
 }
 const sidebar=document.querySelector('.shell>.sidebar');
 const topbar=document.querySelector('.topbar');
 if(!sidebar||!topbar)return;
 function syncFixedHeader(){
  if(window.matchMedia('(max-width:700px)').matches){
   const topHeight=Math.ceil(topbar.getBoundingClientRect().height);
   const navHeight=Math.ceil(sidebar.getBoundingClientRect().height);
   document.documentElement.style.setProperty('--gl-topbar-height',topHeight+'px');
   document.documentElement.style.setProperty('--gl-nav-height',navHeight+'px');
  }else{
   document.documentElement.style.removeProperty('--gl-topbar-height');
   document.documentElement.style.removeProperty('--gl-nav-height');
  }
 }
 syncFixedHeader();
 window.addEventListener('resize',()=>{syncFixedHeader();renderGames();},{passive:true});
 window.addEventListener('orientationchange',()=>{syncFixedHeader();renderGames();},{passive:true});
 if(typeof ResizeObserver!=='undefined'){
  const ro=new ResizeObserver(syncFixedHeader);ro.observe(sidebar);ro.observe(topbar);
 }
})();