import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildVoteCallReplyMessages,
  buildVoteCallText,
  extractVoteCallToken,
  extractVoteCallUrl,
  normalizeVoteCallText,
  voteCallFingerprintSource,
} from "../../../supabase/functions/_shared/case-vote-call-domain.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const token = "A".repeat(43);
const ballotUrl = `https://seanchen0427.github.io/BNI-VP/public-vote.html?t=${token}`;

test("投票呼喚包含一次性網址、截止時間與可精準比對的完整格式", () => {
  const text = buildVoteCallText({
    caseType: "renewal",
    applicant: "測試會員",
    profession: "測試專業",
    deadlineAt: "2026-08-29T10:00:00Z",
    ballotUrl,
  });
  assert.match(text, /^@All 【續約投票】/);
  assert.match(text, /申請者：測試會員/);
  assert.match(text, /專業別：測試專業/);
  assert.match(text, new RegExp(token));
  assert.match(text, /投票截止：2026\/8\/29 18:00/);
  assert.equal(extractVoteCallToken(text), token);
  assert.equal(extractVoteCallUrl(text), ballotUrl);
  assert.equal(normalizeVoteCallText(`\r\n${text.replaceAll("\n", "\r\n")}\r\n`), text);
  assert.match(voteCallFingerprintSource(text), /^case-vote-reply-card-v1\n/);

  const testText = buildVoteCallText({
    caseType: "renewal",
    applicant: "測試會員",
    profession: "測試專業",
    deadlineAt: "2026-08-29T10:00:00Z",
    ballotUrl,
    isTest: true,
  });
  assert.match(testText, /測試續約投票｜不列入正式紀錄/);
  assert.match(testText, /不建立正式案件、不列入正式票數/);
});

test("Bot 以一次 Reply 同時真正 @所有人並回覆 Flex 投票圖卡", () => {
  const messages = buildVoteCallReplyMessages({
    caseType: "new",
    applicant: "測試會員",
    profession: "測試專業",
    deadlineAt: "2026-08-29T10:00:00Z",
    ballotUrl,
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, "textV2");
  assert.equal(messages[0].substitution.all.mentionee.type, "all");
  assert.equal(messages[1].type, "flex");
  assert.equal(messages[1].contents.footer.contents[0].action.uri, ballotUrl);
});

test("正式案件只建立呼喚，不再由投票按鈕使用 Push 額度", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const prepareStart = edge.indexOf("async function prepareCaseVoteCall");
  const prepareEnd = edge.indexOf("\nasync function sendCaseVoteNotice", prepareStart);
  const prepareSection = edge.slice(prepareStart, prepareEnd);

  assert.match(edge, /body\.kind === "vote-call-prepare"/);
  assert.match(edge, /return prepareCaseVoteCall\(access, existing, context, expectedRevision\)/);
  assert.match(edge, /body\.kind === "vote-notice" \|\| body\.kind === "vote-notice-copy"/);
  assert.match(edge, /舊版投票通知已停用/);
  assert.match(prepareSection, /purpose=eq\.production/);
  assert.match(prepareSection, /rpc\/edge_prepare_case_vote_call/);
  assert.match(prepareSection, /sha256Text\(token\)/);
  assert.match(prepareSection, /sha256Text\(voteCallFingerprintSource\(callText\)\)/);
  assert.doesNotMatch(prepareSection, /message\/push/);

  assert.match(store, /prepareVoteCall: taskId => postAction\(taskId, "vote-call-prepare", \{\}\)/);
  assert.doesNotMatch(store, /sendVoteNotice:/);
  assert.match(workflow, /result\.callText/);
  assert.match(workflow, /navigator\.clipboard\.writeText\(activeVoteCallText\)/);
  assert.doesNotMatch(html, /id="sendVoteNotice"/);
  assert.match(html, /啟動投票流程並複製文案/);
  assert.match(html, /case-state-store\.js\?v=12/);
  assert.match(html, /case-workflow\.js\?v=24/);
});

test("Webhook 只接受委員會群的 Token 與完整文案雜湊，並呼叫 Reply API", () => {
  const webhook = read("supabase/functions/line-webhook/index.ts");
  const domain = read("supabase/functions/line-webhook/domain.mjs");
  const handlerStart = webhook.indexOf("async function processVoteCallEvent");
  const handlerEnd = webhook.indexOf("\nDeno.serve", handlerStart);
  const handler = webhook.slice(handlerStart, handlerEnd);

  assert.match(domain, /collectVoteCallEvents/);
  assert.match(handler, /extractVoteCallToken\(event\.text\)/);
  assert.match(handler, /voteCallFingerprintSource\(normalizeVoteCallText\(event\.text\)\)/);
  assert.match(handler, /group_target_id=eq\.\$\{target\.id\}/);
  assert.match(handler, /status=in\.\(awaiting_reply,reply_failed\)/);
  assert.match(handler, /status: "replying"/);
  assert.match(handler, /https:\/\/api\.line\.me\/v2\/bot\/message\/reply/);
  assert.match(handler, /replyToken: event\.replyToken/);
  assert.match(handler, /status: "replied"/);
  assert.doesNotMatch(handler, /message\/push/);
  assert.match(webhook, /普通聊天內容不落地/);
});

test("免登入頁以雜湊 Token 與別名選人，正式票仍寫入同一份 votes", () => {
  const config = read("supabase/config.toml");
  const publicVote = read("supabase/functions/public-vote/index.ts");
  const migration = read("supabase/migrations/20260828160000_case_vote_reply_calls.sql");
  const initialSchema = read("supabase/migrations/20260720070454_initial_schema.sql");
  const html = read("apps/vice-chair/public-vote.html");
  const script = read("apps/vice-chair/assets/js/public-vote.js");

  assert.match(config, /\[functions\.public-vote\]\s+verify_jwt = false/);
  assert.match(publicVote, /sha256\(token\)/);
  assert.match(publicVote, /sha256\(`\$\{token\}:\$\{personId\}`\)/);
  assert.match(publicVote, /rpc\/edge_cast_public_case_vote/);
  assert.doesNotMatch(publicVote, /auth\/v1\/user/);
  assert.match(migration, /alter column actor_auth_user_id drop not null/);
  assert.match(migration, /cast_source = 'line_public'/);
  assert.match(migration, /insert into public\.votes/);
  assert.match(initialSchema, /unique \(snapshot_id, voter_person_id\)/);
  assert.match(html, /此頁不需要登入/);
  assert.match(script, /請確認：你選擇/);
});

test("設定頁測試器與正式票完全分離，測試群可和正式群並存", () => {
  const migration = read("supabase/migrations/20260828160000_case_vote_reply_calls.sql");
  const edge = read("supabase/functions/app-api/index.ts");
  const settings = read("apps/vice-chair/assets/js/settings.js");
  const html = read("apps/vice-chair/settings.html");

  assert.match(migration, /line_group_targets_one_active_route_environment/);
  assert.match(migration, /\(route_key, purpose\)/);
  assert.match(migration, /create table public\.case_vote_test_votes/);
  assert.match(migration, /is_test and environment = 'test' and task_id is null/);
  assert.match(edge, /path === "\/api\/vote-test"/);
  assert.match(edge, /purpose=eq\.test/);
  assert.match(edge, /case_vote_test_votes/);
  assert.match(settings, /voteTestApi/);
  assert.match(settings, /測試群與正式群可同時保留/);
  assert.match(html, /不建立續約案件、不產生 Word、不寫入正式 votes/);
});
