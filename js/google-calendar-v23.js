/* Browser OAuth: tokens stay in memory. Calendar mappings contain no tokens. */
(function(root){
'use strict';
const SCOPE='https://www.googleapis.com/auth/calendar.events';
const STORE='insurance-v23-calendar-map', APP='insurance-renewal-v23';
let token='',expiry=0,running=null,dirty=false,paused=false;
const status=s=>{const e=document.getElementById('googleSyncStatus');if(e)e.textContent=s};
const calendar=()=>localStorage.getItem('insurance-v23-calendar-id')||'primary';
async function read(){
 if(typeof db==='undefined'||!db)throw Error('本機資料庫尚未就緒');
 return new Promise((resolve,reject)=>{const q=db.transaction('settings','readonly').objectStore('settings').get(STORE);q.onsuccess=()=>{if(q.result)return resolve(q.result.value);try{resolve(JSON.parse(localStorage.getItem(STORE)||'{}'))}catch{reject(Error('本機行事曆對應資料損壞，請從 JSON 還原'))}};q.onerror=()=>reject(q.error)});
}
async function persist(m){
 await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:STORE,value:m});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('事件對應儲存失敗'))});
 localStorage.removeItem(STORE);
}
function validateMap(m){
 if(!m||typeof m!=='object'||Array.isArray(m))throw Error('行事曆備份格式不正確');
 for(const [id,e] of Object.entries(m))if(!id||!e||typeof e!=='object'||(e.eventId&&!/^[a-z0-9]+$/.test(e.eventId))||(e.calendarId&&typeof e.calendarId!=='string'))throw Error('行事曆事件識別資料無效');
 return m;
}
const norm=v=>String(v||'').normalize('NFKC').trim();
async function keyFor(r){
 const identity=r.number?JSON.stringify([norm(r.company)||'其他',norm(r.type),norm(r.number)]):String(r.id);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function eventFor(r,key){
 const day=oneMonthBefore(r.end),start=day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6);
 const end=new Date(Date.UTC(+day.slice(0,4),+day.slice(4,6)-1,+day.slice(6)+1)).toISOString().slice(0,10);
 return {summary:'產險續保提醒',description:'請開啟續保系統確認到期保單。',start:{date:start,timeZone:'Asia/Taipei'},end:{date:end,timeZone:'Asia/Taipei'},reminders:{useDefault:false,overrides:[{method:'popup',minutes:0}]},extendedProperties:{private:{app:APP,policyKey:key}}};
}
async function api(path,method='GET',body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
 const res=await fetch('https://www.googleapis.com/calendar/v3'+path,{method,signal:controller.signal,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!res.ok){const e=Error(res.status===401?'Google 授權已過期，請重新連線':res.status===403?'Google 權限不足或配額受限':res.status===429?'Google 限流，請稍後重新同步':'Google Calendar '+res.status);e.code=res.status;if(res.status===401){token='';expiry=0}throw e}
 return res.status===204?{}:await res.json();
 }finally{clearTimeout(timer)}
}
const endpoint=c=>'/calendars/'+encodeURIComponent(c)+'/events';
async function list(c){let result=[],page='';do{const r=await api(endpoint(c)+'?maxResults=2500&privateExtendedProperty=app%3D'+APP+(page?'&pageToken='+encodeURIComponent(page):''));result.push(...(r.items||[]));page=r.nextPageToken||''}while(page);return result}
async function get(c,id){try{return await api(endpoint(c)+'/'+encodeURIComponent(id))}catch(e){if([404,410].includes(e.code))return null;throw e}}
function policies(){return new Promise((ok,fail)=>{const q=db.transaction('policies','readonly').objectStore('policies').getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error)})}
async function pass(){
 const all=await policies(),c=calendar(),map=await read(),remote=await list(c),active=new Map();let changed=0,failed=0,errors=[];
 const fail=e=>{failed++;if(!errors.includes(e.message))errors.push(e.message)};
 for(const r of all){if(['已續保','不續保'].includes(r.status)||!oneMonthBefore(r.end))continue;active.set(String(r.id),r)}
 for(const [id,r] of active){try{
 const key=await keyFor(r),body=eventFor(r,key),entry=map[id];
 // Server lookup recovers a POST whose successful response was lost, including on another device.
 let matches=remote.filter(e=>e.status!=='cancelled'&&e.extendedProperties?.private?.policyKey===key),event=matches[0];
 if(!event&&entry?.eventId&&(!entry.calendarId||entry.calendarId===c)){
 const old=await get(c,entry.eventId);
 if(old&&old.status!=='cancelled'&&(old.extendedProperties?.private?.app===APP||(!entry.key&&old.summary===body.summary&&old.description===body.description)))event=old;
 }
 if(!event){
  for(let generation=0;generation<20;generation++){
   const eventId='a'+key+(generation?generation.toString(16):'');
   // Save intent before POST so cancellation after an interrupted request remains retryable.
   map[id]={eventId,key,calendarId:c};await persist(map);
   try{event=await api(endpoint(c),'POST',{...body,id:eventId});break}catch(e){
    if(e.code!==409)throw e;
    const existing=await get(c,eventId);
    if(existing&&existing.status!=='cancelled'){
     if(existing.extendedProperties?.private?.policyKey!==key)throw Error('事件識別衝突，未修改 Google 資料');
     event=existing;break;
    }
   }
  }
  if(!event)throw Error('事件已刪除多次，請聯絡開發者檢查');
 }
 if(event.summary!==body.summary||event.description!==body.description||event.start?.date!==body.start.date||event.end?.date!==body.end.date||JSON.stringify(event.reminders)!==JSON.stringify(body.reminders)||event.extendedProperties?.private?.policyKey!==key)await api(endpoint(c)+'/'+encodeURIComponent(event.id),'PATCH',body);
 // Remove duplicate app-owned events only after the surviving event was updated.
 for(const duplicate of matches.filter(e=>e.id!==event.id))await api(endpoint(c)+'/'+encodeURIComponent(duplicate.id),'DELETE');
 map[id]={eventId:event.id,key,calendarId:c,fingerprint:JSON.stringify(body)};await persist(map);changed++;
 }catch(e){fail(e);if(e.code===401)break}}
 // Keep mappings for removed records until DELETE succeeds. Never delete unknown other-device events.
 for(const [id,e] of Object.entries(map)){
 if(active.has(id))continue;
 try{
 const target=e.calendarId||c;
 const stillUsed=Object.entries(map).some(([other,v])=>active.has(other)&&v.eventId===e.eventId&&(v.calendarId||c)===target);
 if(!stillUsed&&e.eventId){try{await api(endpoint(target)+'/'+encodeURIComponent(e.eventId),'DELETE')}catch(err){if(![404,410].includes(err.code))throw err}}
 delete map[id];await persist(map);changed++;
 }catch(err){fail(err)}
 }
 status((failed?'同步未全部完成':'同步完成')+'：處理 '+changed+' 筆，失敗 '+failed+' 筆。'+errors.join('；')+(failed?'。請排除原因後按重新同步。':''));
 return {changed,failed};
}
function sync(){
 if(paused){dirty=true;return Promise.resolve()}
 if(running){dirty=true;return running}
 if(!token||Date.now()>=expiry){status('Google 授權尚未完成或已過期，請點連接 Google。');return Promise.resolve()}
 if(typeof db==='undefined'||!db)return Promise.resolve();
 const work=async()=>{let result;do{dirty=false;try{result=await pass()}catch(e){status('同步失敗：'+e.message+'。請重新同步。');result={failed:1}}}while(dirty&&!paused&&token&&Date.now()<expiry);return result};
 running=(root.navigator?.locks?root.navigator.locks.request(APP,work):work()).finally(()=>{running=null});return running;
}
function connect(){
 const id=document.getElementById('googleClientId').value.trim(),c=document.getElementById('googleCalendarId').value.trim();
 if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)){status('請填入 Google OAuth 用戶端 ID');return}
 if(!c){status('請填入專用 Google 行事曆 ID');return}
 if(running){status('同步進行中，請完成後再連線');return}
 if(c!==calendar()&&localStorage.getItem('insurance-v23-calendar-id')){status('請使用原專用行事曆 ID；更換行事曆前需先處理舊提醒。');return}
 if(!root.google?.accounts?.oauth2){status('Google 授權元件未載入，請連線後重試');return}
 localStorage.setItem('insurance-v23-google-client',id);localStorage.setItem('insurance-v23-calendar-id',c);
 root.google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,error_callback:()=>status('Google 視窗未開啟或已關閉，請再次連線'),callback:r=>{if(!r.access_token){status('授權失敗或取消');return}token=r.access_token;expiry=Date.now()+Number(r.expires_in||3500)*1000;sync()}}).requestAccessToken({prompt:''});
}
function init(){document.getElementById('googleClientId').value=localStorage.getItem('insurance-v23-google-client')||'';document.getElementById('googleCalendarId').value=calendar();status('請連接 Google；授權後開啟頁面或異動資料時同步。');root.addEventListener('online',sync);root.addEventListener('pageshow',sync)}
async function pause(){paused=true;if(running)await running}
function resume(){paused=false;return sync()}
async function importMap(m){validateMap(m);await persist({...m,...await read()})}
root.GoogleRenewal={sync,connect,init,pause,resume,exportMap:read,importMap,validateMap};
})(window);
