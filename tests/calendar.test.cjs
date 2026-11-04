const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(__dirname+'/../js/google-calendar-v23.js','utf8');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const dates=html.slice(html.indexOf('function calendarDay('),html.indexOf('function icsEscape('));
function harness(){
 const state={rows:[],map:null,events:new Map(),calls:[],fail:null,after:null},storage=new Map(),elements={googleClientId:{value:'test.apps.googleusercontent.com'},googleCalendarId:{value:'test-calendar'},googleSyncStatus:{textContent:''}};
 const context={console,crypto:webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout,Date,URL,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:k=>elements[k]},addEventListener(){},navigator:{},google:{accounts:{oauth2:{initTokenClient:cfg=>({requestAccessToken(){cfg.callback({access_token:'test-token',expires_in:3600})}})}}}};
 context.db={transaction(name){const tx={objectStore(){return {getAll(){const q={};queueMicrotask(()=>{q.result=structuredClone(state.rows);q.onsuccess()});return q},get(){const q={};queueMicrotask(()=>{q.result=state.map?{value:structuredClone(state.map)}:undefined;q.onsuccess()});return q},put(v){queueMicrotask(()=>{state.map=structuredClone(v.value);tx.oncomplete()})}}}};return tx}};
 context.fetch=async(url,options)=>{
 const u=new URL(url),method=options.method,body=options.body&&JSON.parse(options.body),id=decodeURIComponent(u.pathname.split('/').pop());state.calls.push({method,id,body});
 if(state.fail){const f=state.fail;state.fail=null;if(f==='network')throw Error('offline');return {ok:false,status:f}}
 let result,code=200;
 if(method==='GET'&&id==='events')result={items:[...state.events.values()].filter(x=>x.status!=='cancelled'&&x.extendedProperties?.private?.app==='insurance-renewal-v23')};
 else if(method==='GET'){result=state.events.get(id);if(!result)code=404}
 else if(method==='POST'){if(state.events.has(body.id))code=409;else{result={...body};state.events.set(body.id,result);if(state.after){const fn=state.after;state.after=null;await fn();}}}
 else if(method==='PATCH'){if(!state.events.has(id))code=404;else{result={...state.events.get(id),...body};state.events.set(id,result)}}
 else if(method==='DELETE'){if(!state.events.has(id))code=404;else{state.events.set(id,{id,status:'cancelled'});code=204}}
 return {ok:code<400,status:code,json:async()=>structuredClone(result)};
 };
 context.window=context;vm.createContext(context);vm.runInContext(dates+'\n'+source,context);
 const g=context.GoogleRenewal;
 return {state,g,context,elements,async connect(){g.connect();await g.sync()},alive(){return [...state.events.values()].filter(x=>x.status!=='cancelled')}};
}
const policy=(id='p1')=>({id,company:'其他',type:'強制險',number:'TEST001',end:'2026-12-25',status:'待續保'});
test('calendar month boundaries and invalid dates',()=>{const {context:c}=harness();for(const [input,expected] of [['2026-03-31','20260228'],['2024-03-31','20240229'],['2026-01-31','20251231'],['2026-02-30',null]])assert.equal(c.oneMonthBefore(input),expected)});
test('create, modify same event, renew cancellation, reactivate tombstone',async()=>{const h=harness();h.state.rows=[policy()];await h.connect();assert.equal(h.alive().length,1);let event=h.alive()[0];assert.equal(event.start.date,'2026-11-25');assert.equal(event.start.timeZone,'Asia/Taipei');assert.equal(event.reminders.overrides[0].minutes,0);h.state.rows[0].end='2027-03-31';await h.g.sync();assert.equal(h.alive()[0].id,event.id);assert.equal(h.alive()[0].start.date,'2027-02-28');h.state.rows[0].status='已續保';await h.g.sync();assert.equal(h.alive().length,0);h.state.rows[0].status='待續保';await h.g.sync();assert.equal(h.alive().length,1);assert.notEqual(h.alive()[0].id,event.id)});
test('lost insert response retry and cancellation remain recoverable',async()=>{const h=harness();h.state.rows=[policy()];h.state.after=()=>{throw Error('response lost')};await h.connect();assert.equal(h.alive().length,1);await h.g.sync();assert.equal(h.alive().length,1);h.state.rows=[];await h.g.sync();assert.equal(h.alive().length,0)});
test('cross-device reimport with different local ID deduplicates',async()=>{const a=harness();a.state.rows=[policy()];await a.connect();const b=harness();b.state.events=a.state.events;b.state.rows=[policy('different-local-id')];await b.connect();assert.equal(b.alive().length,1)});
test('queued changes while busy are processed',async()=>{const h=harness();h.state.rows=[policy()];h.state.after=async()=>{h.state.rows[0].end='2027-05-31';h.g.sync()};await h.connect();assert.equal(h.alive()[0].start.date,'2027-04-30')});
test('429, offline and 401 show failure and can retry',async()=>{for(const error of [429,'network',401]){const h=harness();h.state.rows=[policy()];h.state.fail=error;await h.connect();assert.match(h.elements.googleSyncStatus.textContent,/失敗|授權/);await h.connect();assert.equal(h.alive().length,1)}});
test('restore merges maps and removes reminders absent from restored records',async()=>{const h=harness();h.state.rows=[policy()];await h.connect();const backup=await h.g.exportMap();h.state.rows.push({...policy('p2'),number:'TEST002'});await h.g.sync();assert.equal(h.alive().length,2);await h.g.pause();h.state.rows=[policy()];await h.g.importMap(JSON.parse(JSON.stringify(backup)));await h.g.resume();assert.equal(h.alive().length,1);assert.throws(()=>h.g.validateMap({p:{eventId:'../unsafe'}}))});
test('unknown other-device events are not deleted',async()=>{const h=harness();h.state.rows=[policy()];await h.connect();h.state.map={};h.state.rows=[];await h.g.sync();assert.equal(h.alive().length,1)});
test('cancel without renewal and deleted mappings missing at Google',async()=>{const h=harness();h.state.rows=[policy()];await h.connect();h.state.rows[0].status='不續保';await h.g.sync();assert.equal(h.alive().length,0);await h.g.importMap({gone:{eventId:'abcdef',calendarId:'test-calendar'}});await h.g.sync();assert.equal(Object.keys(await h.g.exportMap()).length,0)});
test('server duplicate app events collapse to one',async()=>{const h=harness();h.state.rows=[policy()];await h.connect();const event=h.alive()[0];h.state.events.set('abcde',{...event,id:'abcde'});await h.g.sync();assert.equal(h.alive().length,1)});
