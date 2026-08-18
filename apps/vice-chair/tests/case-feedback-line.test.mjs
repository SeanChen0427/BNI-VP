import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildCaseFeedbackNoticeMessage,
  buildCaseFeedbackNoticeText,
  caseFeedbackNoticeFingerprintSource,
} from "../../../supabase/functions/app-api/line-message.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

const input = {
  caseType: "new",
  applicant: "測試會員",
  profession: "測試專業",
  interviewDate: "2026-08-18",
  leadInterviewer: "主訪甲",
  companionInterviewer: "陪訪乙",
  eligibleMembers: ["副主席", "委員甲", "委員甲", "委員乙"],
};

test("委員回饋通知由正式案件欄位與當期委員名單產生", () => {
  assert.equal(
    buildCaseFeedbackNoticeText(input),
    "【 新申請商訪表述&回饋 】\n請主、陪訪回饋與表述,並請委員們參照相簿中「訪談表」及「相關資料」回饋表述。各位為分會重要的守門員,請儘量給予回饋建議!\n------------------\n2026/08/18\n地點: ZOOM\n申請者: 測試會員\n專業別: 測試專業\n主訪：主訪甲 陪訪：陪訪乙\n------------------\n■ 副主席 -\n■ 委員甲 -\n■ 委員乙 -",
  );
  assert.match(buildCaseFeedbackNoticeText({ ...input, caseType: "renewal" }), /^【 續約商訪表述&回饋 】/);
  assert.match(buildCaseFeedbackNoticeText({ ...input, caseType: "industry" }), /^【 轉換行業別商訪表述&回饋 】/);
  assert.throws(() => buildCaseFeedbackNoticeText({ ...input, interviewDate: "" }), /訪談日期/);
  assert.throws(() => buildCaseFeedbackNoticeText({ ...input, eligibleMembers: [] }), /沒有可通知/);
});

test("正式回饋通知使用 LINE textV2 真正全群 mention", () => {
  const message = buildCaseFeedbackNoticeMessage({ ...input, profession: "測試{專業}" });
  assert.equal(message.type, "textV2");
  assert.equal(message.substitution.all.mentionee.type, "all");
  assert.match(message.text, /^\{all\}\n【 新申請商訪表述&回饋 】/);
  assert.match(message.text, /測試\{\{專業\}\}/);
  assert.match(caseFeedbackNoticeFingerprintSource("內容"), /^case-feedback-text-v2-mention-all-v1\n/);
});

test("後端只在 LINE 送達後標記回饋通知，且同案防止重送", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260818090000_case_feedback_line_delivery.sql");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");

  assert.match(edge, /body\.kind === "feedback-notice"/);
  assert.match(edge, /sendCaseFeedbackNotice\(access, existing, context\)/);
  assert.match(edge, /route_key=eq\.committee/);
  assert.match(edge, /target\.purpose !== "production"/);
  assert.match(edge, /await ensureTaskCase\(access, context\)/);
  assert.match(edge, /activeVotingRoster\(\)/);
  assert.match(edge, /workflow\.feedbackNotified && prior\?\.status !== "sent"/);
  assert.match(edge, /X-Line-Retry-Key/);
  const start = edge.indexOf("async function sendCaseFeedbackNotice");
  const section = edge.slice(start, edge.indexOf("\nasync function openVoteSnapshot", start));
  assert.match(
    section,
    /await finishCaseFeedbackLineDelivery\(delivery\.id,\s*\{\s*status: "sent"[\s\S]*?state = await markCaseFeedbackNoticeSent/,
    "必須先確認 LINE 送達，再推進案件狀態",
  );

  assert.match(migration, /create table public\.case_feedback_line_deliveries/);
  assert.match(migration, /unique \(task_id, notification_type\)/);
  assert.match(migration, /revoke all on table public\.case_feedback_line_deliveries from public, anon, authenticated/);
  assert.match(migration, /edge_mark_task_feedback_notice_sent/);
  assert.match(migration, /target_group\.route_key <> 'committee'/);
  assert.match(migration, /target_group\.purpose <> 'production'/);
  assert.match(migration, /target_delivery\.status <> 'sent'/);

  assert.match(store, /sendFeedbackNotice: taskId => postAction\(taskId, "feedback-notice", \{\}\)/);
  const handler = workflow.match(/\$\("#sendFeedbackNotice"\)\.addEventListener\("click",async\(\)=>\{[\s\S]*?\n  \}\);/)?.[0] || "";
  assert.match(handler, /FulianCaseStateStore\.sendFeedbackNotice\(CASE_ID\)/);
  assert.match(handler, /confirm\(/);
  assert.doesNotMatch(handler, /state\.feedbackNotified=true/);
  assert.doesNotMatch(workflow, /已模擬發送委員回饋通知/);
  assert.match(html, /id="feedbackLineState"/);
  assert.match(html, /通知委員（正式 LINE OA）/);
});
