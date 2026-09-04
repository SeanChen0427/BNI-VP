import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const domain=require("../core/annual-handover-domain.js");

assert.equal(domain.termEndsOn("2026-10-01"),"2027-09-30");
assert.equal(domain.termEndsOn("2028-02-29"),"2029-02-28");
assert.equal(domain.termEndsOn("2026-02-30"),"");
assert.equal(domain.nextOctoberFirst("2026-09-04"),"2026-10-01");
assert.equal(domain.nextOctoberFirst("2026-10-01"),"2027-10-01");

const current=[
  {personId:"vp-old",name:"原副主席",role:"vp"},
  {personId:"stay",name:"留任委員",role:"committee"},
  {personId:"leave",name:"卸任委員",role:"committee"},
  {personId:"promote",name:"升任委員",role:"committee"}
];
const next=[
  {personId:"promote",name:"升任委員",role:"vp"},
  {personId:"stay",name:"留任委員",role:"committee"},
  {personId:"new",name:"新任委員",role:"committee"}
];
const diff=domain.rosterDiff(current,next);
assert.deepEqual(diff.retained.map(item=>item.personId),["stay"]);
assert.deepEqual(diff.roleChanges,[{personId:"promote",name:"升任委員",fromRole:"committee",toRole:"vp"}]);
assert.deepEqual(diff.outgoing.map(item=>item.personId),["vp-old","leave"]);
assert.deepEqual(diff.incoming.map(item=>item.personId),["new"]);

assert.equal(domain.validateRoster(next).valid,true);
assert.equal(domain.validateRoster(next.concat(next[0])).valid,false);
assert.match(domain.validateRoster([{personId:"a",name:"甲",role:"committee"}]).errors.join("、"),/副主席/);
assert.match(domain.validateRoster([{personId:"a",name:"甲",role:"vp"}]).errors.join("、"),/會員委員/);

console.log("annual handover domain tests passed");
