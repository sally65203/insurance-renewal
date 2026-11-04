const {test}=require('node:test'),assert=require('node:assert/strict');
require('../js/excel-import-v23.js');
const I=globalThis.RenewalImport;
const headers=['要保人名稱','續保單號','保單號碼','險種名稱','到期日','車牌號碼'];
const map=I.mapping(headers);
test('placeholder renewal numbers fall back per row; same plate distinct coverages retained',()=>{
 const rows=[['測試甲','-','OLD001','強制車險','115/12/25','TEST-001'],['測試甲','—','OLD002','任意車險','115/12/25','TEST-001'],['測試乙','NEW003','OLD003','住宅火災保險','115/12/26','']];
 const p=I.plan(rows,map,[]);assert.equal(p.accepted.length,3);assert.deepEqual(p.accepted.map(x=>x.number),['OLD001','OLD002','NEW003']);assert.equal(I.plan(rows,map,p.accepted).accepted.length,0);
});
test('Date objects, Excel serials and ROC dates; reject invalid dates',()=>{
 assert.equal(I.date(new Date(2026,11,25)),'2026-12-25');assert.equal(I.date(46381),'2026-12-25');assert.equal(I.date('1151225'),'2026-12-25');assert.equal(I.date('115/02/30'),'');
 const p=I.plan([['測試甲','TEST001','','強制險',new Date(2026,11,25),'']],map,[]);assert.equal(p.accepted[0].end,'2026-12-25');
});
test('invalid rows carry exact original worksheet row numbers',()=>{const p=I.plan([['','','','強制險','115/12/25',''],['測試','TEST','','強制險','115/02/30','']],map,[],[7,19]);assert.deepEqual(p.skipped.map(x=>x.row),[7,19]);assert.equal(p.accepted.length,0)});
test('normalized identity preserves different companies and types',()=>{const rows=[['甲','Ａ００１','','強制險','115/12/25',''],['甲','A001','','強制險','115/12/25',''],['甲','A001','','任意險','115/12/25','']];const p=I.plan(rows,map,[]);assert.equal(p.accepted.length,2);assert.equal(p.skipped.length,1)});
