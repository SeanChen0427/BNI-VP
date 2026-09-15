import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const domain=require("../core/attendance-domain.js");

assert.deepEqual(
  domain.mergeTotals(
    {late:1,proxy:2,absence:0},
    {late:1,proxy:1,absence:1}
  ),
  {late:2,proxy:3,absence:1}
);

assert.deepEqual(
  domain.cumulativeFor(
    {late:true,early:false,proxy:true,absent:false,speech:true},
    {late:2,proxy:3,absence:1}
  ),
  {late:3,lateRemainder:0,proxy:4,absence:2}
);

assert.equal(
  domain.isOperationalAbsence({at630:true,proxy:false,speech:false}),
  true,
  "到場但未完成會員簡報仍依現行公告規則列入作業缺席"
);
const unchecked={at630:false,at700:false,late:false,early:false,proxy:false,absent:false,speech:false,badge:false,pin:false,suit:false,camera:false};
assert.equal(domain.isOperationalAbsence(unchecked),true,"整列未勾選不得漏列作業缺席");
assert.deepEqual(domain.operationalCounts(unchecked),{late:0,proxy:0,absence:1});
assert.deepEqual(domain.cumulativeFor(unchecked,{late:0,proxy:0,absence:1}),{late:0,lateRemainder:0,proxy:0,absence:2});
assert.equal(domain.isOperationalAbsence({present_0630:false,present_0700:false,proxy:false,absent:false,presentation_completed:false}),true,"後端儲存欄位也必須判定全未勾選缺席");
for(const record of [{...unchecked,proxy:true},{...unchecked,speech:true},{presentation_completed:true},{proxy:true,presentation_completed:false}]){
  assert.equal(domain.isOperationalAbsence(record),false,"代理或已完成簡報不因未勾到會而列缺席");
}
assert.equal(domain.isOperationalAbsence({...unchecked,badge:true,pin:true,suit:true,camera:true}),true,"商務環境觀察不抵銷缺席");
assert.equal(domain.isOperationalAbsence({...unchecked,absent:true,speech:true}),true,"明確缺席仍優先於簡報欄位");
assert.equal(
  domain.isUnreconciledMeeting("2026-07-07","2026-06-30","2026-07-14"),
  true
);
assert.equal(
  domain.isUnreconciledMeeting("2026-07-07","2026-07-31","2026-08-04"),
  false,
  "新版 PALMS 已涵蓋的週次不得再次累加"
);

console.log("attendance domain tests passed");
