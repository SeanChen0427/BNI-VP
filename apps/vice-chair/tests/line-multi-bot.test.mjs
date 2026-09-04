import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LINE_OA_CHANNELS,
  lineChannelForRoute,
  lineChannelLabel,
  lineChannelMatchesRoute,
  normalizeLineChannel,
} from "../../../supabase/functions/_shared/line-channel-domain.mjs";
import {
  collectReplyOpportunityEvents,
  resolveLineWebhookChannel,
} from "../../../supabase/functions/line-webhook/domain.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("四種 LINE 路由固定分派到兩個獨立 OA", () => {
  assert.equal(lineChannelForRoute("committee"), LINE_OA_CHANNELS.COMMITTEE);
  assert.equal(lineChannelForRoute("attendance"), LINE_OA_CHANNELS.VICE_CHAIR);
  assert.equal(lineChannelForRoute("leadership"), LINE_OA_CHANNELS.VICE_CHAIR);
  assert.equal(lineChannelForRoute("exchange"), LINE_OA_CHANNELS.VICE_CHAIR);
  assert.equal(lineChannelForRoute("unknown"), null);
  assert.equal(normalizeLineChannel("committee"), "committee");
  assert.equal(normalizeLineChannel("other"), null);
  assert.equal(lineChannelLabel("committee"), "會員委員秘書Bot");
  assert.equal(lineChannelMatchesRoute("committee", "committee"), true);
  assert.equal(lineChannelMatchesRoute("vice_chair", "committee"), false);
});

test("共用 webhook 依各 OA Channel Secret 辨識來源", async () => {
  const body = JSON.stringify({ events: [{ type: "message" }] });
  const viceSecret = "vice-chair-secret";
  const committeeSecret = "committee-secret";
  const committeeSignature = createHmac("sha256", committeeSecret).update(body).digest("base64");
  const viceSignature = createHmac("sha256", viceSecret).update(body).digest("base64");
  const secrets = [
    { channel: "vice_chair", secret: viceSecret },
    { channel: "committee", secret: committeeSecret },
  ];
  assert.equal(await resolveLineWebhookChannel(body, committeeSignature, secrets), "committee");
  assert.equal(await resolveLineWebhookChannel(body, viceSignature, secrets), "vice_chair");
  assert.equal(await resolveLineWebhookChannel(body, "invalid", secrets), null);
});

test("交流群事件只擷取當次 Reply 所需欄位，不讀取訊息內容或使用者 ID", () => {
  const payload = {
    events: [{
      type: "message",
      replyToken: "reply-token",
      webhookEventId: "event-1",
      timestamp: Date.parse("2026-09-04T08:00:00Z"),
      source: { type: "group", groupId: "C12345678", userId: "U-secret" },
      message: { id: "message-1", type: "text", text: "私人聊天內容" },
    }],
  };
  assert.deepEqual(collectReplyOpportunityEvents(payload), [{
    groupId: "C12345678",
    replyToken: "reply-token",
    webhookEventId: "event-1",
    lineMessageId: "message-1",
    occurredAt: "2026-09-04T08:00:00.000Z",
  }]);
});

test("資料庫、Webhook 與發送端都保留 OA 邊界", () => {
  const migration = read("supabase/migrations/20260819090000_line_committee_bot_split.sql");
  const webhook = read("supabase/functions/line-webhook/index.ts");
  const appApi = read("supabase/functions/app-api/index.ts");
  const cron = read("supabase/functions/line-reminder-cron/index.ts");

  assert.match(migration, /add column oa_channel text not null default 'vice_chair'/);
  assert.match(migration, /line_group_targets_channel_group_unique/);
  assert.match(migration, /route_key = 'committee' and oa_channel = 'committee'/);
  assert.match(migration, /set status = 'disabled'[\s\S]*?route_key = 'committee'/);
  assert.match(webhook, /LINE_COMMITTEE_CHANNEL_SECRET/);
  assert.match(webhook, /resolveLineWebhookChannel/);
  assert.match(webhook, /oa_channel=eq\./);
  assert.match(appApi, /LINE_COMMITTEE_CHANNEL_ACCESS_TOKEN/);
  assert.match(appApi, /oa_channel=eq\.committee/);
  assert.match(appApi, /lineChannelForRoute\(routeKey\)/);
  assert.match(cron, /lineAccessToken\(target\.oa_channel\)/);
});
