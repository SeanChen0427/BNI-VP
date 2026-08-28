import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildCaseVoteNoticeMessage,
  buildCaseVoteNoticeText,
  caseVoteNoticeFingerprintSource,
  formatCaseVoteDeadline,
} from "../../../supabase/functions/app-api/line-message.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("投票通知文案依案件類型與台北截止時間產生", () => {
  const now = new Date("2026-08-08T04:00:00Z");
  const deadline = "2026-08-09T10:00:00Z";
  assert.equal(formatCaseVoteDeadline(deadline, now), "明天晚上6點");
  const text = buildCaseVoteNoticeText({
    caseType: "new",
    applicant: "測試會員",
    profession: "測試專業",
    deadlineAt: deadline,
    now,
  });
  assert.equal(text, "【新申請投票】\n申請者：測試會員\n專業別：測試專業\n\n請各位委員針對表述回饋及相關文件，開始進行投票！\n截止至明天晚上6點前\n會員委員及副主席擁有各一票投票權，董事顧問有最終裁量權。\n攸關團隊品質，請委員們參閱回饋務必投下這一票！\n***完成投票請 tag 回覆「已投」");
  assert.match(buildCaseVoteNoticeText({ caseType: "renewal", applicant: "甲", profession: "乙", deadlineAt: deadline, now }), /^【續約投票】/);
  assert.match(buildCaseVoteNoticeText({ caseType: "industry", applicant: "甲", profession: "乙", deadlineAt: deadline, now }), /^【轉換行業別投票】/);
  assert.equal(formatCaseVoteDeadline("2026-08-12T06:10:00Z", now), "2026/8/12 下午2:10");
  assert.throws(() => buildCaseVoteNoticeText({ caseType: "new", applicant: "甲", profession: "", deadlineAt: deadline, now }), /專業別尚未填寫/);
});

test("正式 LINE 訊息使用真正全群 mention 並納入格式指紋", () => {
  const message = buildCaseVoteNoticeMessage({
    caseType: "new",
    applicant: "測試會員",
    profession: "測試{專業}",
    deadlineAt: "2026-08-09T10:00:00Z",
    now: new Date("2026-08-08T04:00:00Z"),
  });
  assert.equal(message.type, "textV2");
  assert.equal(message.substitution.all.mentionee.type, "all");
  assert.match(message.text, /^\{all\}\n【新申請投票】/);
  assert.match(message.text, /測試\{\{專業\}\}/);
  assert.match(caseVoteNoticeFingerprintSource("內容"), /^case-vote-text-v2-mention-all-v1\n/);
});

test("年度培訓與來賓欄位只在續約案件顯示", () => {
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const css = read("apps/vice-chair/assets/css/case-workflow-extra.css");

  assert.match(html, /id="renewalExtra" hidden/);
  assert.match(html, /case-workflow-extra\.css\?v=4/);
  assert.match(workflow, /\$\("#renewalExtra"\)\.hidden=\$\("#caseType"\)\.value!=="renewal"/);
  assert.match(workflow, /catch\{if\(\$\("#caseType"\)\.value==="renewal"\)/);
  assert.match(css, /\.renewal-extra\[hidden\],[\s\S]*?\.annual-data-source\[hidden\][\s\S]*?display: none !important/);
});

test("後端只以正式案件、正式委員會群與投票快照發送", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260808211500_case_vote_line_delivery.sql");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");

  assert.match(edge, /body\.kind === "vote-notice"/);
  assert.match(edge, /route_key=eq\.committee/);
  assert.match(edge, /target\.purpose !== "production"/);
  assert.match(edge, /vote_snapshots\?case_id=eq\.\$\{access\.task\.case_id\}&status=eq\.open/);
  assert.match(edge, /applicant: access\.task\.title/);
  assert.match(edge, /profession: taskMeta\.profession \|\| workflow\.form\?\.profession/);
  assert.match(edge, /X-Line-Retry-Key/);
  assert.match(edge, /messages: \[lineMessage\]/);
  assert.match(edge, /workflow\.voteNoticeSent && prior\?\.status !== "sent"/);
  const sendStart = edge.indexOf("async function sendCaseVoteNotice");
  const sendSection = edge.slice(sendStart, edge.indexOf("\nasync function caseStatesApi", sendStart));
  assert.match(
    sendSection,
    /await finishCaseVoteLineDelivery\(delivery\.id,\s*\{\s*status: "sent"[\s\S]*?state = await markCaseVoteNoticeSent/,
    "必須先確認 LINE 送達，再推進案件狀態",
  );
  assert.match(edge, /proposed\.voteNoticeSent = false/);

  assert.match(migration, /create table public\.case_vote_line_deliveries/);
  assert.match(migration, /unique \(task_id, snapshot_id, group_target_id, notification_type, deadline_at, message_sha256\)/);
  assert.match(migration, /revoke all on table public\.case_vote_line_deliveries from public, anon, authenticated/);
  assert.match(migration, /edge_mark_task_vote_notice_sent/);
  assert.match(migration, /target_snapshot\.deadline_at <> p_deadline/);
  assert.match(migration, /target_delivery\.status <> 'sent'/);

  assert.match(store, /sendVoteNotice: taskId => postAction\(taskId, "vote-notice", \{\}\)/);
  const handler = workflow.match(/\$\("#sendVoteNotice"\)\.addEventListener\("click",async\(\)=>\{.*?\}\);/)?.[0] || "";
  assert.match(handler, /FulianCaseStateStore\.sendVoteNotice\(CASE_ID\)/);
  assert.match(handler, /confirm\(/);
  assert.doesNotMatch(handler, /state\.voteNoticeSent=true/);
  assert.match(workflow, /FulianCaseStateStore\.sendVoteNotice/);
  assert.doesNotMatch(workflow, /已模擬 LINE Bot 通知委員投票/);
  assert.match(html, /id="copyVoteNotice"/);
  assert.match(html, /通知委員（會員委員秘書Bot）/);
  assert.match(html, /id="voteNoticePreview"/);
  assert.match(html, /case-state-store\.js\?v=11/);
  assert.match(html, /case-workflow\.js\?v=23/);
});

test("複製投票通知可留存人工貼送紀錄並開放送票", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260828090000_vote_notice_copy_unlock.sql");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");

  assert.match(edge, /body\.kind === "vote-notice-copy"/);
  assert.match(edge, /rpc\/edge_mark_task_vote_notice_copied/);
  assert.match(edge, /p_expected_revision: expectedRevision/);
  assert.match(edge, /currentWorkflow\.voteNoticeSent \|\| currentWorkflow\.voteNoticeCopiedAt/);
  assert.match(edge, /delete proposed\.voteNoticeCopiedAt/);
  assert.match(edge, /voteNoticeCopiedDeadline", "voterSnapshot"/);

  assert.match(migration, /create or replace function public\.edge_mark_task_vote_notice_copied/);
  assert.match(migration, /p_expected_revision <> target_state\.revision/);
  assert.match(migration, /target_snapshot\.deadline_at <> p_deadline/);
  assert.match(migration, /voteNoticeCopiedAt/);
  assert.match(migration, /voteNoticeCopiedDeadline'[\s\S]*?snapshot\.deadline_at/);
  assert.match(migration, /vote_notice_copied/);
  assert.match(
    migration,
    /voteNoticeSent'[\s\S]*?<> 'true'[\s\S]*?and nullif\(btrim\(coalesce\(target_state\.workflow->>'voteNoticeCopiedAt'/,
  );
  assert.match(migration, /to service_role/);

  assert.match(store, /markVoteNoticeCopied: taskId => postAction\(taskId, "vote-notice-copy", \{\}\)/);
  const copyStart = workflow.indexOf('$("#copyVoteNotice").addEventListener');
  const copyEnd = workflow.indexOf('$("#sendVoteNotice").addEventListener', copyStart);
  const copyHandler = workflow.slice(copyStart, copyEnd);
  assert.match(copyHandler, /navigator\.clipboard\.writeText\(voteNotice\(\)\)/);
  assert.match(copyHandler, /FulianCaseStateStore\.markVoteNoticeCopied\(CASE_ID\)/);
  assert.match(copyHandler, /state=loadState\(\);render\(\)/);
  assert.match(workflow, /caseDomain\.voteAccessReady\(state\)/);
  assert.match(html, /複製投票通知並開放/);
});
