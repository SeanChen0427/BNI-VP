import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("複製三長群文案成功後，由後端保存並解鎖董顧階段", () => {
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const edge = read("supabase/functions/app-api/index.ts");
  const copyStart = workflow.indexOf('$("#copyLeaders").addEventListener');
  const copyEnd = workflow.indexOf('$("#sendLeaders").addEventListener', copyStart);
  const copyHandler = workflow.slice(copyStart, copyEnd);
  const apiStart = edge.indexOf("async function saveCaseLeadersSent");
  const apiEnd = edge.indexOf("\nasync function saveCaseAdvisorConfirmation", apiStart);
  const apiHandler = edge.slice(apiStart, apiEnd);

  assert.ok(copyHandler.indexOf("navigator.clipboard.writeText(leadersMessage())") >= 0);
  assert.ok(copyHandler.indexOf('saveLeadersStep(CASE_ID,"copy")') > copyHandler.indexOf("navigator.clipboard.writeText(leadersMessage())"));
  assert.match(copyHandler, /await lastPersist/);
  assert.match(copyHandler, /state=loadState\(\);render\(\)/);
  assert.doesNotMatch(copyHandler, /state\.leadersSent=true/, "前端不可自行假設三長群步驟已保存");

  assert.match(apiHandler, /completionMethod = .*=== "copy" \? "manual-copy" : "manual"/);
  assert.match(apiHandler, /leadersCompletionMethod: completionMethod/);
  assert.match(apiHandler, /leadersCompletedAt: completedAt/);
  assert.match(apiHandler, /leadersCompletedBy: context\.name/);
  assert.match(apiHandler, /p_expected_revision: Number\(existing\?\.revision \|\| 0\)/);
});

test("複製正式公告文案以獨立後端動作登記人工發布，不消耗 LINE Push", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const start = edge.indexOf("async function saveCaseResultAnnouncementCopy");
  const end = edge.indexOf("\nasync function saveCaseLeadersSent", start);
  const handler = edge.slice(start, end);

  assert.match(edge, /body\.kind === "result-announcement-copy"/);
  assert.match(edge, /saveCaseResultAnnouncementCopy\(access, existing, context\)/);
  assert.match(store, /recordResultAnnouncementCopy: taskId => postAction/);
  assert.match(store, /"result-announcement-copy"/);
  assert.match(handler, /leadership\(context\)/);
  assert.match(handler, /currentWorkflow\.advisorStatus !== "confirmed"/);
  assert.match(handler, /vote_snapshots\?case_id=.*select=result/);
  assert.match(handler, /decision !== "approved"/);
  assert.match(handler, /caseResultAnnouncementPayload\(access, existing, recordedAt\)/);
  assert.match(handler, /resultAnnouncementSent: true/);
  assert.match(handler, /resultAnnouncementMethod: "manual-copy"/);
  assert.match(handler, /resultAnnouncementRecordedBy: context\.name/);
  assert.match(handler, /p_expected_revision: Number\(existing\?\.revision \|\| 0\)/);
  assert.doesNotMatch(handler, /lineAccessToken|lineRequest|case_result_line_deliveries/);
});

test("案件頁在剪貼簿與 Supabase 都成功後才開放通過案件結案", () => {
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const start = workflow.indexOf('$("#copyResultAnnouncement").addEventListener');
  const end = workflow.indexOf('$("#sendResultAnnouncement").addEventListener', start);
  const handler = workflow.slice(start, end);

  assert.match(workflow, /resultCopyReady=isVp\(\)&&approved&&fieldsValid&&state\.advisorStatus==="confirmed"/);
  assert.ok(handler.indexOf("navigator.clipboard.writeText(resultAnnouncementText())") >= 0);
  assert.ok(handler.indexOf("recordResultAnnouncementCopy(CASE_ID)") > handler.indexOf("navigator.clipboard.writeText(resultAnnouncementText())"));
  assert.match(handler, /await lastPersist/);
  assert.match(handler, /state=loadState\(\);render\(\)/);
  assert.doesNotMatch(handler, /state\.resultAnnouncementSent=true/, "前端不可自行標記正式公告完成");
  assert.match(workflow, /approved&&state\.resultAnnouncementSent/);
  assert.match(html, /複製公告文案並登記人工發布/);
  assert.match(html, /複製成功即登記此步驟完成/);
});
