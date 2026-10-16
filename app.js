const $ = s => document.querySelector(s);
const fmt = n => Math.round(Number(n)||0).toLocaleString('es-MX');
let allData = null;
let teams = [];
let games = [];
let offenseChart = null;
const views = {
  overview:["El juego, en números.","Estadísticas, tendencias y contexto para cada enfrentamiento."],
  partidos:["Partidos","Resultados, calendario y registros de cada juego."],
  ofensiva:["Ofensiva","Producción aérea, terrestre y puntos anotados."],
  defensiva:["Defensiva","Yardas y puntos permitidos por equipo."],
  tabla:["Tabla de posiciones","Récords, diferenciales y clasificación por conferencia."],
  playoffs:["Playoff Picture","Panorama de clasificación rumbo a la postemporada."]
};
function teamName(abbr){return teams.find(t=>t.abbr===abbr)?.name || abbr}
function pct(t){return Number(t.pct)||0}
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
 const q=($('#offense-search')?.value||'').toLowerCase(),sort=$('#offense-sort')?.value||'totalYards';
 const keys={yards:'totalYards',points:'points',pass:'pass',rush:'rush'};
 const key=keys[sort]||sort;
 const list=teams.filter(t=>(t.name+' '+t.abbr).toLowerCase().includes(q)).sort((a,b)=>(Number(b[key])||0)-(Number(a[key])||0));
 $('#offense-table').innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td><td>${t.gp}</td><td>${fmt(t.totalYards)}</td><td>${t.gp?fmt(t.totalYards/t.gp):'—'}</td><td>${fmt(t.pass)}</td><td>${fmt(t.rush)}</td><td>${fmt(t.points)}</td><td>${t.gp?(t.points/t.gp).toFixed(1):'—'}</td></tr>`).join('')||'<tr><td colspan="9">Sin resultados.</td></tr>';
}
function renderDefense(){
 const q=($('#defense-search')?.value||'').toLowerCase(),sort=$('#defense-sort')?.value||'yardsAllowed';
 const list=teams.filter(t=>(t.name+' '+t.abbr).toLowerCase().includes(q)).sort((a,b)=>(Number(a[sort])||0)-(Number(b[sort])||0));
 $('#defense-table').innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td><td>${t.gp}</td><td>${fmt(t.yardsAllowed)}</td><td>${t.gp?fmt(t.yardsAllowed/t.gp):'—'}</td><td>${fmt(t.passAllowed)}</td><td>${fmt(t.rushAllowed)}</td><td>${fmt(t.pointsAllowed)}</td><td>${t.gp?(t.pointsAllowed/t.gp).toFixed(1):'—'}</td></tr>`).join('')||'<tr><td colspan="9">Sin resultados.</td></tr>';
}
function renderStandings(){
 const conf=$('#conference-filter')?.value||'all';
 const list=teams.filter(t=>conf==='all'||t.conf===conf).sort((a,b)=>pct(b)-pct(a)||b.diff-a.diff);
 $('#standings-table').innerHTML=list.map((t,i)=>`<tr><td>${i+1}</td><td class="team-cell">${t.name} <span class="muted">${t.abbr}</span></td><td>${t.div}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${pct(t).toFixed(3)}</td><td>${fmt(t.points)}</td><td>${fmt(t.pointsAllowed)}</td><td class="${t.diff>0?'winner':''}">${t.diff>0?'+':''}${fmt(t.diff)}</td></tr>`).join('')||'<tr><td colspan="10">Sin datos para esta conferencia.</td></tr>';
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
 const banner=$('.demo-banner');
 if(banner) banner.innerHTML='<span>DATOS CONECTADOS</span> Fuente: nflverse · Actualización: '+(allData.updatedAt?new Date(allData.updatedAt).toLocaleString('es-MX'):'sin fecha')+'. Los datos dependen de la publicación de la fuente.';
 const chip=$('.season-chip'); if(chip) chip.innerHTML='<span class="live-dot"></span> NFL · TEMPORADA '+currentSeason();
}
function renderChart(){
 if(!window.Chart||!$('#offenseChart'))return;
 const top=[...teams].sort((a,b)=>b.totalYards-a.totalYards).slice(0,6);
 if(offenseChart) offenseChart.destroy();
 offenseChart=new Chart($('#offenseChart'),{type:'bar',data:{labels:top.map(t=>t.abbr),datasets:[{label:'Yardas totales',data:top.map(t=>t.gp?Math.round(t.totalYards/t.gp):0),backgroundColor:top.map((_,i)=>i===0?'#f0b323':'#4b9bd8'),borderRadius:2,maxBarThickness:28}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0c1319'}},scales:{x:{grid:{display:false},ticks:{color:'#9aabb7',font:{size:10}},border:{display:false}},y:{grid:{color:'#2a3944'},ticks:{color:'#8294a1',font:{size:10}},border:{display:false}}}}});
}
function currentSeason(){return $('#season')?.value||String(new Date().getFullYear())}
function loadSeason(){
 const key=currentSeason();
 const data=allData?.seasons?.[key];
 if(!data){
  teams=[];games=[];
  const banner=$('.demo-banner'); if(banner) banner.innerHTML='<span>SIN DATOS</span> No hay datos publicados para la temporada '+key+'. Prueba otra temporada.';
 } else { teams=data.teams||[]; games=data.games||[]; }
 renderGames();renderOffense();renderDefense();renderStandings();renderPower();renderPlayoffs();renderMetrics();renderChart();
}
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+btn.dataset.view));
 $('#page-title').textContent=views[btn.dataset.view][0];$('#page-subtitle').textContent=views[btn.dataset.view][1];
}));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>document.querySelector(`[data-view="${btn.dataset.go}"]`)?.click()));
['game-search','week-filter'].forEach(id=>$('#'+id)?.addEventListener('input',renderGames));
['offense-search','offense-sort'].forEach(id=>$('#'+id)?.addEventListener('input',renderOffense));
['defense-search','defense-sort'].forEach(id=>$('#'+id)?.addEventListener('input',renderDefense));
$('#conference-filter')?.addEventListener('change',renderStandings);
$('#season')?.addEventListener('change',loadSeason);
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
  loadSeason();
 }catch(error){
  console.error(error);
  const banner=$('.demo-banner');if(banner)banner.innerHTML='<span>ERROR DE DATOS</span> No se pudo cargar data/nfl.json. Ejecuta el flujo “Update NFL data” en GitHub Actions.';
  $('#games-table').innerHTML='<tr><td colspan="7">No se pudieron cargar los datos.</td></tr>';
 }
}
init();
