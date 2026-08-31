import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("董顧確認使用獨立後端動作，只更新最新正式案件的董顧欄位", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const start = edge.indexOf("async function saveCaseAdvisorConfirmation");
  const end = edge.indexOf("\nasync function caseStatesApi", start);
  const handler = edge.slice(start, end);

  assert.match(edge, /body\.kind === "advisor-confirmation"/);
  assert.match(edge, /saveCaseAdvisorConfirmation\(access, existing, context, body\.value\)/);
  assert.match(handler, /leadership\(context\)/);
  assert.match(handler, /currentWorkflow\.leadersSent/);
  assert.match(handler, /vote_snapshots\?case_id=.*select=result/);
  assert.match(handler, /\["approved", "rejected"\]\.includes\(decision\)/);
  assert.match(handler, /\["pending", "confirmed", "returned"\]\.includes\(advisorStatus\)/);
  assert.match(handler, /p_expected_revision: Number\(existing\?\.revision \|\| 0\)/);
  assert.match(handler, /p_workflow: workflow/);
  assert.match(handler, /p_draft: existing\?\.draft \|\| \{\}/);
  assert.doesNotMatch(handler, /body\.revision/, "董顧動作不可用瀏覽器舊 revision 覆寫整筆案件");
});

test("三長群步驟先由後端保存，成功後才解鎖董顧確認", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const apiStart = edge.indexOf("async function saveCaseLeadersSent");
  const apiEnd = edge.indexOf("\nasync function saveCaseAdvisorConfirmation", apiStart);
  const apiHandler = edge.slice(apiStart, apiEnd);
  const uiStart = workflow.indexOf('$("#sendLeaders").addEventListener');
  const uiEnd = workflow.indexOf('$("#saveAdvisor").addEventListener', uiStart);
  const uiHandler = workflow.slice(uiStart, uiEnd);

  assert.match(edge, /body\.kind === "leaders-sent"/);
  assert.match(edge, /saveCaseLeadersSent\(access, existing, context, body\.value\)/);
  assert.match(apiHandler, /leadership\(context\)/);
  assert.match(apiHandler, /vote_snapshots\?case_id=.*select=result/);
  assert.match(apiHandler, /leadersSent: true/);
  assert.match(apiHandler, /p_expected_revision: Number\(existing\?\.revision \|\| 0\)/);
  assert.match(store, /saveLeadersStep: \(taskId, method = "manual"\) => postAction/);
  assert.match(store, /"leaders-sent",\s*\{ method \}/);
  assert.match(uiHandler, /async\(\)=>/);
  assert.match(uiHandler, /saveLeadersStep\(CASE_ID,"manual"\)/);
  assert.match(uiHandler, /await lastPersist/);
  assert.match(uiHandler, /state=loadState\(\);render\(\)/);
  assert.doesNotMatch(uiHandler, /state\.leadersSent=true/, "後端成功前不可先解鎖董顧確認");
});

test("一般流程保存不能再悄悄覆寫董顧確認", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const workflowStart = edge.indexOf('} else if (body.kind === "workflow")');
  const workflowEnd = edge.indexOf('\n  } else {\n    throw new Error("不支援的案件同步類型")', workflowStart);
  const workflowHandler = edge.slice(workflowStart, workflowEnd);

  assert.match(workflowHandler, /董事顧問確認須由新版案件頁獨立保存/);
  assert.match(workflowHandler, /workflow\.advisorStatus = currentWorkflow\.advisorStatus \|\| "pending"/);
  assert.match(workflowHandler, /workflow\.advisorNote = currentWorkflow\.advisorNote \|\| ""/);
  assert.match(workflowHandler, /workflow\.leadersSent = Boolean\(currentWorkflow\.leadersSent\)/);
});

test("案件頁等 Supabase 保存成功才套用董顧狀態，失敗時顯示原因", () => {
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const start = workflow.indexOf('$("#saveAdvisor").addEventListener');
  const end = workflow.indexOf('$("#copyResultAnnouncement").addEventListener', start);
  const handler = workflow.slice(start, end);

  assert.match(store, /saveAdvisorConfirmation: \(taskId, status, note = ""\) => postAction/);
  assert.match(store, /"advisor-confirmation"/);
  assert.match(store, /#advisorStatus, #advisorNote/);
  assert.match(handler, /async\(\)=>/);
  assert.match(handler, /await lastPersist/);
  assert.match(handler, /saveAdvisorConfirmation\(CASE_ID,advisorStatus,advisorNote\)/);
  assert.match(handler, /state=loadState\(\);render\(\)/);
  assert.match(handler, /董事顧問確認尚未保存/);
  assert.doesNotMatch(handler, /state\.advisorStatus=/, "後端成功前不可先把本機狀態標成董顧同意");
  assert.match(html, /id="advisorSaveState"[^>]*role="status"/);
  assert.match(html, /id="closeCaseHint"/);
  assert.match(html, /case-state-store\.js\?v=16/);
  assert.match(html, /case-workflow\.js\?v=30/);
});
