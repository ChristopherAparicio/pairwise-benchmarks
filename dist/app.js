'use strict';
(() => {
  const data = window.BENCHMARK_DATA;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sources = new Map(data.sources.map(s => [s.id, s]));
  const protocols = new Map(data.protocols.map(p => [p.id, p]));
  const sourceOrigins = new Map([['redhat','https://huggingface.co'],['openbench','https://openbench.run'],['harnessbench','https://www.harness-bench.ai']]);
  const records = data.evaluations;
  const controls = ['harness','publisher','model','pair','source','category'];
  const multiControls = ['model','harness','publisher'];
  const filterValues = Object.fromEntries(controls.map(id=>[id,[...new Set(records.map(r=>r[id]))].sort((a,b)=>a.localeCompare(b,'en'))]));
  const modelProviders = new Map(records.map(r=>[r.model,r.publisher]));
  const storageKey = 'pairwise:last-search:v1';
  const defaultProtocol = 'all';
  let state = {view:'results', protocol:defaultProtocol, metric:'score', search:'', publisher:[], model:[], harness:[], pair:'', source:'', category:'', sort:'score', direction:-1};
  let restoredSearch = false;
  let toastTimer;
  const pct = value => value == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value * 100) + '%';
  const num = value => value == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
  const duration = value => value == null ? '—' : value < 60 ? Math.round(value) + ' s' : value < 3600 ? (value / 60).toLocaleString('en-US',{maximumFractionDigits:1}) + ' min' : (value / 3600).toLocaleString('en-US',{maximumFractionDigits:1}) + ' h';
  const cost = value => value == null || value <= 0 ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:3}).format(value);
  const shortDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : 'Not reported';
  const sourceIcon = id => `<span class="source-icon ${escape(id)}" aria-hidden="true">${escape(sources.get(id).monogram)}</span>`;
  const publisherIcon = publisher => `<span class="publisher-mark ${publisher==='OpenAI'?'openai':publisher==='Anthropic'?'anthropic':publisher==='Z.ai'?'zai':''}" aria-hidden="true">${publisher==='OpenAI'?'✳':publisher==='Anthropic'?'✺':publisher==='Z.ai'?'z':publisher==='Alibaba'?'Q':publisher==='Google'?'G':publisher==='DeepSeek'?'≈':publisher.slice(0,1)}</span>`;

  function safeSourceUrl(value, source) {
    if(typeof value!=='string'||/[\\\u0000-\u0020\u007f]/.test(value)||/^https:\/\/[^/?#]*@/i.test(value))return null;
    try {
      const url=new URL(value);
      return url.protocol==='https:'&&!url.username&&!url.password&&url.origin===sourceOrigins.get(source)?url.href:null;
    } catch {return null;}
  }
  function options(id, values, all) {
    const selected = $(id).value;
    $(id).innerHTML = `<option value="">${all}</option>` + [...new Set(values)].sort((a,b)=>a.localeCompare(b,'en')).map(value=>`<option value="${escape(value)}">${escape(id==='publisher'&&value==='Anthropic'?'Anthropic (Claude)':value)}</option>`).join('');
    $(id).value = selected;
  }
  options('pair', records.map(r=>r.pair),'All pairings');
  options('category', data.protocols.map(p=>p.category),'All categories');
  $('source').innerHTML += data.sources.map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join('');
  $('stat-evaluations').textContent = records.length;
  $('stat-models').textContent = new Set(records.map(r=>r.model)).size;
  $('stat-harnesses').textContent = new Set(records.map(r=>r.harness)).size;

  function searchKey(value) {return value.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu,'');}
  function choiceLabel(id,value) {return id==='publisher'&&value==='Anthropic'?'Anthropic (Claude)':value;}
  function closeChoices() {
    multiControls.forEach(id=>{$(id+'-options').hidden=true;$(id+'-input').setAttribute('aria-expanded','false');$(id+'-input').removeAttribute('aria-activedescendant');});
  }
  function renderChoices(id) {
    const input=$(id+'-input'), list=$(id+'-options');
    $(id+'-chips').innerHTML=state[id].map(value=>`<button type="button" class="choice-chip" data-remove-choice="${id}" data-value="${escape(value)}" aria-label="Remove ${id==='publisher'?'provider':id} ${escape(choiceLabel(id,value))}">${escape(choiceLabel(id,value))}<span aria-hidden="true">×</span></button>`).join('');
    const terms=input.value.trim().split(/\s+/).map(searchKey).filter(Boolean);
    const matches=filterValues[id].filter(value=>terms.every(term=>searchKey(choiceLabel(id,value)+(id==='model'?' '+choiceLabel('publisher',modelProviders.get(value)):'')).includes(term)));
    const optionMarkup=value=>`<li id="${id}-option-${filterValues[id].indexOf(value)}" role="option" aria-selected="${state[id].includes(value)}" data-choice="${id}" data-value="${escape(value)}"><span>${escape(choiceLabel(id,value))}</span><span aria-hidden="true">${state[id].includes(value)?'✓':'+'}</span></li>`;
    if(!matches.length)list.innerHTML='<li class="choice-empty" role="presentation">No matching options in these snapshots</li>';
    else if(id==='model') {
      const providers=[...new Set(matches.map(value=>modelProviders.get(value)))].sort((a,b)=>choiceLabel('publisher',a).localeCompare(choiceLabel('publisher',b),'en'));
      list.innerHTML=providers.map(provider=>{const models=matches.filter(value=>modelProviders.get(value)===provider);return `<li role="group" aria-label="${escape(choiceLabel('publisher',provider))}"><div class="choice-group-label" aria-hidden="true"><span>${escape(choiceLabel('publisher',provider))}</span><span>${models.length}</span></div><ul role="presentation">${models.map(optionMarkup).join('')}</ul></li>`;}).join('');
    } else list.innerHTML=matches.map(optionMarkup).join('');
    input.removeAttribute('aria-activedescendant');
  }
  function openChoices(id) {
    closeChoices();renderChoices(id);$(id+'-options').hidden=false;$(id+'-input').setAttribute('aria-expanded','true');
  }
  function toggleChoice(id,value) {
    if(!filterValues[id].includes(value))return;
    $(id+'-input').value='';
    update({[id]:state[id].includes(value)?state[id].filter(v=>v!==value):[...state[id],value],pair:''});
    $(id+'-input').focus();openChoices(id);
  }
  function selectedRecords(includeProtocol = true) {
    const terms = state.search.trim().split(/\s+/).map(searchKey).filter(Boolean);
    return records.filter(r => (!state.publisher.length || state.publisher.includes(r.publisher)) && (!state.model.length || state.model.includes(r.model)) && (!state.harness.length || state.harness.includes(r.harness)) && (!state.pair || r.pair===state.pair) && (!state.source || r.source===state.source) && (!state.category || r.category===state.category) && (!includeProtocol || state.protocol==='all' || r.protocol===state.protocol) && terms.every(t=>searchKey(r.pair+' '+r.publisher+' '+sources.get(r.source).name+' '+protocols.get(r.protocol).title).includes(t)));
  }

  function syncProtocols() {
    const available = data.protocols.filter(p=>(!state.source || p.source===state.source) && (!state.category || p.category===state.category));
    if (state.protocol!=='all' && !available.some(p=>p.id===state.protocol)) state.protocol='all';
    $('protocol').innerHTML = '<option value="all">All protocols · results kept separate</option>' + data.sources.map(s=>{const group=available.filter(p=>p.source===s.id);return group.length ? `<optgroup label="${escape(s.name)}">${group.map(p=>`<option value="${escape(p.id)}">${escape(p.title)}</option>`).join('')}</optgroup>` : ''}).join('');
    $('protocol').value=state.protocol;
    const metrics = state.protocol==='all' ? {score:'Each protocol’s primary metric'} : protocols.get(state.protocol).metrics;
    if (!Object.hasOwn(metrics,state.metric)) state.metric='score';
    $('metric').innerHTML=Object.entries(metrics).map(([key,name])=>`<option value="${key}">${escape(name)}</option>`).join('');
    $('metric').value=state.metric;
    $('metric').disabled=state.protocol==='all';
    $('metric-field').hidden=Object.keys(metrics).length<2;
  }

  function stateParams() {
    const params=new URLSearchParams();
    for(const key of ['view','protocol','metric','search',...controls,'sort','direction']) {
      if(multiControls.includes(key)){state[key].forEach(value=>params.append(key,value));continue;}
      if(state[key]!=='' && !(key==='view'&&state[key]==='results') && !(key==='metric'&&state[key]==='score') && !(key==='sort'&&state[key]==='score') && !(key==='direction'&&state[key]===-1))params.set(key,state[key]);
    }
    return params;
  }
  function readState(params) {
    const patch={};
    for(const id of controls) {
      if(multiControls.includes(id))patch[id]=[...new Set(params.getAll(id))].filter(value=>filterValues[id].includes(value));
      else if(params.has(id)&&filterValues[id].includes(params.get(id)))patch[id]=params.get(id);
    }
    if(['results','matrix','pairs','sources'].includes(params.get('view')))patch.view=params.get('view');
    if(params.get('protocol')==='all'||protocols.has(params.get('protocol')))patch.protocol=params.get('protocol');
    if(params.has('metric'))patch.metric=params.get('metric');
    if(params.has('search'))patch.search=params.get('search');
    if(['score','model','harness','cost','duration'].includes(params.get('sort')))patch.sort=params.get('sort');
    if(['-1','1'].includes(params.get('direction')))patch.direction=Number(params.get('direction'));
    return patch;
  }
  function saveState() {
    const params=stateParams();
    history.replaceState(null,'','#'+params.toString());
    try {
      localStorage.setItem(storageKey,params.toString());
      $('save-status').textContent=restoredSearch?'Last search restored · Saved in this browser':'Search saved in this browser';
    } catch { $('save-status').textContent='Browser storage unavailable · The link still keeps this search'; }
    restoredSearch=false;
  }
  function update(patch) {
    Object.assign(state,patch);
    syncProtocols();
    controls.forEach(id=>{if(multiControls.includes(id))renderChoices(id);else $(id).value=state[id];});
    $('search').value=state.search;
    render();saveState();
  }
  function reset(patch={}) {closeChoices();multiControls.forEach(id=>$(id+'-input').value='');update({protocol:defaultProtocol,metric:'score',search:'',publisher:[],model:[],harness:[],pair:'',source:'',category:'',sort:'score',direction:-1,...patch});}

  function sorted(rows) {
    return [...rows].sort((a,b)=>{
      let av=state.sort==='score' ? a.metrics[state.metric] : a[state.sort];
      let bv=state.sort==='score' ? b.metrics[state.metric] : b[state.sort];
      // A reported zero cost is displayed as unknown, so it must not rank as free.
      if(state.sort==='cost'){if(!(av>0))av=null;if(!(bv>0))bv=null;}
      if(av==null) return bv==null ? a.pair.localeCompare(b.pair) : 1;
      if(bv==null) return -1;
      return typeof av==='number' ? (av-bv)*state.direction : av.localeCompare(bv,'en')*state.direction;
    });
  }
  function empty() {return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⊞</div><h3>${state.search.trim()?'No observations match “'+escape(state.search.trim())+'”':'No observations match these filters'}</h3><p>Only results in the imported snapshots appear here. Check the model name and active filters; missing results do not mean the pairing is incompatible.</p>${state.protocol!=='all'?'<button class="button primary" data-action="broaden">Explore all protocols</button> ':''}<button class="button secondary" data-action="reset">Reset</button></div>`;}
  function rowMarkup(r) {
    const score=r.metrics[state.metric];
    const ci = r.ci && state.metric==='score' ? `${pct(r.ci[0])}–${pct(r.ci[1])}` : `${num(r.n)} ${r.source==='openbench'?'cells':'tasks'}`;
    return `<tr class="data-row"><td><div class="model-cell">${publisherIcon(r.publisher)}<div><span class="cell-main">${escape(r.model)}</span><span class="cell-sub">${escape(r.publisher)}</span></div></div></td><td><span class="cell-main">${escape(r.harness)}</span>${r.harness_version ? '<span class="cell-sub">v'+escape(r.harness_version)+'</span>' : ''}</td><td class="score-cell"><div class="score-line"><span class="score-value">${pct(score)}</span><span class="score-bar" aria-hidden="true"><i style="width:${(score??0)*100}%"></i></span></div><span class="cell-sub">${r.ci?'95% CI · ':''}${ci}</span></td><td class="num ${r.cost==null||r.cost<=0?'cell-missing':''}" title="${escape(r.cost_basis)}">${cost(r.cost)}<span class="cell-sub">${r.cost>0?(r.source==='openbench'?'/ solve':'/ task'):''}</span></td><td class="num ${r.duration==null?'cell-missing':''}" title="${escape(r.duration_basis)}">${duration(r.duration)}<span class="cell-sub">${r.duration!=null?(r.source==='openbench'?'median · solved':'mean · agent'):''}</span></td><td><button class="row-detail" data-detail="${r.id}" aria-label="View record ${escape(r.pair)}" title="View the result and its source">↗</button></td></tr>`;
  }
  function tableMarkup(pid,rows) {
    const p=protocols.get(pid), s=sources.get(p.source), metric=p.metrics[state.metric] || p.metrics.score;
    return `<section class="table-card"><div class="group-title"><h3>${sourceIcon(p.source)}${escape(p.title)}</h3><span>${rows.length} configuration${rows.length>1?'s':''}</span></div><div class="table-scroll"><table><caption class="sr-only">${escape(p.title)}, ${escape(metric)}. Cost and duration scopes are documented in the record.</caption><thead><tr><th scope="col"><button class="sort-button" data-sort="model">Model ↕</button></th><th scope="col"><button class="sort-button" data-sort="harness">Harness ↕</button></th><th scope="col"><button class="sort-button" data-sort="score">${escape(metric)} ${state.sort==='score'?(state.direction===-1?'↓':'↑'):'↕'}</button></th><th scope="col"><button class="sort-button" data-sort="cost">Cost ↕</button></th><th scope="col"><button class="sort-button" data-sort="duration">Duration ↕</button></th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody>${sorted(rows).map(rowMarkup).join('')}</tbody></table></div><div class="table-note">${escape(p.sample_note)}</div></section>`;
  }
  function renderResults(rows){$('view-results').innerHTML=rows.length ? [...new Set(rows.map(r=>r.protocol))].map(pid=>tableMarkup(pid,rows.filter(r=>r.protocol===pid))).join('') : empty();}
  function renderMatrix(rows) {
    if(!rows.length){$('view-matrix').innerHTML=empty();return;}
    $('view-matrix').innerHTML=[...new Set(rows.map(r=>r.protocol))].map(pid=>{
      const group=rows.filter(r=>r.protocol===pid), p=protocols.get(pid);
      const models=[...new Set(group.map(r=>r.model))], harnesses=[...new Set(group.map(r=>r.harness))];
      return `<section class="table-card"><div class="group-title"><h3>${sourceIcon(p.source)}${escape(p.title)}</h3><span>${escape(p.metrics[state.metric]||p.metrics.score)}</span></div><div class="table-scroll"><table class="matrix-table"><thead><tr><th scope="col">Model / harness</th>${harnesses.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${models.map(model=>`<tr><th scope="row">${escape(model)}</th>${harnesses.map(h=>{const matches=group.filter(r=>r.model===model&&r.harness===h);if(!matches.length)return '<td class="cell-missing" title="Pairing not observed">—</td>';if(matches.length>1)return `<td><button class="heat-cell" data-pair="${escape(matches[0].pair)}" style="background:#f0f3e9">${matches.length} observations</button></td>`;const r=matches[0],score=r.metrics[state.metric];return `<td><button class="heat-cell" data-detail="${r.id}" style="background:hsl(86 30% ${98-(score??0)*24}%)" aria-label="${escape(r.pair)} : ${pct(score)}">${pct(score)}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="matrix-legend"><span class="legend-swatch"></span>Intensity = score within this protocol<span style="margin-left:auto">— not observed</span></div></section>`;
    }).join('');
  }
  function renderPairs(rows) {
    const pairs=[...new Set(rows.map(r=>r.pair))];
    $('view-pairs').innerHTML=rows.length?`<div class="pairs-grid">${pairs.map(pair=>{const group=rows.filter(r=>r.pair===pair),r=group[0];return `<article class="pair-card"><span class="pair-label">${escape(r.publisher)} · ${new Set(group.map(x=>x.source)).size} source(s)</span><h3>${escape(r.model)}<br><span style="color:#91a184">×</span> ${escape(r.harness)}</h3><p>${group.length} observation(s) across ${new Set(group.map(x=>x.protocol)).size} protocol(s). Results stay separate.</p><div class="pair-bottom"><span>${new Set(group.map(x=>x.protocol)).size>1?'No average across protocols':pct(r.metrics[state.metric])+' · '+escape(protocols.get(r.protocol).metrics[state.metric]||'score')} </span><button class="row-detail" data-pair="${escape(pair)}" aria-label="Explore pairing ${escape(pair)}">↗</button></div></article>`;}).join('')}</div>`:empty();
  }
  function renderSources() {
    $('view-sources').innerHTML='<p class="sources-intro">Three sources with their own tasks and rules. The counts below describe this preview’s imported content, regardless of active filters.</p><div class="sources-grid">'+data.sources.map(s=>{const rows=records.filter(r=>r.source===s.id),count=data.protocols.filter(p=>p.source===s.id).length,url=safeSourceUrl(s.url,s.id);return `<article class="source-card"><div class="source-card-head">${sourceIcon(s.id)}<h3>${escape(s.name)}</h3></div><p>${escape(s.description)}</p><div class="source-stats"><span><b>${rows.length}</b> observations</span><span><b>${count}</b> protocols</span></div><div class="source-bottom">${escape(s.format)} · Collected Oct 28, 2026<br>${escape(s.limitation)}</div><div class="source-action">${url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">View the publication ↗</a>`:'<span class="cell-missing">Source link unavailable</span>'}<button class="text-button" data-source="${s.id}">Explore →</button></div></article>`;}).join('')+'</div>';
  }
  function render() {
    const rows=selectedRecords();
    $('filtered-count').textContent=state.view==='sources'?data.sources.length:rows.length;
    $('catalog-title').textContent=state.view==='sources'?'Benchmark':'Explore the';
    $('catalog-subject').textContent=state.view==='sources'?'sources':'pairings';
    document.querySelector('.export-wrap').hidden=state.view==='sources';
    document.querySelectorAll('[data-view]').forEach(btn=>{const active=btn.dataset.view===state.view;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;});
    ['results','matrix','pairs','sources'].forEach(view=>$('view-'+view).hidden=view!==state.view);
    document.querySelectorAll('[data-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===(state.view==='sources'?'sources':'explore')));
    $('filter-panel').hidden=state.view==='sources';
    $('context-note').hidden=state.view==='sources';
    $('results-footnote').hidden=state.view==='sources';
    $('view-hint').textContent=state.view==='sources'?'Original publications':'Results by protocol';
    $('context-note').querySelector('p').textContent=state.protocol==='all'?'Protocols are shown separately. No overall score is calculated across sources.':protocols.get(state.protocol).description+' '+protocols.get(state.protocol).caution;
    const filterNames={harness:'Harness',publisher:'Model provider',model:'Model',pair:'Pairing',source:'Source',category:'Category'};
    const active=controls.filter(id=>!multiControls.includes(id)&&state[id]).map(id=>({id,label:filterNames[id]+': '+(id==='source'?sources.get(state[id]).name:state[id])}));
    if(state.protocol!=='all')active.push({id:'protocol',label:'Benchmark: '+protocols.get(state.protocol).title});
    if(state.metric!=='score')active.push({id:'metric',label:'Metric: '+protocols.get(state.protocol).metrics[state.metric]});
    $('active-filters').innerHTML=active.map(({id,label})=>`<button data-remove="${id}">${escape(label)}<span aria-hidden="true">×</span><span class="sr-only">Remove this filter</span></button>`).join('');
    if(state.view==='results')renderResults(rows);
    if(state.view==='matrix')renderMatrix(rows);
    if(state.view==='pairs')renderPairs(rows);
    if(state.view==='sources')renderSources();
  }

  function showDetail(id) {
    const r=records.find(x=>x.id===id);if(!r)return;
    const p=protocols.get(r.protocol),s=sources.get(r.source),score=r.metrics[state.metric]??r.metrics.score, metric=p.metrics[state.metric]||p.metrics.score,url=safeSourceUrl(r.url,r.source);
    const fields=[['Model publisher',r.publisher],['Harness version',r.harness_version||'Not provided in this source export'],['Inference provider',r.inference_provider||'Not reported'],['Sample',num(r.n)+' '+r.sample_unit+(r.solved!=null?' · '+r.solved+' solved':'')],['Cost',cost(r.cost)+' · '+r.cost_basis],['Duration',duration(r.duration)+' · '+r.duration_basis],['Tokens',num(r.tokens)+' · '+r.tokens_basis],['Measurement date',shortDate(r.measured_at)],['Publication date',shortDate(r.published_at)],['Collection date',shortDate(r.collected_at)],['Verification in this preview','Imported result; no independent reproduction'],['Source',s.name]];
    $('detail-content').innerHTML=`<div class="eyebrow">${sourceIcon(r.source)} EVALUATION RECORD</div><h2>${escape(r.model)}<br><span style="color:#8b9f7a">× ${escape(r.harness)}</span></h2><p class="detail-sub">${escape(p.title)} · ${escape(r.category)}</p><div class="detail-score"><strong>${pct(score)}</strong><span>${escape(metric)}<br>${r.ci?'95% CI : '+pct(r.ci[0])+' to '+pct(r.ci[1]):'Uncertainty not reported in this export'}</span></div><dl class="detail-grid">${fields.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl><h3 class="detail-section-title">What to keep in mind</h3><ul class="detail-caveats"><li>${escape(p.sample_note)}</li>${r.caveats.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>${url?`<a class="button primary detail-source-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open the original source ↗</a>`:'<p class="cell-missing">Source link unavailable</p>'}<details class="detail-raw"><summary>View the structured observation · JSON</summary><pre>${escape(JSON.stringify(r,null,2))}</pre></details>`;
    $('detail-dialog').showModal();
  }

  function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
  function csvCell(value) {
    let text=String(value??'');
    // CSV quoting alone does not prevent spreadsheet formula interpretation.
    if(typeof value==='string'&&/^(?:[\s\u0000-\u001f\u007f]*[=+\-@＝＋－＠]|[\t\r\n])/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function exportRecords(type) {
    const rows=selectedRecords();let content,mime;
    if(type==='json'){content=JSON.stringify({schema_version:1,collected_at:data.collected_at,preview:true,filters:state,sources:data.sources,protocols:data.protocols.filter(p=>rows.some(r=>r.protocol===p.id)),evaluations:rows},null,2);mime='application/json';}
    else{const columns=['source','protocol','model','publisher','harness','harness_version','inference_provider','metric','value_fraction','sample_n','sample_unit','cost_usd','cost_basis','duration_seconds','duration_basis','published_at','measured_at','collected_at','url'];content='\uFEFF'+[columns.join(','),...rows.map(r=>columns.map(c=>csvCell(c==='metric'?state.metric:c==='value_fraction'?r.metrics[state.metric]:c==='sample_n'?r.n:c==='sample_unit'?r.sample_unit:c==='cost_usd'?r.cost:c==='duration_seconds'?r.duration:r[c])).join(','))].join('\r\n');mime='text/csv;charset=utf-8';}
    const url=URL.createObjectURL(new Blob([content],{type:mime}));const link=document.createElement('a');link.href=url;link.download='pairwise-results-2026-10-28.'+type;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('export-menu').hidden=true;$('export-toggle').setAttribute('aria-expanded','false');notify(`${rows.length} observation(s) exported as ${type.toUpperCase()}`);
  }

  controls.filter(id=>!multiControls.includes(id)).forEach(id=>$(id).addEventListener('change',event=>update({[id]:event.target.value})));
  multiControls.forEach(id=>{
    const input=$(id+'-input');
    input.addEventListener('focus',()=>openChoices(id));
    input.addEventListener('click',()=>openChoices(id));
    input.addEventListener('input',()=>openChoices(id));
    input.addEventListener('keydown',event=>{
      const list=$(id+'-options');
      if(event.key==='Escape'||event.key==='Tab'){closeChoices();return;}
      if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)||event.isComposing)return;
      event.preventDefault();if(list.hidden)openChoices(id);
      const items=[...list.querySelectorAll('[role="option"]')];if(!items.length)return;
      const current=items.findIndex(item=>item.id===input.getAttribute('aria-activedescendant'));
      if(event.key==='Enter'){toggleChoice(id,items[current<0?0:current].dataset.value);return;}
      const next=current<0?(event.key==='ArrowDown'?0:items.length-1):(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items.forEach((item,index)=>item.classList.toggle('highlighted',index===next));
      input.setAttribute('aria-activedescendant',items[next].id);items[next].scrollIntoView({block:'nearest'});
    });
  });
  document.addEventListener('click',event=>{
    const opener=event.target.closest('[data-open-choice]');if(opener){const id=opener.dataset.openChoice,wasOpen=!$(id+'-options').hidden;$(id+'-input').focus();if(wasOpen)closeChoices();else openChoices(id);return;}
    const choice=event.target.closest('[data-choice]');if(choice){toggleChoice(choice.dataset.choice,choice.dataset.value);return;}
    const chip=event.target.closest('[data-remove-choice]');if(chip){const id=chip.dataset.removeChoice;update({[id]:state[id].filter(value=>value!==chip.dataset.value)});$(id+'-input').focus();closeChoices();return;}
    if(!event.target.closest('.choice-field'))closeChoices();
  });
  $('search').addEventListener('input',event=>update({search:event.target.value}));
  $('protocol').addEventListener('change',event=>update({protocol:event.target.value,metric:'score'}));
  $('metric').addEventListener('change',event=>update({metric:event.target.value}));
  $('reset-filters').addEventListener('click',()=>reset());
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>update({view:btn.dataset.view})));
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-view]')], index=tabs.indexOf(btn);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();}));
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{update({view:btn.dataset.nav==='sources'?'sources':'results'});$('explore').scrollIntoView({behavior:'smooth',block:'start'});}));
  document.querySelector('.site-header .brand').addEventListener('click',event=>{event.preventDefault();reset({view:'results'});window.scrollTo({top:0,behavior:'smooth'});});
  $('export-toggle').addEventListener('click',()=>{const hidden=!$('export-menu').hidden;$('export-menu').hidden=hidden;$('export-toggle').setAttribute('aria-expanded',String(!hidden));});
  document.querySelectorAll('[data-export]').forEach(btn=>btn.addEventListener('click',()=>exportRecords(btn.dataset.export)));
  document.addEventListener('click',event=>{if(!event.target.closest('.export-wrap')){$('export-menu').hidden=true;$('export-toggle').setAttribute('aria-expanded','false');}const detail=event.target.closest('[data-detail]');if(detail)showDetail(detail.dataset.detail);const remove=event.target.closest('[data-remove]');if(remove)update({[remove.dataset.remove]:remove.dataset.remove==='protocol'?'all':remove.dataset.remove==='metric'?'score':''});const sort=event.target.closest('[data-sort]');if(sort)update({sort:sort.dataset.sort,direction:state.sort===sort.dataset.sort?-state.direction:sort.dataset.sort==='score'?-1:1});const pair=event.target.closest('[data-pair]');if(pair)update({pair:pair.dataset.pair,view:'results',protocol:'all'});const source=event.target.closest('[data-source]');if(source)reset({source:source.dataset.source,protocol:'all',view:'results'});const action=event.target.closest('[data-action]');if(action?.dataset.action==='broaden')update({protocol:'all'});if(action?.dataset.action==='reset')reset();});
  ['method-open','method-bottom'].forEach(id=>$(id).addEventListener('click',()=>$('method-dialog').showModal()));
  document.querySelectorAll('.dialog-close').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}}));
  document.addEventListener('keydown',event=>{if(event.key==='/' && !event.ctrlKey&&!event.metaKey&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();$('search').focus();}if(event.key==='Escape'){$('export-menu').hidden=true;$('export-toggle').setAttribute('aria-expanded','false');}});
  window.addEventListener('hashchange',()=>reset({view:'results',...readState(new URLSearchParams(location.hash.slice(1)))}));
  let initialSearch=location.hash.slice(1);
  if(!initialSearch){try{initialSearch=localStorage.getItem(storageKey)||'';restoredSearch=Boolean(initialSearch);}catch{}}
  Object.assign(state,readState(new URLSearchParams(initialSearch)));
  update({});
  window.PairwisePreview={getState:()=>({...state}),getVisibleRecords:()=>selectedRecords(),data};
})();
