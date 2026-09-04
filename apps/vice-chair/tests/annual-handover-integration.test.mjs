import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const page = read("apps/vice-chair/settings.html");
const settings = read("apps/vice-chair/assets/js/settings.js");
const handover = read("apps/vice-chair/assets/js/annual-handover.js");
const auth = read("apps/vice-chair/assets/js/auth.js");
const planner = read("apps/vice-chair/assets/js/work-planner.js");
const taskStore = read("apps/vice-chair/assets/js/task-store.js");
const caseBoard = read("apps/vice-chair/assets/js/case-board.js");
const caseArchive = read("apps/vice-chair/assets/js/case-archive.js");
const monthlyMeeting = read("apps/vice-chair/assets/js/monthly-meeting.js");
const edge = read("supabase/functions/app-api/index.ts");
const cron = read("supabase/functions/line-reminder-cron/index.ts");
const migration = read("supabase/migrations/20260904150000_annual_committee_handover.sql");

test("年度換屆只在 Admin 設定頁出現，日常名單不再逐筆增刪", () => {
  assert.match(page, /id="annualHandoverCard" hidden/);
  assert.match(page, /僅系統開發人員 Admin 可見與排定/);
  assert.match(handover, /if\(session\?\.role!=="admin"\)return/);
  assert.match(edge, /async function annualHandoverApi[\s\S]*context\.role !== "admin"/);
  assert.doesNotMatch(page, /id="saveVp"|id="addMember"|data-remove=/);
  assert.doesNotMatch(settings, /#saveVp|#addMember|data-remove/);
});

test("排定前先預覽，生效日前不更動正式名單", () => {
  assert.match(handover, /action:"preview"/);
  assert.match(handover, /名單或日期有異動，請先重新預覽影響/);
  assert.match(handover, /action:"save"/);
  assert.match(handover, /action:"cancel"/);
  assert.match(edge, /if \(body\.action === "preview"\) return \{ preview \}/);
  assert.match(edge, /rpc\/edge_schedule_committee_handover/);
  assert.match(edge, /rpc\/edge_cancel_committee_handover/);
  assert.match(migration, /committee_handover_one_scheduled/);
  assert.match(migration, /term_ends_on = private\.annual_term_ends_on\(effective_on\)/);
  assert.match(migration, /date_trunc\('month', p_effective_on::timestamp\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where status = 'scheduled' and effective_on <= v_today[\s\S]*for update skip locked/);
});

test("留任且角色不變者不改派，卸任或轉任的未完成工作才進入集中交接", () => {
  assert.match(edge, /\.\.\.diff\.roleChanges\.map/);
  assert.match(migration, /target\.person_id = term\.person_id\s+and target\.role = term\.role/);
  assert.match(migration, /task\.status in \('pending', 'in_progress'\)/);
  assert.match(migration, /task\.source = 'vice-chair-work-plan'/);
  assert.match(edge, /handover_pending=eq\.false/);
  assert.match(migration, /handover_original_assignments = v_assignments/);
  assert.match(migration, /卸任或轉任人員的未完成工作/);
  assert.match(planner, /counts\.handover\?`<button data-filter="handover"/);
  assert.match(planner, /一次儲存全部指派/);
  assert.match(planner, /task\.handoverPending\?"":personalActionLabel/);
  assert.match(taskStore, /action: "handover-reassign"/);
  assert.match(edge, /rpc\/edge_reassign_handover_tasks/);
  assert.match(edge, /assignments\.length !== taskByReference\.size/);
  assert.match(migration, /HANDOVER_ASSIGNMENTS_CHANGED/);
  assert.match(migration, /HANDOVER_TASK_PENDING/);
  assert.match(edge, /access\.task\.handover_pending[\s\S]*此案件正在換屆待指派/);
  assert.match(edge, /row\.handover_pending[\s\S]*集中交接/);
});

test("原指派、改派人與結案確認人都可回追，已結案資料不可改寫", () => {
  assert.match(migration, /create table public\.task_assignment_history/);
  assert.match(migration, /previous_assignments jsonb/);
  assert.match(migration, /new_assignments jsonb/);
  assert.match(migration, /actor_name_snapshot text/);
  assert.match(migration, /task_assignment_history_immutable/);
  assert.match(migration, /committee_handover_events_immutable/);
  assert.match(migration, /protect_completed_task_update/);
  assert.match(migration, /protect_completed_task_assignments/);
  assert.match(migration, /protect_completed_task_details/);
  assert.match(migration, /protect_completed_task_state/);
  assert.match(migration, /protect_completed_task_file/);
  assert.match(migration, /protect_closed_case_assignments/);
  assert.match(edge, /completedBy: meta\.completedBy \|\| directory\.personById\.get\(row\.completed_by\)/);
  assert.match(edge, /assignmentHistory: historyByTask\.get\(row\.id\)/);
  assert.match(edge, /已結案歷史不可刪除/);
  assert.match(edge, /案件已結案，正式 Word 只能下載，不能覆寫/);
  assert.match(edge, /已結案歷史不可修改；原主責、陪訪、回饋、投票與結案人均維持原紀錄/);
  assert.match(caseBoard, /canDelete && stage !== "closed"/);
  assert.match(caseArchive, /fact\("結案確認人", task\.completedBy\)/);
  assert.match(caseArchive, /task\.assignmentHistory/);
});

test("生效觸發具備冪等、失敗隔離與歷史出席保留", () => {
  assert.match(auth, /rpc\/edge_apply_due_committee_handoffs/);
  assert.match(auth, /catch\(error\)\{console\.error\("年度換屆自動生效失敗/);
  assert.match(edge, /console\.error\("年度換屆自動生效失敗/);
  assert.match(cron, /rpc\/edge_apply_due_committee_handoffs/);
  assert.match(cron, /handoverWarning: handoverWarning \|\| null/);
  assert.match(migration, /left join public\.members member[\s\S]*HANDOVER_MEMBER_INACTIVE/);
  assert.match(migration, /status = 'executed'/);
  assert.match(monthlyMeeting, /\.\.\.current,\.\.\.selected\.filter\(Boolean\)/);
  assert.match(monthlyMeeting, /（歷史出席）/);
});
