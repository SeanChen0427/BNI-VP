import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),domain=require('../core/interview-template-domain.js');
const base={member:'合成會員',period:{start:'2025-10-01',end:'2026-09-30'},metrics:{oneToOne:96,education:18,visitors:4,givenIn:44,givenOut:100},interview:{chapterVisitorMinimum:'6'}};
const apply=options=>domain.prefillRenewalMetricStatuses({...base,...options});
test('等於與高於公版四項門檻達標；分會嘉賓另依自訂門檻',()=>{
 const result=apply({});for(const key of Object.keys(domain.RENEWAL_METRIC_STANDARDS))assert.equal(result.interview[key],'met');assert.equal(result.interview.chapterVisitorsStatus,'unmet');
 const higher=apply({metrics:{oneToOne:100,education:30,visitors:10,givenIn:100,givenOut:200}});assert.ok(Object.keys(higher.tracking).every(k=>higher.interview[k]==='met'));
});
test('照片範例培訓8、嘉賓2、引薦90均未達；引薦必須合計兩欄',()=>{
 const v=apply({metrics:{oneToOne:80,education:8,visitors:2,givenIn:30,givenOut:60}}).interview;
 for(const key of Object.keys(domain.RENEWAL_METRIC_STANDARDS))assert.equal(v[key],'unmet');
});
test('缺資料、未知期間、非數字及負數不推定零；真正0可判未達',()=>{
 for(const metric of [undefined,null,NaN,Infinity,-1,'18'])assert.equal(apply({metrics:{...base.metrics,education:metric}}).interview.educationStatus,undefined);
 assert.equal(apply({metrics:{...base.metrics,education:0}}).interview.educationStatus,'unmet');
 assert.equal(apply({metrics:{...base.metrics,givenOut:null}}).interview.referralsStatus,undefined);
 assert.deepEqual(apply({period:null}).tracking,{});
 for(const minimum of ['',null,'未知','-1'])assert.equal(apply({interview:{chapterVisitorMinimum:minimum}}).interview.chapterVisitorsStatus,undefined);
 assert.equal(apply({interview:{chapterVisitorMinimum:'0'}}).interview.chapterVisitorsStatus,'met');
});
test('同資料重新開啟保留人工調整及既有填答，不修改輸入物件',()=>{
 const first=apply({}),interview={...first.interview,educationStatus:'unmet'};
 const snapshot=JSON.stringify(interview);const again=apply({interview,tracking:first.tracking});assert.equal(again.interview.educationStatus,'unmet');assert.equal(JSON.stringify(interview),snapshot);
 assert.equal(apply({interview:{educationStatus:'unmet'}}).interview.educationStatus,'unmet');
});
test('更換期間、會員、實際數據或分會標準，重新預選而非沿用人工或自動舊值',()=>{
 const first=apply({}),interview={...first.interview,educationStatus:'unmet'};
 assert.equal(apply({interview,tracking:first.tracking,period:{start:'2024-10-01',end:'2025-09-30'}}).interview.educationStatus,'met');
 assert.equal(apply({interview,tracking:first.tracking,member:'另一合成會員'}).interview.educationStatus,'met');
 assert.equal(apply({interview,tracking:first.tracking,metrics:{...base.metrics,education:30}}).interview.educationStatus,'met');
 assert.equal(apply({interview:{...first.interview,chapterVisitorMinimum:'2'},tracking:first.tracking}).interview.chapterVisitorsStatus,'met');
 assert.equal(apply({interview,tracking:first.tracking,metrics:null}).interview.educationStatus,undefined);
});
test('預選及人工調整皆沿用公版欄位映射，追蹤資料不輸出 Word',()=>{
 const first=apply({metrics:{...base.metrics,education:8}}),draft={renewalInterview:first.interview,renewalMetricDefaults:first.tracking};
 const auto=domain.fields(draft,'合成會員','renewal');assert.equal(auto.educationStatusUnmet,'■');assert.equal(auto.educationStatusMet,'□');assert.equal(auto.oneToOneStatusMet,'■');
 const manual=domain.fields({...draft,renewalInterview:{...first.interview,educationStatus:'met'}},'合成會員','renewal');assert.equal(manual.educationStatusMet,'■');assert.equal(manual.educationStatusUnmet,'□');assert.ok(!JSON.stringify(manual).includes('2025-10-01'));
});
