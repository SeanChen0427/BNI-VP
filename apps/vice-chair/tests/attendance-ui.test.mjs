import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const html = read("apps/vice-chair/attendance.html");
const script = read("apps/vice-chair/assets/js/attendance.js");
const style = read("apps/vice-chair/assets/css/attendance-usability.css");
const edge = read("supabase/functions/app-api/index.ts");

assert.match(html, /id="reopenWeek"/);
assert.match(script, /action:"reopen"/);
assert.match(edge, /body\.action === "reopen"/);
assert.match(edge, /status: "draft"/);
assert.match(style, /\.preview-card,\n\.approval-card \{\n  position: static;/);
assert.match(style, /max-height: none;\n  overflow: visible;/);
assert.match(script, /navigator\.clipboard\?\.writeText/);
assert.match(script, /document\.execCommand\("copy"\)/);
assert.match(html, /id="sendLineAnnouncement"/);
assert.match(script, /settings\.html#lineBotGroups/);
assert.match(script, /action:"send-line"/);
assert.match(style, /\.preview-actions \.line-send/);

// Run the actual preview functions with anonymous members, including a saved
// all-unchecked row and an existing absence baseline.
const domain=createRequire(import.meta.url)("../core/attendance-domain.js");
const sandbox={
  AttendanceDomain:domain,confirmed:false,storedAnnouncement:"已確認歷史公告",
  palmsReady:true,rows:[
    {attendanceId:"test:1",name:"測試甲",at630:false,at700:false,late:false,early:false,proxy:false,absent:false,speech:false},
    {attendanceId:"test:2",name:"測試乙",proxy:true,speech:true},
    {attendanceId:"test:3",name:"測試丙",speech:true},
  ],
  priorLate:{},priorProxy:{},priorAbsence:{"test:1":1},
  $:selector=>({value:selector==="#meetingDate"?"2026-09-15":"25"}),
  calendar:{taipeiParts:()=>({year:2026,month:9,day:15})},
};
vm.createContext(sandbox);
vm.runInContext(script.slice(script.indexOf("  function currentLate("),script.indexOf("  function applyPermissions(")),sandbox);
assert.match(sandbox.buildAnnouncement(),/■本週缺席\(1位\)：測試甲\n/);
assert.match(sandbox.buildAnnouncement(),/\*缺席累計\(2次\)：測試甲\n/);
sandbox.rows[0].speech=true;
assert.match(sandbox.buildAnnouncement(),/■本週缺席\(0位\)：\n/);
assert.match(sandbox.buildAnnouncement(),/\*缺席累計\(1次\)：測試甲\n/);
sandbox.confirmed=true;
assert.equal(sandbox.buildAnnouncement(),"已確認歷史公告","已鎖定公告快照不因重新計算而被改寫");

console.log("attendance UI tests passed");
