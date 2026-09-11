import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadAttendanceHistory } from "../../../supabase/functions/app-api/attendance-history.mjs";

test("attendance index keeps older weeks across database page caps", async () => {
  const dates=Array.from({length:1100},(_,i)=>({meeting_date:new Date(Date.UTC(2026,8,8-i*7)).toISOString().slice(0,10),status:"confirmed",confirmed_at:null}));
  let calls=0;
  const result=await loadAttendanceHistory(async path=>{
    calls++;
    const query=new URLSearchParams(path.split("?")[1]);
    assert.equal(query.get("select"),"meeting_date,status,confirmed_at");
    const before=query.get("meeting_date")?.slice(3);
    return dates.filter(row=>!before||row.meeting_date<before).slice(0,137);
  });
  assert.deepEqual(result,dates);
  assert.ok(calls>8);
  assert.deepEqual(await loadAttendanceHistory(async()=>[]),[]);
  await assert.rejects(loadAttendanceHistory(async()=>{throw new Error("database unavailable")}),/database unavailable/);
});

test("selected attendance session is fetched independently of the recent history index",()=>{
  const source=readFileSync(new URL("../../../supabase/functions/app-api/index.ts",import.meta.url),"utf8");
  const state=source.slice(source.indexOf("async function attendanceState("),source.indexOf("async function saveAttendanceSession("));
  assert.match(state,/loadAttendanceHistory\(db\)/);
  assert.match(state,/meeting_date=eq\.\$\{meetingDate\}&select=\*&limit=1/);
  assert.match(state,/currentSession = selectedSessions\[0\]/);
  assert.doesNotMatch(state,/limit=30|sessions\.find/);
});

test("date navigation waits for pending saves and keeps the original week on save failure",async()=>{
  const source=readFileSync(new URL("../assets/js/attendance.js",import.meta.url),"utf8");
  const navigation=source.slice(source.indexOf("  async function switchDate("),source.indexOf("  function update("));
  const calls=[],input={value:"2026-09-01"};
  let finishSave;
  const sandbox={calendar:{dateInput:value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:""},$:()=>input,clearTimeout:()=>{},timer:1,activeDate:"2026-09-08",dateLoading:false,draftDirty:true,pendingSave:new Promise(resolve=>finishSave=resolve),renderRows:()=>{},renderHistory:()=>{},update:()=>{},toast:message=>calls.push("toast"),saveDraft:async()=>{calls.push("save");return true},loadDate:async date=>{calls.push(date)}};
  vm.createContext(sandbox);vm.runInContext(navigation,sandbox);
  const switching=sandbox.switchDate("2026-09-01");
  assert.equal(input.value,"2026-09-08");
  assert.equal(sandbox.dateLoading,true);
  assert.deepEqual(calls,[]);
  sandbox.pendingSave=null;finishSave();await switching;
  assert.deepEqual(calls,["save","2026-09-01"]);
  assert.equal(sandbox.dateLoading,false);
  calls.length=0;sandbox.saveDraft=async()=>false;
  await sandbox.switchDate("2025-01-07");
  assert.deepEqual(calls,["toast"]);
  assert.equal(input.value,"2026-09-08");
  assert.equal(sandbox.dateLoading,false);
  calls.length=0;
  await sandbox.switchDate("");await sandbox.switchDate("2026-09-08");
  assert.deepEqual(calls,[]);
});
