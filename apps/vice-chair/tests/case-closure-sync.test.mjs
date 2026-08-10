import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("正式結案交易重新驗證登入者，不放寬案件關閉 trigger", () => {
  const migration = read("supabase/migrations/20260804013000_fix_service_role_case_closure.sql");
  const edge = read("supabase/functions/app-api/index.ts");

  assert.match(migration, /edge_save_case_state_as_user/);
  assert.match(migration, /app_accounts/);
  assert.match(migration, /committee_terms/);
  assert.match(migration, /request\.jwt\.claim\.sub/);
  assert.match(migration, /actor_role not in \('admin', 'vp'\)/);
  assert.doesNotMatch(migration, /create or replace function private\.protect_case_closure/);
  assert.doesNotMatch(migration, /\b(update|delete|insert into)\s+public\./i, "修正不得改寫任何既有案件資料");
  assert.match(edge, /rpc\/edge_save_case_state_as_user/);
  assert.match(edge, /rpc\/edge_reset_task_case_as_user/);
  assert.match(edge, /p_actor_auth_user_id: context\.userId/);
});

test("前台只在 Supabase 結案成功後套用正式狀態", () => {
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const handler = workflow.match(/\$\("#closeCase"\)\.addEventListener\("click",async\(\)=>\{.*?\}\);/)?.[0] || "";

  assert.match(store, /saveWorkflow: \(taskId, workflow\) => postAction\(taskId, "workflow", workflow\)/);
  assert.match(handler, /saveWorkflow\(CASE_ID,proposed\)/);
  assert.match(handler, /state=loadState\(\);render\(\)/);
  assert.doesNotMatch(handler, /state\.closed=true/, "伺服器成功前不可先把本機畫面標成已結案");
  assert.match(workflow, /\$\("#resetCase"\)\.hidden=state\.closed/);
  assert.match(html, /Supabase 正式資料/);
  assert.match(html, /case-workflow\.js\?v=20/);
});

test("結案交易必須先鎖定回饋，再把案件標為 closed", () => {
  const migration = read("supabase/migrations/20260804014500_fix_case_feedback_lock_order.sql");
  const lockFeedback = migration.indexOf("update public.case_feedback");
  const closeCase = migration.indexOf("update public.cases");

  assert.ok(lockFeedback >= 0, "結案交易必須鎖定正式回饋");
  assert.ok(closeCase > lockFeedback, "不得先關閉案件再鎖定回饋，否則完整性 trigger 會回滾交易");
  assert.match(migration, /set status = 'closed'/);
  assert.match(migration, /set status = 'completed'/);
});
