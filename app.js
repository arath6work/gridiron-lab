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
function renderSortable(kind){if(kind==='offense')renderOffense();if(kind==='defense')renderDefense();if(kind==='standings')renderStandings();document.querySelectorAll(`th[data-sort-table="${kind}"][data-sort-key]`).forEach(th=>{const s=tableSort[kind];th.classList.toggle('sort-active',th.dataset.sortKey===s.key);const base=th.dataset.label||th.textContent.replace(/[ ↑↓↕]+$/,'');th.dataset.label=base;th.textContent=base+(th.dataset.sortKey===s.key?(s.dir==='asc'?' ↑':' ↓'):' ↕');});}
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
  ? `<tr><td>W${g.week}</td><td class="team-cell">${g.awayName} <span class="muted">(${g.away})</span></td><td class="score">${score}</td><td class="team-cell">${g.homeName} <span class="muted">(${g.home})</span></td><td><span class="${status==='FINAL'?'status-final':'muted'}">${status}</span></td></tr>`
  : `<tr><td>W${g.week}</td><td class="team-cell">${g.awayName} <span class="muted">(${g.away})</span></td><td class="score">${g.awayPts ?? '—'}</td><td>@</td><td class="score">${g.homePts ?? '—'}</td><td class="team-cell">${g.homeName} <span class="muted">(${g.home})</span></td><td><span class="${status==='FINAL'?'status-final':'muted'}">${status}</span></td></tr>`;
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
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td>`+cols.map(([label,key])=>{const v=t[key];let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPct'?(Number(v)*100).toFixed(1)+'%':(['passAvg','rushAvg','receivingAvg','passerRating','yardsPerGame','passPerGame','rushPerGame','receivingPerGame','pointsPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
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
 table.innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td>`+cols.map(([label,key])=>{const v=t[key];let out=v==null?'—':key.toLowerCase().includes('rate')||key==='passPctAllowed'?(Number(v)*100).toFixed(1)+'%':(['passAvgAllowed','rushAvgAllowed','receivingAvgAllowed','passerRatingAllowed','yardsAllowedPerGame','passAllowedPerGame','rushAllowedPerGame','receivingAllowedPerGame','pointsAllowedPerGame'].includes(key)?Number(v||0).toFixed(1):fmt(v));return `<td>${out}</td>`}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length+2}">Sin resultados.</td></tr>`;
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
 if(standingsView==='league'){el.hidden=true;el.innerHTML='';return;}
 el.hidden=false;
 const items=standingsView==='conference'?[['AFC','Conferencia Americana'],['NFC','Conferencia Nacional']]:divisions.map(d=>[d,d.replace('AFC','AFC').replace('NFC','NFC')]);
 el.innerHTML=items.map(([value,label])=>`<button type="button" class="seg-tab sub-tab ${standingsSubfilter===value?'active':''}" data-standings-filter="${value}" aria-pressed="${standingsSubfilter===value}">${label}</button>`).join('');
 el.querySelectorAll('[data-standings-filter]').forEach(btn=>btn.addEventListener('click',()=>{standingsSubfilter=btn.dataset.standingsFilter;renderStandingsSubfilters();renderStandings();}));
}
function renderStandings(){
 computeStandingsRecords();
 let filtered=[...teams];
 if(standingsView==='conference'&&standingsSubfilter!=='all')filtered=filtered.filter(t=>t.conf===standingsSubfilter);
 if(standingsView==='division'&&standingsSubfilter!=='all')filtered=filtered.filter(t=>t.div===standingsSubfilter);
 const state=tableSort.standings;
 filtered.sort((a,b)=>{const av=sortValue(a,state.key),bv=sortValue(b,state.key);const cmp=typeof av==='string'?String(av).localeCompare(String(bv)):((Number(av)||0)-(Number(bv)||0));return (state.dir==='asc'?cmp:-cmp)||String(a.name).localeCompare(String(b.name));});
 const columns=[['G','w'],['P','l'],['E','t'],['PCT','pct'],['LOCAL','local'],['VIS','visitor'],['DIV','division'],['CONF','conference'],['INTERCONF','interconference'],['PF','points'],['PC','pointsAllowed'],['DIF.','diff']];
 const head=$('#standings-head'); if(head)head.innerHTML='<tr><th>#</th><th>EQUIPO</th><th>DIVISIÓN</th>'+columns.map(([label,key])=>`<th data-sort-table="standings" data-sort-key="${key}">${label}</th>`).join('')+'</tr>';
 $('#standings-table').innerHTML=filtered.map((t,i)=>{const r=t.standingRecords||{};return `<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td><td>${t.div}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${pct(t).toFixed(3)}</td><td>${recordText(r.local)}</td><td>${recordText(r.visitor)}</td><td>${recordText(r.division)}</td><td>${recordText(r.conference)}</td><td>${recordText(r.interconference)}</td><td>${fmt(t.points)}</td><td>${fmt(t.pointsAllowed)}</td><td class="${t.diff>0?'winner':''}">${t.diff>0?'+':''}${fmt(t.diff)}</td></tr>`;}).join('')||'<tr><td colspan="15">Sin datos para esta selección.</td></tr>';
}
function renderPower(){
 const top=[...teams].sort((a,b)=>(b.diff+b.pct*20)-(a.diff+a.pct*20)).slice(0,5);
 $('#power-list').innerHTML=top.map((t,i)=>`<div class="power-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div class="team-id"><span class="team-badge">${t.abbr}</span><div>${t.name}<div class="team-record">${t.w}-${t.l}-${t.t} · ${t.conf}</div></div></div><span class="power-score">${Math.round(t.pct*100+t.diff/4)}</span></div>`).join('')||'<p class="muted">Sin datos disponibles.</p>';
}
function renderPlayoffs(){
 for(const conf of ['AFC','NFC']){
  const list=teams.filter(t=>t.conf===conf).sort((a,b)=>pct(b)-pct(a)||b.diff-a.diff).slice(0,7);
  $('#'+conf.toLowerCase()+'-playoffs').innerHTML=list.map((t,i)=>`<div class="playoff-row"><span class="seed">${i+1}</span><div class="team-id"><span class="team-badge">${t.abbr}</span><div>${t.name}<div class="playoff-record">${t.div}</div></div></div><strong>${t.w}-${t.l}-${t.t}</strong></div>`).join('')||'<p class="muted">Sin datos disponibles.</p>';
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

function populateWeekFilter() {
  const select = $('#week-filter');
  if (!select) return;

  const selected = select.value || 'all';
  const weeks = [...new Set(
    games.map(g => Number(g.week)).filter(Number.isFinite)
  )].sort((a, b) => a - b);

  select.innerHTML =
    '<option value="all">Todas</option>' +
    weeks.map(w =>
      `<option value="${w}">Semana ${w}</option>`
    ).join('');

  select.value = weeks.includes(Number(selected)) ? selected : 'all';
}

function loadSeason(){
 const key=currentSeason();
 const chip=document.querySelector('.season-chip'); if(chip) chip.innerHTML=`<span class="live-dot"></span> NFL · TEMPORADA ${key} · ${($('#game-type')?.value||'REG')==='POST'?'PLAYOFFS':'REGULAR'}`;
 const seasonData=allData?.seasons?.[key];
 const type=$('#game-type')?.value||'REG';
 const data=seasonData?.types?.[type] || (type==='REG'?seasonData:null);
 if(!data){ teams=[]; games=[]; } else { teams=data.teams||[]; games=data.games||[]; }
 populateWeekFilter();
renderGames();renderOffense();renderDefense();renderStandings();renderSortable('offense');renderSortable('defense');renderPower();renderPlayoffs();renderMetrics();renderChart();
}
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
 const seasonSelect=$('#season'); const latest=newestSeason();
 if(seasonSelect&&latest&&seasonSelect.value!==latest){seasonSelect.value=latest;loadSeason();}
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
 standingsView=btn.dataset.standingsView; standingsSubfilter=standingsView==='conference'?'AFC':standingsView==='division'?'AFC East':'all';
 document.querySelectorAll('[data-standings-view]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',String(b===btn));});
 renderStandingsSubfilters(); renderStandings();
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
 }catch(error){
  console.error(error);
  $('#games-table').innerHTML='<tr><td colspan="7">No se pudieron cargar los datos.</td></tr>';
 }
}
init();

document.addEventListener('click', e=>{const th=e.target.closest('th[data-sort-table][data-sort-key]'); if(!th)return; const kind=th.dataset.sortTable,key=th.dataset.sortKey,state=tableSort[kind]; if(!state)return; if(state.key===key)state.dir=state.dir==='desc'?'asc':'desc';else{state.key=key;state.dir=kind==='defense'?'asc':'desc';} renderSortable(kind);});
