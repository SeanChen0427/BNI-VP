import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCaseFeedbackNoticeText } from "../../../supabase/functions/app-api/line-message.mjs";
import {
  buildFeedbackCallReplyMessages,
  buildFeedbackCallText,
  extractFeedbackCallToken,
  extractFeedbackCallUrl,
  feedbackCallFingerprintSource,
  normalizeFeedbackCallText,
} from "../../../supabase/functions/_shared/case-feedback-call-domain.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const token = "F".repeat(43);
const feedbackUrl = `https://seanchen0427.github.io/BNI-VP/public-feedback.html?f=${token}`;
const input = {
  caseType: "new",
  applicant: "測試會員",
  profession: "測試專業",
  interviewDate: "2026-08-28",
  leadInterviewer: "主訪甲",
  companionInterviewer: "陪訪乙",
  eligibleMembers: ["副主席", "委員甲", "委員甲", "委員乙"],
};

test("回饋呼喚保留既有公版並加入可精準比對的一次性網址", () => {
  const legacy = buildCaseFeedbackNoticeText(input);
  const text = buildFeedbackCallText({ ...input, feedbackUrl });
  assert.ok(text.startsWith(legacy));
  assert.match(text, /請點以下連結填寫委員回饋/);
  assert.equal(extractFeedbackCallToken(text), token);
  assert.equal(extractFeedbackCallUrl(text), feedbackUrl);
  assert.equal(normalizeFeedbackCallText(`\r\n${text.replaceAll("\n", "\r\n")}\r\n`), text);
  assert.match(feedbackCallFingerprintSource(text), /^case-feedback-reply-card-v1\n/);
});

test("Bot 以一次 Reply 真正 @所有人並附免登入回饋圖卡", () => {
  const messages = buildFeedbackCallReplyMessages({
    caseType: "renewal",
    applicant: "測試會員",
    profession: "測試專業",
    feedbackUrl,
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, "textV2");
  assert.equal(messages[0].substitution.all.mentionee.type, "all");
  assert.equal(messages[1].type, "flex");
  assert.equal(messages[1].contents.footer.contents[0].action.uri, feedbackUrl);
  assert.match(messages[1].contents.body.contents.at(-1).text, /所有委員回饋/);
});

test("案件頁可選測試／正式群建立回饋呼喚，流程本身不使用 Push 額度", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const prepareStart = edge.indexOf("async function prepareCaseFeedbackCall");
  const prepareEnd = edge.indexOf("\nasync function sendCaseFeedbackNotice", prepareStart);
  const prepareSection = edge.slice(prepareStart, prepareEnd);

  assert.match(edge, /body\.kind === "feedback-call-prepare"/);
  assert.match(edge, /prepareCaseFeedbackCall\(access, existing, context, expectedRevision, body\.feedbackEnvironment\)/);
  assert.match(prepareSection, /\["test", "production"\]\.includes\(feedbackEnvironment\)/);
  assert.match(prepareSection, /purpose=eq\.\$\{feedbackEnvironment\}/);
  assert.match(prepareSection, /rpc\/edge_prepare_case_feedback_call/);
  assert.match(prepareSection, /sha256Text\(token\)/);
  assert.match(prepareSection, /sha256Text\(feedbackCallFingerprintSource\(callText\)\)/);
  assert.doesNotMatch(prepareSection, /message\/push/);

  assert.match(store, /prepareFeedbackCall: \(taskId, feedbackEnvironment = "production"\) => postAction/);
  assert.match(workflow, /result\.callText/);
  assert.match(workflow, /navigator\.clipboard\.writeText\(activeFeedbackCallText\)/);
  assert.match(workflow, /這只改變回饋圖卡的發布位置/);
  assert.doesNotMatch(html, /id="sendFeedbackNotice"/);
  assert.match(html, /啟動回饋流程並複製文案/);
  assert.match(html, /id="feedbackCallEnvironment"/);
  assert.match(html, /測試群（仍寫入正式案件）/);
  assert.match(html, /case-state-store\.js\?v=14/);
  assert.match(html, /case-workflow\.js\?v=27/);
});

test("Webhook 只接受指定委員群的 Token 與完整文案雜湊，並使用 Reply API", () => {
  const webhook = read("supabase/functions/line-webhook/index.ts");
  const start = webhook.indexOf("async function processFeedbackCallEvent");
  const end = webhook.indexOf("\nasync function processVoteCallEvent", start);
  const handler = webhook.slice(start, end);

  assert.match(handler, /extractFeedbackCallToken\(event\.text\)/);
  assert.match(handler, /feedbackCallFingerprintSource\(normalizeFeedbackCallText\(event\.text\)\)/);
  assert.match(handler, /environment=eq\.\$\{target\.purpose\}/);
  assert.match(handler, /group_target_id=eq\.\$\{target\.id\}/);
  assert.match(handler, /status=in\.\(awaiting_reply,reply_failed\)/);
  assert.match(handler, /status: "replying"/);
  assert.match(handler, /https:\/\/api\.line\.me\/v2\/bot\/message\/reply/);
  assert.match(handler, /replyToken: event\.replyToken/);
  assert.match(handler, /status: "replied"/);
  assert.doesNotMatch(handler, /message\/push/);
  assert.match(webhook, /回饋／投票呼喚/);
});

test("免登入回饋頁直接顯示全體內容，送出寫回既有 case_feedback", () => {
  const config = read("supabase/config.toml");
  const endpoint = read("supabase/functions/public-feedback/index.ts");
  const migration = read("supabase/migrations/20260828223000_public_case_feedback_calls.sql");
  const html = read("apps/vice-chair/public-feedback.html");
  const script = read("apps/vice-chair/assets/js/public-feedback.js");

  assert.match(config, /\[functions\.public-feedback\]\s+verify_jwt = false/);
  assert.match(endpoint, /sha256\(token\)/);
  assert.match(endpoint, /sha256\(`\$\{token\}:\$\{personId\}`\)/);
  assert.match(endpoint, /case_feedback\?case_id=eq\.\$\{call\.case_id\}/);
  assert.match(endpoint, /rpc\/edge_save_public_case_feedback/);
  assert.doesNotMatch(endpoint, /auth\/v1\/user/);
  assert.match(migration, /insert into public\.case_feedback/);
  assert.match(migration, /這個姓名已完成回饋/);
  assert.match(html, /不必先送出自己的內容/);
  assert.match(html, /此頁不需要登入/);
  assert.match(script, /https:\/\/line\.me\/R\/share\?text=/);
  assert.doesNotMatch(script, /feedbackCount.*submitted/);
});

test("公開回饋資料表與 RPC 只開放 service role，並保留正式案件稽核", () => {
  const migration = read("supabase/migrations/20260828223000_public_case_feedback_calls.sql");
  assert.match(migration, /create table public\.case_feedback_calls/);
  assert.match(migration, /create table public\.case_feedback_call_responders/);
  assert.match(migration, /revoke all on table public\.case_feedback_calls, public\.case_feedback_call_responders\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.edge_save_public_case_feedback\(uuid, uuid, text\)\s+to service_role/);
  assert.match(migration, /'source', 'line_public'/);
  assert.match(migration, /feedback_call\.created/);
  assert.match(migration, /案件已重設或結案/);
});
