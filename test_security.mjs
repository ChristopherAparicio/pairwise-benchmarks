// Exercise the real renderers and exporters with inert, isolated attack fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('./',import.meta.url);
const code=readFileSync(new URL('dist/app.js',root),'utf8');
const data=JSON.parse(readFileSync(new URL('tests/fixtures/data.json',root),'utf8'));
const initial=()=>({view:'results',protocol:'all',metric:'score',search:'',publisher:[],model:[],harness:[],pair:'',source:'',category:'',sort:'score',direction:-1});
const dom=new Map();let captured;
class FixtureURL extends URL {}
FixtureURL.createObjectURL=blob=>{captured=blob;return 'blob:security-fixture';};
FixtureURL.revokeObjectURL=()=>{};
const context=vm.createContext({
  data,records:data.evaluations,state:initial(),
  protocols:new Map(data.protocols.map(p=>[p.id,p])),sources:new Map(data.sources.map(s=>[s.id,s])),
  URL:FixtureURL,Blob,setTimeout:()=>{},notify:()=>{},pct:String,num:String,cost:String,duration:String,shortDate:String,sourceIcon:()=>'',
  document:{createElement:()=>({click(){},remove(){}}),body:{append(){}}},
  $:id=>{if(!dom.has(id))dom.set(id,{innerHTML:'',setAttribute(){},showModal(){}});return dom.get(id);},
});
for(const name of ['escape','sourceOrigins'])vm.runInContext(code.match(new RegExp('^  const '+name+' = .*;$','m'))[0],context);
function load(name,next) {
  const start=code.indexOf('  function '+name+'('),end=code.indexOf('  function '+next+'(',start);
  assert(start>=0&&end>start);vm.runInContext(code.slice(start,end),context);
}
load('safeSourceUrl','options');load('searchKey','choiceLabel');load('selectedRecords','syncProtocols');
load('syncProtocols','stateParams');load('showDetail','notify');load('renderSources','render');
load('csvCell','exportRecords');
const exportStart=code.indexOf('  function exportRecords(');
vm.runInContext(code.slice(exportStart,code.indexOf('\n  controls.filter(',exportStart)),context);

// Every current provenance link remains usable; untrusted origins do not.
for(const r of data.evaluations)assert(context.safeSourceUrl(r.url,r.source));
for(const s of data.sources)assert(context.safeSourceUrl(s.url,s.id));
for(const value of ['javascript:alert(1)','data:text/html,test','http://openbench.run/x','https://evil.invalid/x','https://openbench.run.evil.invalid/x','https://user:pass@openbench.run/x','https://@openbench.run/x','https://openbench.run:8443/x',' https://openbench.run/x','https://openbench.run/\nx','https://openbench.run\\@evil.invalid/x','https://openbench.run:bad/x',null]) {
  assert.equal(context.safeSourceUrl(value,'openbench'),null,`Reject ${value}`);
}
assert.equal(context.safeSourceUrl('https://openbench.run/x','unknown'),null);
assert.equal(context.safeSourceUrl('https://OPENBENCH.RUN:443/x','openbench'),'https://openbench.run/x');
for(const badUrl of ['javascript:alert(1)','https://evil.invalid/x']) {
  context.records=[{...data.evaluations[0],url:badUrl}];
  context.showDetail(context.records[0].id);
  assert(!dom.get('detail-content').innerHTML.includes('detail-source-link'));
  assert(dom.get('detail-content').innerHTML.includes('Source link unavailable'));
}
context.records=[data.evaluations[0]];context.showDetail(context.records[0].id);
assert(dom.get('detail-content').innerHTML.includes('detail-source-link'));
context.data={...data,sources:data.sources.map(s=>({...s,url:'https://evil.invalid/x'}))};context.renderSources();
assert(!dom.get('view-sources').innerHTML.includes('href='),'Source cards must enforce pinned origins too');
context.data=data;

const protocol=data.protocols.find(p=>p.source==='openbench');
const poisonedId='ob-probe" onclick="alert(1)';
context.data={...data,protocols:[{...protocol,id:poisonedId}]};
context.syncProtocols();
assert(dom.get('protocol').innerHTML.includes('value="ob-probe&quot; onclick=&quot;alert(1)"'));
assert(!dom.get('protocol').innerHTML.includes('value="ob-probe" onclick='));
context.data=data;

const formulas=['=1+1','+SUM(1,2)','-1+1','@SUM(1,2)',' \t=1+1','\u0000=1+1','\ttext','\rtext','\ntext','＝1+1'];
for(const value of formulas)assert(context.csvCell(value).startsWith('"\''),`Neutralize ${JSON.stringify(value)}`);
assert.equal(context.csvCell(-42),'"-42"','Real numbers must remain numeric');
assert.equal(context.csvCell(null),'""');
assert.equal(context.csvCell('a,"b"\nc'),'"a,""b""\nc"','Keep CSV quoting and embedded newlines');
const poisonedRow={...data.evaluations[0],model:'=1+1'};
context.records=[poisonedRow];context.exportRecords('csv');
assert((await captured.text()).includes('"\'=1+1"'));
context.exportRecords('json');
assert.equal(JSON.parse(await captured.text()).evaluations[0].model,'=1+1','JSON keeps the canonical source value');

context.records=data.evaluations;
for(const [state,count] of [[initial(),8],[{...initial(),model:['GPT-5.6 Sol'],harness:['OpenCode','Claude Code']},4]]) {
  context.state=state;context.exportRecords('json');
  const exported=JSON.parse(await captured.text());assert.equal(exported.evaluations.length,count);
  assert.deepEqual(exported.evaluations[0].metrics,context.selectedRecords()[0].metrics);
  context.exportRecords('csv');assert.equal((await captured.text()).trim().split(/\r?\n/).length,count+1);
}
console.log('PASS: escaped protocol IDs, pinned HTTPS source links, unsafe-link fallback, CSV formula neutralization, unchanged JSON and 8/4-row fixture exports.');
