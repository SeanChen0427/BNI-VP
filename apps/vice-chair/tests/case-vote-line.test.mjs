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
  assert.doesNotMatch(text, /測試投票|不列入正式紀錄/);
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

test("正式案件可選發布群組，但只建立呼喚且不使用 Push 額度", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const store = read("apps/vice-chair/assets/js/case-state-store.js");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const html = read("apps/vice-chair/case-workflow.html");
  const prepareStart = edge.indexOf("async function prepareCaseVoteCall");
  const prepareEnd = edge.indexOf("\nasync function sendCaseVoteNotice", prepareStart);
  const prepareSection = edge.slice(prepareStart, prepareEnd);

  assert.match(edge, /body\.kind === "vote-call-prepare"/);
  assert.match(edge, /return prepareCaseVoteCall\(access, existing, context, expectedRevision, body\.voteEnvironment\)/);
  assert.match(edge, /body\.kind === "vote-notice" \|\| body\.kind === "vote-notice-copy"/);
  assert.match(edge, /舊版投票通知已停用/);
  assert.match(prepareSection, /\["test", "production"\]\.includes\(voteEnvironment\)/);
  assert.match(prepareSection, /purpose=eq\.\$\{voteEnvironment\}/);
  assert.match(prepareSection, /rpc\/edge_prepare_case_vote_call/);
  assert.match(prepareSection, /sha256Text\(token\)/);
  assert.match(prepareSection, /sha256Text\(voteCallFingerprintSource\(callText\)\)/);
  assert.doesNotMatch(prepareSection, /message\/push/);

  assert.match(store, /prepareVoteCall: \(taskId, voteEnvironment = "production"\) => postAction/);
  assert.match(store, /\{ voteEnvironment \}/);
  assert.doesNotMatch(store, /sendVoteNotice:/);
  assert.match(workflow, /result\.callText/);
  assert.match(workflow, /navigator\.clipboard\.writeText\(activeVoteCallText\)/);
  assert.doesNotMatch(html, /id="sendVoteNotice"/);
  assert.match(html, /啟動投票流程並複製文案/);
  assert.match(html, /id="voteCallEnvironment"/);
  assert.match(html, /測試群（仍列入正式票）/);
  assert.match(workflow, /這只改變投票圖卡的發布位置/);
  assert.match(workflow, /仍會直接寫入/);
  assert.match(html, /case-state-store\.js\?v=16/);
  assert.match(html, /case-workflow\.js\?v=30/);
});

test("測試群投票圖卡可單向改發正式群，並保留既有正式票", () => {
  const migration = read("supabase/migrations/20260829023000_promote_test_calls_to_production.sql");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");

  assert.match(migration, /promoting_to_production := replied_call\.environment = 'test'\s+and target_group\.purpose = 'production'/);
  assert.match(migration, /when promoting_to_production then 'vote_call\.promoted'/);
  assert.match(migration, /if not promoting_to_production\s+and exists \(select 1 from public\.votes/);
  assert.doesNotMatch(
    migration,
    /\b(?:delete from|update)\s+public\.votes(?:\s|$)/i,
    "改發正式群不得刪除或改寫既有正式票",
  );
  assert.match(workflow, /已收到的正式票全部保留/);
  assert.match(workflow, /尚未投票者可從正式群新圖卡繼續投票/);
  assert.match(workflow, /voteEnvironment=promotingToProduction\?"production"/);
});

test("Webhook 只接受本次指定委員會群的 Token 與完整文案雜湊，並呼叫 Reply API", () => {
  const webhook = read("supabase/functions/line-webhook/index.ts");
  const domain = read("supabase/functions/line-webhook/domain.mjs");
  const handlerStart = webhook.indexOf("async function processVoteCallEvent");
  const handlerEnd = webhook.indexOf("\nDeno.serve", handlerStart);
  const handler = webhook.slice(handlerStart, handlerEnd);

  assert.match(domain, /collectVoteCallEvents/);
  assert.match(handler, /extractVoteCallToken\(event\.text\)/);
  assert.match(handler, /voteCallFingerprintSource\(normalizeVoteCallText\(event\.text\)\)/);
  assert.doesNotMatch(handler, /purpose=eq\.production/);
  assert.match(handler, /\["test", "production"\]\.includes\(String\(target\.purpose/);
  assert.match(handler, /is_test=eq\.false&environment=eq\.\$\{target\.purpose\}/);
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

test("正式上線後 LINE 投票測試器已完整退場", () => {
  const retirement = read("supabase/migrations/20260828171000_retire_line_vote_tester.sql");
  const edge = read("supabase/functions/app-api/index.ts");
  const publicVote = read("supabase/functions/public-vote/index.ts");
  const webhook = read("supabase/functions/line-webhook/index.ts");
  const callDomain = read("supabase/functions/_shared/case-vote-call-domain.mjs");
  const settings = read("apps/vice-chair/assets/js/settings.js");
  const html = read("apps/vice-chair/settings.html");
  const ballotHtml = read("apps/vice-chair/public-vote.html");
  const ballotScript = read("apps/vice-chair/assets/js/public-vote.js");

  assert.match(retirement, /delete from public\.case_vote_calls\s+where is_test/);
  assert.match(retirement, /drop function if exists public\.edge_cast_test_case_vote/);
  assert.match(retirement, /check \(not is_test\)/);
  assert.doesNotMatch(edge, /\/api\/vote-test|voteTestApi|case_vote_test_votes/);
  assert.doesNotMatch(settings, /voteTest|\/api\/vote-test/);
  assert.doesNotMatch(html, /LINE 投票測試器|voteTestCard/);
  assert.doesNotMatch(ballotHtml, /testBanner|功能測試・不列入正式紀錄/);
  assert.doesNotMatch(ballotScript, /isTest|testBanner/);
  assert.doesNotMatch(callDomain, /isTest|測試投票圖卡/);
  assert.doesNotMatch(publicVote, /case_vote_test_votes|edge_cast_test_case_vote/);
  assert.match(publicVote, /is_test=eq\.false&environment=in\.\(test,production\)/);
  assert.doesNotMatch(webhook, /purpose=eq\.production/);
  assert.match(webhook, /is_test=eq\.false&environment=eq\.\$\{target\.purpose\}/);
  assert.match(settings, /測試群與正式群可同時保留/);
});

test("測試群只作為正式案件發布位置，資料庫仍禁止獨立測試呼喚", () => {
  const migration = read("supabase/migrations/20260828172749_formal_vote_selectable_group.sql");
  const retirement = read("supabase/migrations/20260828171000_retire_line_vote_tester.sql");
  const edge = read("supabase/functions/app-api/index.ts");

  assert.match(retirement, /check \(not is_test\)/);
  assert.match(migration, /not is_test\s+and environment in \('test', 'production'\)/);
  assert.match(migration, /target_group\.id, target_group\.purpose, false/);
  assert.match(migration, /'voteCallEnvironment', target_group\.purpose/);
  assert.match(migration, /'environment', target_group\.purpose/);
  assert.match(edge, /voteCallEnvironment: participation\.voteCall\.environment \|\| "production"/);
});

test("LINE 群組管理每個用途只顯示一列並以下拉查看測試或正式群", () => {
  const settings = read("apps/vice-chair/assets/js/settings.js");
  const html = read("apps/vice-chair/settings.html");
  const renderStart = settings.indexOf("function renderLineGroups");
  const renderEnd = settings.indexOf("\nasync function loadLineGroups", renderStart);
  const renderSection = settings.slice(renderStart, renderEnd);

  assert.match(renderSection, /Object\.entries\(LINE_ROUTE_LABELS\)\.map/);
  assert.doesNotMatch(renderSection, /\.flatMap/);
  assert.match(renderSection, /data-line-route-view/);
  assert.match(renderSection, /每項用途可用下拉選擇查看測試群／正式群/);
  assert.match(html, /line-group-route select/);
  assert.match(html, /settings\.js\?v=17/);
});
