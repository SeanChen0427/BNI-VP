import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommitteeWorkDigest,
  committeeWorkDigestTasksFromRows,
  committeeWorkDigestSource,
  COMMITTEE_WORK_DIGEST_REPLY_TRIGGER,
  isCommitteeWorkDigestReplyTrigger,
} from "../../../supabase/functions/_shared/committee-work-digest.mjs";
import { collectCommitteeWorkDigestRequestEvents } from "../../../supabase/functions/line-webhook/domain.mjs";

const now = new Date("2026-08-10T08:00:00+08:00");
const tasks = [
  {
    id: "task-renewal",
    type: "renewal",
    member: "會員甲",
    dueAt: "2026-08-15T19:00",
    lead: "委員甲",
    companions: [],
    revision: 2,
    workflowRevision: 1,
    workflow: {},
  },
  {
    id: "task-midterm",
    type: "midterm",
    member: "會員乙",
    dueAt: "2026-08-15T19:00",
    lead: "委員乙",
    companions: ["委員丙"],
    revision: 3,
    workflowRevision: 4,
    workflow: { feedbackNotified: true, feedback: { 委員甲: "已回饋" } },
  },
  {
    id: "task-vote",
    type: "new",
    member: "申請者丙",
    dueAt: "2026-08-05T13:30",
    lead: "副主席",
    companions: ["委員丁"],
    revision: 5,
    workflowRevision: 6,
    workflow: { votingOpen: true },
  },
];

const digest = buildCommitteeWorkDigest(tasks, now);
assert.deepEqual(digest.counts, { active: 3, overdue: 1, feedback: 1, vote: 1 });
assert.equal(digest.content, `【會員委員會每週工作進度｜2026.08.10】

目前進行中 3 件
逾期 1 件｜回饋中 1 件｜投票中 1 件

■ 8月5日 13:30 前（已逾期）

【新會員訪談】
・申請者丙｜主責：副主席｜陪訪：委員丁

■ 8月15日 19:00 前

【續約訪談】
・會員甲｜主責：委員甲

【期中關懷】
・會員乙｜主責：委員乙｜陪訪：委員丙

請各主責與陪訪委員留意期限；
若排程或分工需要調整，請直接在群組提出，謝謝大家！`);
assert.doesNotMatch(digest.content, /以上案件目前皆為/);
assert.match(digest.content, /陪訪：委員丙/);
assert.equal(committeeWorkDigestSource(tasks, now), digest.source);
assert.notEqual(
  committeeWorkDigestSource(tasks, now),
  committeeWorkDigestSource([{ ...tasks[0], companions: ["委員戊"] }, ...tasks.slice(1)], now),
);

assert.equal(COMMITTEE_WORK_DIGEST_REPLY_TRIGGER, "委員會進度");
assert.equal(isCommitteeWorkDigestReplyTrigger("委員會進度"), true);
assert.equal(isCommitteeWorkDigestReplyTrigger("  委員會進度\n"), true);
assert.equal(isCommitteeWorkDigestReplyTrigger("請給我委員會進度"), false);
assert.equal(isCommitteeWorkDigestReplyTrigger("委員會進度？"), false);

const requestPayload = {
  events: [
    {
      type: "message",
      timestamp: 1786320000000,
      webhookEventId: "event-digest-1",
      replyToken: "reply-token-used-only-in-memory",
      source: { type: "group", groupId: "C-committee-group" },
      message: { id: "line-message-1", type: "text", text: "委員會進度" },
    },
    {
      type: "message",
      webhookEventId: "event-ignore-1",
      replyToken: "reply-token-ignore",
      source: { type: "group", groupId: "C-committee-group" },
      message: { id: "line-message-2", type: "text", text: "一般聊天委員會進度" },
    },
  ],
};
assert.deepEqual(collectCommitteeWorkDigestRequestEvents(requestPayload), [{
  groupId: "C-committee-group",
  replyToken: "reply-token-used-only-in-memory",
  webhookEventId: "event-digest-1",
  lineMessageId: "line-message-1",
  occurredAt: new Date(1786320000000).toISOString(),
}]);
assert.doesNotMatch(JSON.stringify(collectCommitteeWorkDigestRequestEvents(requestPayload)), /委員會進度/);

const tasksFromRows = committeeWorkDigestTasksFromRows({
  taskRows: [{
    id: "task-row-id",
    source_reference: "task-source-id",
    category: "renewal",
    title: "會員甲",
    due_at: "2026-08-16T19:00:00+08:00",
    lead_person_id: "person-lead",
    revision: 7,
    result_summary: JSON.stringify({ scheduledAt: "2026-08-15T19:00" }),
  }],
  assignments: [{ task_id: "task-row-id", person_id: "person-companion", role: "companion" }],
  stateRows: [{ task_id: "task-row-id", revision: 8, workflow: { votingOpen: true } }],
  people: [
    { id: "person-lead", display_name: "委員甲" },
    { id: "person-companion", display_name: "委員乙" },
  ],
});
assert.deepEqual(tasksFromRows, [{
  id: "task-source-id",
  type: "renewal",
  member: "會員甲",
  dueAt: "2026-08-15T19:00",
  lead: "委員甲",
  companions: ["委員乙"],
  revision: 7,
  workflowRevision: 8,
  workflow: { votingOpen: true },
}]);

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260810170000_committee_work_digest_line.sql");
const replyMigration = read("supabase/migrations/20260904160000_committee_work_digest_reply_command.sql");
const appApi = read("supabase/functions/app-api/index.ts");
const webhook = read("supabase/functions/line-webhook/index.ts");
const html = read("apps/vice-chair/routine-reminders.html");
const script = read("apps/vice-chair/assets/js/routine-reminders.js");

assert.match(migration, /committee_work_digest_deliveries/);
assert.match(migration, /unique \(group_target_id, local_due_date, message_sha256\)/);
assert.match(migration, /revoke all on table public\.committee_work_digest_deliveries/);
assert.match(replyMigration, /create table public\.committee_work_digest_reply_deliveries/);
assert.match(replyMigration, /trigger_event_key text not null unique/);
assert.match(replyMigration, /revoke all on table public\.committee_work_digest_reply_deliveries/);
assert.doesNotMatch(replyMigration, /\breply_token\s+text|\bline_user_id\b|\bmessage_content\b/i);
assert.match(appApi, /route_key=eq\.committee&oa_channel=eq\.committee&purpose=eq\.production&select=\*/);
assert.match(appApi, /工作進度已由會員委員秘書Bot發送/);
assert.match(appApi.match(/async function sendCommitteeWorkDigest[\s\S]*?\n}\n\nasync function findCaseVoteLineDelivery/)[0], /purpose=eq\.production/);
assert.match(appApi, /latest\.sourceFingerprint !== sourceFingerprint/);
assert.match(appApi, /buildLineMentionAllMessage\(content\)/);
assert.match(appApi, /action === "work_digest_send"/);
const replyHandler = webhook.match(/async function processCommitteeWorkDigestRequestEvent[\s\S]*?\n}\n\nasync function finishPendingAnnouncement/)[0];
assert.match(replyHandler, /purpose=eq\.production/);
assert.match(replyHandler, /committee_work_digest_reply_deliveries/);
assert.match(replyHandler, /\/v2\/bot\/message\/reply/);
assert.match(replyHandler, /messages: \[message\]/);
assert.match(replyHandler, /AbortSignal\.timeout\(3_000\)/);
assert.doesNotMatch(replyHandler, /\/v2\/bot\/message\/push/);
assert.match(webhook, /collectCommitteeWorkDigestRequestEvents\(payload\)/);
assert.match(html, /id="workDigestMessage"/);
assert.match(html, /id="sendWorkDigest"/);
assert.match(html, /<code>委員會進度<\/code>/);
assert.match(script, /只有確認後才會送出/);
assert.match(script, /action:"work_digest_send"/);
assert.match(script, /會計入 LINE 月訊息額度/);
assert.doesNotMatch(script, /work_digest_send[\s\S]{0,200}setInterval/);

console.log("Committee work digest tests passed");
