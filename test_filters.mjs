// Exercise the actual filtering/state functions without adding browser dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('./', import.meta.url);
const code = readFileSync(new URL('dist/app.js', root), 'utf8');
const data = JSON.parse(readFileSync(new URL('tests/fixtures/data.json', root), 'utf8'));
const dom = new Map();
const initial = () => ({view:'results',protocol:'all',metric:'score',search:'',publisher:[],model:[],harness:[],pair:'',source:'',category:'',sort:'score',direction:-1});
const context = vm.createContext({
  data, records:data.evaluations,
  sources:new Map(data.sources.map(s=>[s.id,s])),
  protocols:new Map(data.protocols.map(p=>[p.id,p])),
  state:initial(), controls:['harness','publisher','model','pair','source','category'],
  multiControls:['model','harness','publisher'], URLSearchParams,
  filterValues:Object.fromEntries(['harness','publisher','model','pair','source','category'].map(id=>[id,[...new Set(data.evaluations.map(r=>r[id]))]])),
  $:id=>{if(!dom.has(id))dom.set(id,{value:'',innerHTML:'',disabled:false});return dom.get(id);},
  escape:String, render:()=>{}, saveState:()=>{}, notify:()=>{}, closeChoices:()=>{}, renderChoices:()=>{},
});

function load(name, next) {
  const start = code.indexOf('  function '+name+'(');
  const end = code.indexOf('  function '+next+'(',start);
  assert(start>=0 && end>start, `Cannot find ${name}`);
  vm.runInContext(code.slice(start,end), context);
}
vm.runInContext(code.match(/^  const defaultProtocol = .*;$/m)[0],context);
load('selectedRecords','syncProtocols');
load('searchKey','choiceLabel');
load('syncProtocols','stateParams');
load('stateParams','readState');
load('readState','saveState');
load('update','reset');
load('reset','sorted');

context.state = initial();
context.reset();
assert.equal(context.selectedRecords().length,8,'Reset must not restrict results to one benchmark');
context.update({harness:['OpenCode'],publisher:['OpenAI']});
assert.equal(context.selectedRecords().length,3,'Both primary filters must search all protocols by default');

context.state = initial();
context.update({protocol:'ob-2026-07-21-gpt56'});
context.update({publisher:['Anthropic']});
assert.equal(context.state.protocol,'ob-2026-07-21-gpt56','An explicit protocol must not silently change');
assert.equal(context.selectedRecords().length,0,'An unavailable combination must remain empty');
context.update({protocol:'all'});
assert.equal(context.selectedRecords().length,1);

for (const metric of ['constructor','__proto__','toString','not-a-metric']) {
  context.state={...initial(),protocol:'hb-general',metric};
  context.syncProtocols();
  assert.equal(context.state.metric,'score',`Reject inherited/invalid metric ${metric}`);
}
context.state={...initial(),protocol:'hb-general',metric:'full_credit'};
context.syncProtocols();
assert.equal(context.state.metric,'full_credit','Keep valid non-default metrics');
assert.equal(dom.get('metric-field').hidden,false,'Show a selector when the benchmark offers multiple scores');
context.state={...initial(),protocol:'ob-2026-07-21-gpt56'};
context.syncProtocols();
assert.equal(dom.get('metric-field').hidden,true,'Hide a one-option metric selector');
context.state=initial();
context.syncProtocols();
assert.equal(dom.get('metric-field').hidden,true,'Hide the metric selector across protocols');

for(const search of ['GPT56','gpt-5.6','GPT 5.6']) {
  context.state={...initial(),search};
  assert.equal(context.selectedRecords().length,6,'Search must ignore punctuation and case');
}
context.state={...initial(),search:'GPT6'};
assert.equal(context.selectedRecords().length,0,'Do not invent data for a model missing from the snapshots');
context.state={...initial(),model:['GPT-5.6 Sol']};
assert.equal(context.selectedRecords().length,5,'A model alone must work across harnesses and protocols');

context.state={...initial(),harness:['Hermes'],publisher:['Anthropic']};
assert.equal(context.selectedRecords().length,0,'Do not invent unobserved pairings');

context.state={...initial(),harness:['OpenCode','Claude Code'],model:['GPT-5.6 Sol','GPT-5.6 Terra']};
const expected=data.evaluations.filter(r=>['OpenCode','Claude Code'].includes(r.harness)&&['GPT-5.6 Sol','GPT-5.6 Terra'].includes(r.model));
assert.deepEqual(Array.from(context.selectedRecords(),r=>r.id),expected.map(r=>r.id),'Union within each field, intersection across fields');
const roundTrip=context.readState(context.stateParams());
assert.deepEqual(Array.from(roundTrip.harness),['OpenCode','Claude Code']);
assert.deepEqual(Array.from(roundTrip.model),['GPT-5.6 Sol','GPT-5.6 Terra']);
const legacy=context.readState(new URLSearchParams('model=GPT-5.6+Sol&harness=OpenCode'));
assert.deepEqual(Array.from(legacy.model),['GPT-5.6 Sol'],'Keep old single-value URLs');
const forged=context.readState(new URLSearchParams('model=unknown&model=GPT-5.6+Sol&model=GPT-5.6+Sol&harness=constructor&sort=constructor&direction=no'));
assert.deepEqual(Array.from(forged.model),['GPT-5.6 Sol'],'Validate and deduplicate stored/URL values');
assert.equal(forged.harness.length,0);
assert.equal(forged.sort,undefined);
assert.equal(forged.direction,undefined);

let onHashChange;
context.window={addEventListener:(event,handler)=>{if(event==='hashchange')onHashChange=handler;}};
context.location={hash:'#protocol=all&model=GPT-5.6+Sol&harness=OpenCode'};
vm.runInContext(code.match(/^  window.addEventListener\('hashchange'.*$/m)[0],context);
context.state={...initial(),view:'sources',protocol:'hb-general',metric:'full_credit',search:'stale'};
onHashChange();
assert.equal(context.state.protocol,'all','A filter link must update the current page, not just its URL');
assert.equal(context.state.metric,'score');
assert.equal(context.state.view,'results');
assert.equal(context.state.search,'');
assert.equal(context.selectedRecords().length,2);

const stored=new Map();
context.storageKey='pairwise:last-search:v1';
context.restoredSearch=false;
context.history={replaceState:(_a,_b,url)=>{context.savedUrl=url;}};
context.localStorage={setItem:(key,value)=>stored.set(key,value)};
load('saveState','update');
context.state={...initial(),harness:['OpenCode','Claude Code'],model:['GPT-5.6 Sol'],search:'Sol',sort:'cost',direction:1};
context.saveState();
const saved=context.readState(new URLSearchParams(stored.get(context.storageKey)));
assert.deepEqual(Array.from(saved.harness),['OpenCode','Claude Code']);
assert.equal(saved.search,'Sol');
assert.equal(saved.sort,'cost');
assert.equal(saved.direction,1);
assert.equal(dom.get('save-status').textContent,'Search saved in this browser');
context.restoredSearch=true;
context.saveState();
assert.match(dom.get('save-status').textContent,/Last search restored/);
context.localStorage={setItem:()=>{throw new Error('Storage blocked');}};
assert.doesNotThrow(()=>context.saveState(),'Blocked browser storage must not break filtering or shareable URLs');
assert.match(dom.get('save-status').textContent,/unavailable/);
assert.match(context.savedUrl,/harness=OpenCode/);

context.modelProviders=new Map(data.evaluations.map(r=>[r.model,r.publisher]));
for(const model of context.filterValues.model) {
  assert.equal(new Set(data.evaluations.filter(r=>r.model===model).map(r=>r.publisher)).size,1,'Each model must have one developer for grouping');
}
load('choiceLabel','closeChoices');
load('renderChoices','openChoices');
context.state=initial();
dom.set('model-input',{value:'',removeAttribute:()=>{}});
context.renderChoices('model');
const allOptions=[...dom.get('model-options').innerHTML.matchAll(/data-value="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(allOptions).size,4,'Grouping must keep all fixture models exactly once');
assert.equal(allOptions.length,4);
for(const [query,publisher] of [['OpenAI','OpenAI'],['Claude','Anthropic'],['Google','Google']]) {
  dom.get('model-input').value=query;
  context.renderChoices('model');
  const values=[...dom.get('model-options').innerHTML.matchAll(/data-value="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(values.sort(),[...new Set(data.evaluations.filter(r=>r.publisher===publisher).map(r=>r.model))].sort(),'Provider query must suggest that developer’s models');
}
dom.get('model-input').value='OpenAI gpt56 sol';
context.renderChoices('model');
assert.deepEqual([...dom.get('model-options').innerHTML.matchAll(/data-value="([^"]+)"/g)].map(m=>m[1]),['GPT-5.6 Sol'],'Combine provider and model terms');
console.log('PASS: filters, search, metrics, multi-selection, saved state, blocked storage and grouped model suggestions by provider.');
