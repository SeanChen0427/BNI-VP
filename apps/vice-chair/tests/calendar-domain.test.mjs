import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const calendar=require("../core/calendar-domain.js");
const now=new Date(2026,6,17,9,30);

assert.equal(calendar.daysUntil("2026-07-15",now),-2);
assert.equal(calendar.daysUntil("2026-08-15",now),29);
assert.equal(calendar.countdownLabel(-2),"已逾期 2 天");
assert.equal(calendar.countdownLabel(0),"今天截止");
assert.equal(calendar.countdownLabel(1),"明天截止");
assert.equal(calendar.countdownLabel(29),"29 天");
assert.equal(calendar.sameMonth("2026-07-31T23:00",now),true);
assert.equal(calendar.sameMonth("2026-08-01T09:00",now),false);
assert.deepEqual(calendar.monthHeading(new Date(2026,7,1)),{year:2026,month:8,english:"AUGUST"});
assert.equal(calendar.dateInput(now),"2026-07-17");
assert.equal(calendar.monthKey(now),"2026-07");
assert.equal(calendar.shiftMonthKey("2026-01",-1),"2025-12");
assert.equal(calendar.monthEndDate("2026-02"),"2026-02-28");
assert.equal(calendar.formatTaipeiTimestamp("2026-07-21T01:11:32.000Z",{seconds:true}),"7/21 09:11:32");
assert.equal(calendar.formatTaipeiTimestamp("2026-07-20T16:09:07.000Z",{seconds:true,year:true}),"2026/7/21 00:09:07");
assert.equal(calendar.formatTaipeiTimestamp("not-a-time",{seconds:true}),"");
assert.equal(calendar.analysisEffectiveOn("2026-08-31"),"2026-09-01");
assert.deepEqual(calendar.monthlyAnalysisCycle(new Date(2026,7,30)),{
  today:"2026-08-30",
  currentMonth:"2026-08",
  active:{reportMonth:"2026-07",meetingMonth:"2026-08",effectiveOn:"2026-08-01",phase:"active"},
  preparation:null
});
assert.deepEqual(calendar.monthlyAnalysisCycle(new Date(2026,7,31)),{
  today:"2026-08-31",
  currentMonth:"2026-08",
  active:{reportMonth:"2026-07",meetingMonth:"2026-08",effectiveOn:"2026-08-01",phase:"active"},
  preparation:{reportMonth:"2026-08",meetingMonth:"2026-09",effectiveOn:"2026-09-01",phase:"preparation"}
});
assert.deepEqual(calendar.monthlyAnalysisCycle(new Date(2026,8,1)),{
  today:"2026-09-01",
  currentMonth:"2026-09",
  active:{reportMonth:"2026-08",meetingMonth:"2026-09",effectiveOn:"2026-09-01",phase:"active"},
  preparation:null
});
assert.equal(calendar.defaultVoteDeadline(now),"2026-07-18T18:00");
assert.deepEqual(calendar.renewalPalmsPeriod({renewalCount:"1",membershipStart:"2025-10-01",now:new Date(2026,7,10)}),{start:"2025-10-01",end:"2026-07-31",monthCount:10,first:true});
assert.deepEqual(calendar.renewalPalmsPeriod({renewalCount:"2",membershipStart:"2024-10-01",now:new Date(2026,7,10)}),{start:"2025-08-01",end:"2026-07-31",monthCount:12,first:false});
assert.equal(calendar.renewalPalmsPeriod({renewalCount:"",membershipStart:"2025-10-01",now}),null);

console.log("calendar-domain tests passed");
