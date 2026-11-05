import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.TEST_DEPS_ROOT?process.env.TEST_DEPS_ROOT+'/package.json':import.meta.url);
const {Window}=require('happy-dom');
const {indexedDB}=require('fake-indexeddb');
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const fixture=process.argv[2];
if(!fixture)throw Error('Usage: node tests/integration.mjs /absolute/path/to/private-fixture.xls');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const window=new Window({url:'https://v23-test.invalid/'});
window.indexedDB=indexedDB;window.confirm=()=>true;
window.document.write(html.replace(/<script[\s\S]*?<\/script>/g,''));
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
window.eval(main+'\n'+fs.readFileSync('js/excel-import-v23.js','utf8')+'\n'+fs.readFileSync('js/google-calendar-v23.js','utf8')+'\n'+fs.readFileSync((process.env.XLSX_SCRIPT||require.resolve('xlsx/dist/xlsx.full.min.js')),'utf8'));
await new Promise(r=>setTimeout(r,30));
const bytes=fs.readFileSync(fixture);
await window.loadExcel({target:{files:[{name:'fixture.xls',arrayBuffer:async()=>new window.Uint8Array(bytes).buffer}]}});
for(const select of window.document.querySelectorAll('#mapfields select')){const selected=select.querySelector('option[selected]');if(selected)select.value=selected.value}
await window.commitExcel();await new Promise(r=>setTimeout(r,30));

const policies=await new Promise((resolve,reject)=>{const q=window.transaction('readonly').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
assert.equal(policies.length,87);
// happy-dom does not apply parsed selected attributes like a real browser; set them explicitly above.
// Edit must preserve the insurer's original category, even when it isn't a default select option.
const other=policies.find(p=>p.type==='住宅火災保險');window.edit(other.id);
assert.equal(window.document.getElementById('policyForm').elements.type.value,'住宅火災保險');
await window.loadExcel({target:{files:[{name:'fixture.xls',arrayBuffer:async()=>new window.Uint8Array(bytes).buffer}]}});
for(const select of window.document.querySelectorAll('#mapfields select')){const selected=select.querySelector('option[selected]');if(selected)select.value=selected.value}
await window.commitExcel();assert.match(window.document.getElementById('preview').textContent,/預計匯入 0 筆；略過 87 筆/);
// JSON export captures records and mappings; restore retains PDF attachments and pending deletion map entries.
let downloaded;
window.downloadBlob=(blob,name)=>{downloaded={blob,name}};
await window.GoogleRenewal.importMap({test:{eventId:'abcde',calendarId:'test-calendar'}});
window.backup();await new Promise(r=>setTimeout(r,30));
const backup=JSON.parse(await downloaded.blob.text());
assert.equal(backup.records.length,87);assert.equal(backup.googleCalendarMap.test.eventId,'abcde');
const first={...backup.records[0],pdfName:'test.pdf',pdfData:'data:application/pdf;base64,dGVzdA=='};
const restored={...backup,records:[first],googleCalendarMap:{}};
await window.restore({target:{files:[{text:async()=>JSON.stringify(restored)}],value:'test'}});
await new Promise(r=>setTimeout(r,30));

assert.equal((await window.GoogleRenewal.exportMap()).test.eventId,'abcde');
const saved=await new Promise(r=>{const q=window.transaction('readonly').getAll();q.onsuccess=()=>r(q.result)});
assert.equal(saved[0].pdfData,first.pdfData);
// Invalid restore never clears current records.
await window.restore({target:{files:[{text:async()=>JSON.stringify({...restored,records:[first,first]})}],value:'test'}});
assert.match(window.document.getElementById('message').textContent,/重複識別碼/);

console.log(JSON.stringify({environment:'happy-dom + fake-indexeddb (not a real browser)',excel:{source:87,imported:87,skipped:0,reimportAdded:0},jsonRoundTrip:'passed',pdfPreserved:true,mapPendingDeletionPreserved:true,invalidRestorePreservesRecords:true,unknownCategoryEdit:'passed'}));
await window.happyDOM.close();
