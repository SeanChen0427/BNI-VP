import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildCaseResultAnnouncementMessage,
  buildCaseResultAnnouncementText,
  caseResultAnnouncementFingerprintSource,
  formatCaseResultDate,
} from "../../../supabase/functions/app-api/line-message.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const announcedAt = new Date("2026-08-09T16:30:00Z");

test("三類通過結果使用固定台北日期與正式公告文案", () => {
  assert.equal(formatCaseResultDate(announcedAt), "2026.8.10");
  assert.equal(buildCaseResultAnnouncementText({
    caseType: "new",
    applicant: "測試申請者",
    profession: "測試專業",
    referrerName: "測試引薦人",
    announcedAt,
  }), "【 2026.8.10 新會員入會投票結果 】\n\n申請者：測試申請者\n專業別：測試專業\n推薦人：測試引薦人\n\n商業訪談投票結果：通過\n----------------------\n以上經董事顧問確認後，特此公告，\n感謝邀請人、會員委員的付出協助！\n\n（只讀不回）");
  assert.match(buildCaseResultAnnouncementText({
    caseType: "renewal", applicant: "測試會員", profession: "測試專業", announcedAt,
  }), /^【 2026\.8\.10 續約會員投票結果 】[\s\S]*商業訪談投票結果：通過/);
  assert.match(buildCaseResultAnnouncementText({
    caseType: "industry",
    applicant: "測試會員",
    currentProfession: "原測試專業",
    newProfession: "新測試專業",
    announcedAt,
  }), /^【 2026\.8\.10 轉換專業別投票結果 】[\s\S]*原專業別：原測試專業[\s\S]*欲轉專業別：新測試專業[\s\S]*「原測試專業」已開放專業別/);
});

test("正式結果公告是純文字且不標註所有人", () => {
  const message = buildCaseResultAnnouncementMessage({
    caseType: "renewal", applicant: "測試會員", profession: "測試專業", announcedAt,
  });
  assert.equal(message.type, "text");
  assert.equal("substitution" in message, false);
  assert.doesNotMatch(message.text, /@All|@all|\{all\}/);
  assert.match(caseResultAnnouncementFingerprintSource("內容"), /^case-result-plain-text-v1\n/);
  assert.throws(() => buildCaseResultAnnouncementText({ caseType: "new", applicant: "甲", profession: "乙", referrerName: "", announcedAt }), /引薦人/);
  assert.throws(() => buildCaseResultAnnouncementText({ caseType: "industry", applicant: "甲", currentProfession: "乙", newProfession: "乙", announcedAt }), /不可相同/);
});

test("後端只允許通過、董顧確認與既有正式公告群，且成功送達後才推進案件", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260810143000_case_result_line_delivery.sql");
  const sendStart = edge.indexOf("async function sendCaseResultAnnouncement");
  const sendEnd = edge.indexOf("\nasync function caseStatesApi", sendStart);
  const sendSection = edge.slice(sendStart, sendEnd);

  assert.match(edge, /body\.kind === "result-announcement"/);
  assert.match(sendSection, /leadership\(context\)/);
  assert.match(sendSection, /workflow\.advisorStatus !== "confirmed"/);
  assert.match(sendSection, /snapshot\.result !== "approved"/);
  assert.match(sendSection, /投票不通過的案件不發布公告群/);
  assert.match(sendSection, /route_key=eq\.attendance&purpose=eq\.production/);
  assert.match(sendSection, /X-Line-Retry-Key/);
  assert.match(sendSection, /messages: \[lineMessage\]/);
  assert.match(sendSection, /await finishCaseResultLineDelivery\(delivery\.id,\s*\{\s*status: "sent"[\s\S]*?state = await markCaseResultAnnouncementSent/);
  assert.match(edge, /通過案件尚未成功發布公告群，不能結案/);
  assert.match(edge, /正式公告已發布，案件只能結案，不能重設/);
  assert.match(edge, /新會員申請者不能同時作為自己的引薦人/);

  assert.match(migration, /create table public\.case_result_line_deliveries/);
  assert.match(migration, /check \(decision_result = 'approved'\)/);
  assert.match(migration, /unique \(task_id, notification_type\)/);
  assert.match(migration, /revoke all on table public\.case_result_line_deliveries from public, anon, authenticated/);
  assert.match(migration, /target_group\.route_key <> 'attendance'/);
  assert.match(migration, /target_group\.purpose <> 'production'/);
  assert.match(migration, /target_snapshot\.result <> 'approved'/);
  assert.match(migration, /workflow->>'advisorStatus', ''\) <> 'confirmed'/);
});

test("介面只在副主席明確確認後呼叫正式發送，不會載入頁面自動送出", () => {
  const html = read("apps/vice-chair/case-workflow.html");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const newMemberHtml = read("apps/vice-chair/new-member-form.html");
  const newMemberLive = read("apps/vice-chair/assets/js/new-member-form-live.js");
  const industryHtml = read("apps/vice-chair/industry-change-form.html");

  assert.match(html, /id="resultAnnouncementPreview"/);
  assert.match(html, /id="sendResultAnnouncement"[^>]*disabled/);
  assert.match(store, /sendResultAnnouncement: taskId => postAction\(taskId, "result-announcement", \{\}\)/);
  const handlerStart = workflow.indexOf('$("#sendResultAnnouncement").addEventListener');
  const handlerEnd = workflow.indexOf('$("#closeCase").addEventListener', handlerStart);
  const handler = workflow.slice(handlerStart, handlerEnd);
  assert.match(handler, /confirm\(/);
  assert.match(handler, /所有會員都會看到/);
  assert.match(handler, /FulianCaseStateStore\.sendResultAnnouncement\(CASE_ID\)/);
  assert.doesNotMatch(workflow.slice(0, handlerStart), /sendResultAnnouncement\(CASE_ID\)/);
  assert.match(workflow, /rejected\?"本案表決不通過，依現行規則不發布公告群。"/);
  assert.match(workflow, /approved&&state\.resultAnnouncementSent/);
  assert.match(workflow, /resetCase"\)\.hidden=state\.closed\|\|state\.resultAnnouncementSent/);

  assert.match(newMemberHtml, /id="referrerName" data-save required/);
  assert.match(newMemberLive, /fetch\("\/api\/bni-analysis"/);
  assert.match(newMemberLive, /item\.name !== task\.member/);
  assert.match(industryHtml, /id="currentProfession" readonly data-save/);
});
