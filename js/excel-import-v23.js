/* V2.3 renewal Excel validation; no personal data leaves the browser. */
(function(root){
const fields={customer:['被保險人名稱','被保險人','要保人名稱','要保人','客戶名稱'],number:['續保單號','保單號碼','保險單號碼'],type:['險種','險別','保險類別'],end:['保險迄日','到期日','保險到期日'],company:['保險公司'],plate:['車牌號碼','車牌','牌照號碼'],start:['保險起日','起保日'],premium:['總保費','保費']};
const norm=s=>String(s??'').normalize('NFKC').trim();
const key=r=>[r.company||'其他',r.type,r.number].map(norm).join('|');
function mapping(headers){let out={};for(let [field,names] of Object.entries(fields)){let i=-1;for(let name of names){i=headers.findIndex(h=>norm(h)===name);if(i>=0)break}out[field]=i>=0?String(i):''}return out}
function date(v){let s=norm(v),m=s.match(/^(\d{2,4})[\/.-年](\d{1,2})[\/.-月](\d{1,2})/);if(!m)return '';let y=+m[1],mo=+m[2],d=+m[3];if(y<1912)y+=1911;let x=new Date(Date.UTC(y,mo-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'):''}
function plan(rows,map,existing){let accepted=[],skipped=[],seen=new Set(existing.filter(r=>r.number).map(key));rows.forEach((row,i)=>{let v=f=>map[f]===''?'':norm(row[+map[f]]),r={customer:v('customer'),number:v('number'),type:v('type'),end:date(v('end')),company:v('company')||'其他',plate:v('plate'),start:date(v('start')),premium:v('premium'),status:'待續保',note:'Excel 清冊匯入',created:new Date().toISOString(),pdfData:null,pdfName:null},reason=!r.customer?'缺少客戶名稱':!r.number?'缺少續保單號':!r.type?'缺少險種':!r.end?'到期日無效':seen.has(key(r))?'相同保單號碼、險種及公司':'';if(reason)skipped.push({row:i+2,reason});else{seen.add(key(r));accepted.push(r)}});return {accepted,skipped}}
root.RenewalImport={mapping,date,plan};
})(typeof window!=='undefined'?window:globalThis);
