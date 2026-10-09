(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { name: 'Chennai', admin1: 'Tamil Nadu', country: 'India', latitude: 13.0827, longitude: 80.2707 };
  let map, marker, historyChart, forecastChart, compositionChart, loading = false, pendingReload = false, lastPayload = null;
  const gas = [
    {key:'pm2_5', label:'PM₂.₅', id:'pm25'}, {key:'pm10', label:'PM₁₀', id:'pm10'},
    {key:'nitrogen_dioxide', label:'NO₂', id:'no2'}, {key:'sulphur_dioxide', label:'SO₂', id:'so2'},
    {key:'ozone', label:'O₃', id:'o3'}, {key:'carbon_monoxide', label:'CO', id:'co'}
  ];
  const fmt = (v, digits=1) => v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits).replace(/\.0$/,'');
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(message, type='') { $('status').textContent = message; $('status').className = `status ${type}`; }
  function category(aqi) {
    if (aqi == null || !Number.isFinite(Number(aqi))) return {label:'Unavailable',color:'#8ba0b4',advice:'The provider did not return an AQI for the latest available timestamp.'};
    const n=Number(aqi);
    if(n<=50)return {label:'Good',color:'#54e0c0',advice:'Air quality is generally satisfactory. Continue checking local conditions.'};
    if(n<=100)return {label:'Moderate',color:'#f6d66a',advice:'Unusually sensitive people may wish to reduce prolonged, strenuous outdoor activity.'};
    if(n<=150)return {label:'Unhealthy for sensitive groups',color:'#ffae65',advice:'Children, older adults, and people with heart or lung conditions should consider reducing strenuous outdoor activity.'};
    if(n<=200)return {label:'Unhealthy',color:'#ff6f83',advice:'Consider reducing prolonged outdoor exertion and follow local health guidance.'};
    if(n<=300)return {label:'Very unhealthy',color:'#bb9aff',advice:'Reduce outdoor exposure and follow local public-health advisories.'};
    return {label:'Hazardous',color:'#ff5872',advice:'Avoid outdoor exertion where possible and follow official public-health advisories.'};
  }
  function initMap() {
    const el=$('map');
    if(!el || !window.L) { $('coords').textContent='Map library unavailable — check internet/CDN access'; return; }
    map=L.map(el,{zoomControl:false}).setView([state.latitude,state.longitude],9);
    L.control.zoom({position:'bottomright'}).addTo(map);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'});
    tiles.addTo(map);
    marker=L.marker([state.latitude,state.longitude]).addTo(map).bindPopup('Selected analysis region');
    setTimeout(()=>map.invalidateSize(),250);
  }
  function updateMap() {
    $('coords').textContent=`${Number(state.latitude).toFixed(4)}, ${Number(state.longitude).toFixed(4)}`;
    if(!map) return;
    const point=[Number(state.latitude),Number(state.longitude)];
    map.setView(point,9); if(marker) marker.setLatLng(point).bindPopup(`<b>${safe(state.name)}</b><br>Selected analysis region`);
    setTimeout(()=>map.invalidateSize(),180);
  }
  async function json(url) {
    const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  async function searchRegions() {
    const query=$('cityInput').value.trim();
    if(query.length<2){status('Enter at least two characters to search.','error');return;}
    const btn=$('searchBtn'); btn.disabled=true; btn.textContent='Searching…';
    try {
      const results=await json(`/api/search?q=${encodeURIComponent(query)}`);
      const box=$('searchResults'); box.replaceChildren();
      if(!results.length){box.style.display='block';const empty=document.createElement('div');empty.className='result-option';empty.textContent='No matching locations found. Try a nearby city.';box.appendChild(empty);status('No matching locations found.','error');return;}
      results.forEach(place=>{
        const button=document.createElement('button');button.type='button';button.className='result-option';
        const title=document.createElement('span');title.textContent=place.name;
        const small=document.createElement('small');small.textContent=[place.admin2,place.admin1,place.country].filter(Boolean).join(', ')+(place.population?` · population ${Number(place.population).toLocaleString()}`:'');
        button.append(title,small);
        button.addEventListener('click',async()=>{
          state.name=place.name;state.admin1=place.admin1||'';state.country=place.country||'';state.latitude=Number(place.latitude);state.longitude=Number(place.longitude);
          $('selectedRegion').textContent=[state.name,state.admin1,state.country].filter(Boolean).join(', ');
          $('cityInput').value=state.name;box.style.display='none';updateMap();
          await loadAir();
        });
        box.appendChild(button);
      });
      box.style.display='block'; status(`Found ${results.length} candidates. Check the state/region and country before selecting; similar place names can exist in different countries.`,'success');
    } catch(error){status(error.message,'error');}
    finally{btn.disabled=false;btn.textContent='Find region';}
  }
  function renderCurrent(d) {
    const c=d.current||{}, aqi=c.us_aqi, cat=c.category||category(aqi);
    $('aqiValue').textContent=aqi==null?'—':Math.round(aqi);
    $('aqiTitle').textContent=cat.label||'Unavailable'; $('aqiAdvice').textContent=cat.advice||'No guidance available.';
    $('aqiBadge').textContent=cat.label||'Unavailable'; $('aqiBadge').className=`badge ${cat.color||'neutral'}`;
    $('aqiRing').style.setProperty('--ring-color',cat.color||'#8ba0b4');
    $('aqiRing').style.setProperty('--ring-progress',`${Math.max(0,Math.min(100,(Number(aqi)||0)/300*100))}%`);
    $('dataTime').textContent=`Latest provider timestamp: ${c.time||'not supplied'} · Time zone: ${d.timezone||'provider local time'}`;
    gas.forEach(p=>$(p.id).textContent=fmt(c[p.key]));
    $('insightTitle').textContent=aqi==null?'AQI unavailable':`AQI ${Math.round(aqi)} · ${cat.label}`;
    $('insightText').textContent=`${cat.advice} Values are provider estimates at the selected coordinates, not guaranteed readings from a physical monitor.`;
    const tips=Number(aqi)<=50?['Conditions are generally suitable for usual outdoor activity; follow local alerts.','Avoid unnecessary vehicle idling and indoor smoke.','Check again later because pollution can change by hour.']:Number(aqi)<=100?['Sensitive people should monitor symptoms and local advisories.','Consider routes away from heavy traffic when practical.','Reduce unnecessary combustion and vehicle idling.']:['Consider reducing strenuous outdoor activity, especially for sensitive groups.','Use official local public-health guidance during pollution events.','If outdoor conditions are poor, consider cleaner indoor air where available.'];
    $('recommendations').innerHTML=tips.map((t,i)=>`<div class="recommendation"><span>0${i+1}</span><p>${safe(t)}</p></div>`).join('');
  }
  function chartOptions(axis) { return {responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{color:'#a9bfd2',usePointStyle:true,boxWidth:7,font:{size:10}}},tooltip:{backgroundColor:'#091725',titleColor:'#eef6ff',bodyColor:'#b8cad9',borderColor:'#31495c',borderWidth:1}},scales:{x:{ticks:{color:'#7f96aa',maxTicksLimit:8,maxRotation:0,font:{size:9}},grid:{display:false},border:{display:false}},y:{beginAtZero:true,ticks:{color:'#7f96aa',font:{size:9}},grid:{color:'rgba(160,190,215,.09)'},border:{display:false},title:{display:true,text:axis,color:'#7f96aa',font:{size:10}}}}}; }
  function destroy(chart){if(chart)chart.destroy();}
  function renderCharts(d) {
    if(!window.Chart){status('Chart library could not load. Check your internet/CDN access.','error');return;}
    const hist=d.history||[], pred=d.prediction||[];
    const rows=hist.filter(r=>r.us_aqi!=null).slice(-168);
    destroy(historyChart); historyChart=new Chart($('historyChart'),{type:'line',data:{labels:rows.map(r=>String(r.time).replace('T',' ').slice(5,16)),datasets:[{label:'Provider AQI',data:rows.map(r=>r.us_aqi),borderColor:'#54e0c0',backgroundColor:'rgba(84,224,192,.10)',fill:true,tension:.25,pointRadius:0,borderWidth:2}]},options:chartOptions('US AQI')});
    const metric=$('forecastMetric')?.value||'us_aqi';
    const meta={us_aqi:{label:'US AQI',unit:'AQI'},pm2_5:{label:'PM₂.₅',unit:'µg/m³'},pm10:{label:'PM₁₀',unit:'µg/m³'},nitrogen_dioxide:{label:'NO₂',unit:'µg/m³'},sulphur_dioxide:{label:'SO₂',unit:'µg/m³'},ozone:{label:'O₃',unit:'µg/m³'},carbon_monoxide:{label:'CO',unit:'µg/m³'}}[metric]||{label:metric,unit:'provider units'};
    const observed=hist.filter(r=>r[metric]!=null).slice(-48); const projected=pred.filter(r=>r[metric]!=null);
    const joined=[...(observed.length?[observed.at(-1)[metric]]:[]),...projected.map(r=>r[metric])];
    const labels=[...(observed.length?[`Last observed ${String(observed.at(-1).time).slice(11,16)}`]:[]),...projected.map(r=>r.time)];
    destroy(forecastChart); forecastChart=new Chart($('forecastChart'),{type:'line',data:{labels,datasets:[{label:`${meta.label} observed anchor + estimate`,data:joined,borderColor:'#a58bff',backgroundColor:'rgba(165,139,255,.08)',fill:false,tension:.2,pointRadius:1,borderWidth:2,borderDash:[5,4]}]},options:chartOptions(meta.unit)});
    const latest=hist.at(-1)||d.current||{};
    const points=gas.filter(g=>latest[g.key]!=null);
    destroy(compositionChart);
    compositionChart=new Chart($('compositionChart'),{type:'bar',data:{labels:points.map(g=>g.label),datasets:[{label:'Concentration (µg/m³)',data:points.map(g=>latest[g.key]),backgroundColor:['#54e0c0','#68a9ff','#ffca72','#ff8b9a','#a58bff','#58c9d8'],borderRadius:5}]},options:{...chartOptions('µg/m³'),indexAxis:'y',plugins:{...chartOptions('µg/m³').plugins,legend:{display:false}}}});
    const metricForEval=$('forecastMetric')?.value||'us_aqi'; const ev=metricForEval==='us_aqi'?(d.model?.aqi_evaluation||{}):(d.model?.evaluation?.[metricForEval]||{}); const label=metricForEval==='us_aqi'?'AQI':(gas.find(g=>g.key===metricForEval)?.label||metricForEval);
    $('modelLabel').textContent=`${d.model?.name||'Transparent baseline'} · ${ev.mae==null?'Validation MAE unavailable':`Walk-forward MAE ${fmt(ev.mae)} ${label}; RMSE ${fmt(ev.rmse)} ${label}; ${ev.samples||0} validation samples`}. Lower error is better; this is not a confidence score.`;
  }
  async function loadAir() {
    if(loading){pendingReload=true;return;}
    loading=true; pendingReload=false;
    const requestedLat=Number(state.latitude), requestedLon=Number(state.longitude);
    const btn=$('loadBtn');btn.disabled=true;btn.textContent='Loading provider data…';status('Fetching provider data for the selected coordinates…');
    try {
      const d=await json(`/api/air?lat=${encodeURIComponent(requestedLat)}&lon=${encodeURIComponent(requestedLon)}`);
      if(!d.current||!Array.isArray(d.history)||!Array.isArray(d.prediction))throw new Error('Unexpected API response structure. Check app.py.');
      // Never display a slow response for an older location under a newly selected city.
      if(requestedLat!==Number(state.latitude)||requestedLon!==Number(state.longitude)){pendingReload=true;return;}
      $('selectedRegion').textContent=[state.name,state.admin1,state.country].filter(Boolean).join(', ');$('connectionLabel').textContent='Connected';
      lastPayload=d;renderCurrent(d);renderCharts(d);updateMap();
      status(`Loaded ${d.history.length} historical time points from ${d.source}. ${d.source_note||''}`,'success');
    } catch(error){$('connectionLabel').textContent='Unavailable';status(`${error.message} No synthetic readings have been substituted.`,'error');}
    finally{
      loading=false;btn.disabled=false;btn.innerHTML='↗ &nbsp; Load air quality';
      if(pendingReload){pendingReload=false;loadAir();}
    }
  }
  $('searchBtn').addEventListener('click',searchRegions);
  $('loadBtn').addEventListener('click',loadAir);
  $('forecastMetric')?.addEventListener('change',()=>{if(lastPayload)renderCharts(lastPayload);});
  $('cityInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchRegions();});
  document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>{document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:'smooth'});document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));button.classList.add('active');}));
  document.addEventListener('click',e=>{if(!e.target.closest('.search-controls'))$('searchResults').style.display='none';});
  window.addEventListener('resize',()=>{map?.invalidateSize();});
  initMap();updateMap();loadAir();
})();
