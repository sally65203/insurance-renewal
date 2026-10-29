/* V2.3 Google Calendar synchronization: browser OAuth; no client secret. */
(function(root){
const SCOPE='https://www.googleapis.com/auth/calendar.events';
let token='',expiry=0,busy=false;
const store='insurance-v23-calendar-map';
const eventId=id=>'renewal'+String(id).replace(/[^a-z0-9]/gi,'').toLowerCase().replace(/[w-z]/g,'a').replace(/[g-v]/g,'b').slice(0,80);

const read=()=>{try{return JSON.parse(localStorage.getItem(store)||'{}')}catch{return {}}};
const persist=m=>localStorage.setItem(store,JSON.stringify(m));
const status=s=>{let e=document.getElementById('googleSyncStatus');if(e)e.textContent=s};
function eventFor(r){let date=oneMonthBefore(r.end),start=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6),next=new Date(Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6)+1)).toISOString().slice(0,10);return {summary:'產險續保提醒',description:'請開啟續保系統確認到期保單。',start:{date:start},end:{date:next},reminders:{useDefault:false,overrides:[{method:'popup',minutes:0}]}}}
async function api(path,method,body){let res=await fetch('https://www.googleapis.com/calendar/v3'+path,{method:method||'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(res.status===404)return {missing:true};if(!res.ok){if(res.status===401||res.status===403)throw Error('Google 授權不足或已過期（'+res.status+'）');throw Error('Google Calendar '+res.status)}return res.status===204?{}:await res.json()}
async function sync(){
if(!token||Date.now()>=expiry){status('Google 授權尚未完成或已過期，請重新連線。');return}
if(busy||!db)return;busy=true;let changed=0,failed=0;
try{
const all=await new Promise((ok,fail)=>{let q=db.transaction('policies','readonly').objectStore('policies').getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error)});
const map=read(),active=new Map(all.filter(r=>!['已續保','不續保'].includes(r.status)&&oneMonthBefore(r.end)).map(r=>[String(r.id),r]));
for(const [id,r] of active){try{const body=eventFor(r),fingerprint=JSON.stringify(body),entry=map[id];if(entry&&entry.fingerprint===fingerprint)continue;let result=entry?.eventId?await api('/calendars/primary/events/'+encodeURIComponent(entry.eventId),'PATCH',body):{missing:true};if(result.missing){const eventBody={...body,id:eventId(id)};result=await api('/calendars/primary/events','POST',eventBody)}if(!result.id)throw Error('Google 未回傳事件編號');map[id]={eventId:result.id,fingerprint};persist(map);changed++}catch(e){failed++}}
for(const [id,entry] of Object.entries(map)){if(active.has(id))continue;try{const result=await api('/calendars/primary/events/'+encodeURIComponent(entry.eventId),'DELETE');if(result.missing||result){delete map[id];}persist(map);changed++}catch(e){failed++}}
status('同步完成：更新 '+changed+' 筆，失敗 '+failed+' 筆。'+(failed?'請重新連線或稍後重試。':''));
}catch(e){status('同步失敗：'+e.message)}finally{busy=false}
}
function connect(){const id=document.getElementById('googleClientId').value.trim();if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)){status('請填入 Google OAuth 用戶端 ID');return}if(!root.google?.accounts?.oauth2){status('Google 授權元件未載入');return}localStorage.setItem('insurance-v23-google-client',id);google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:r=>{if(!r.access_token){status('授權失敗或取消');return}token=r.access_token;expiry=Date.now()+Number(r.expires_in||3500)*1000;sync()}}).requestAccessToken({prompt:'consent'})}
function init(){let e=document.getElementById('googleClientId');if(e)e.value=localStorage.getItem('insurance-v23-google-client')||'';status('首次需連線授權；重新開啟網頁後可能需要再次授權。')}
root.GoogleRenewal={sync,connect,init,exportMap:read,importMap:persist};
})(window);
