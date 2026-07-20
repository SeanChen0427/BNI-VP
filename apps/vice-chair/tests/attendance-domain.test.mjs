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
