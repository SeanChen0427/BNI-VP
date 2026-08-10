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
assert.equal(calendar.defaultVoteDeadline(now),"2026-07-18T18:00");
assert.deepEqual(calendar.renewalPalmsPeriod({renewalCount:"1",membershipStart:"2025-10-01",now:new Date(2026,7,10)}),{start:"2025-10-01",end:"2026-07-31",monthCount:10,first:true});
assert.deepEqual(calendar.renewalPalmsPeriod({renewalCount:"2",membershipStart:"2024-10-01",now:new Date(2026,7,10)}),{start:"2025-08-01",end:"2026-07-31",monthCount:12,first:false});
assert.equal(calendar.renewalPalmsPeriod({renewalCount:"",membershipStart:"2025-10-01",now}),null);

console.log("calendar-domain tests passed");
