import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { collectGroupEvents, verifyLineSignature } from "../../../supabase/functions/line-webhook/domain.mjs";
import { buildLineAttendanceMessage, lineAttendanceFingerprintSource } from "../../../supabase/functions/app-api/line-message.mjs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260808113000_line_attendance_delivery.sql");
const routingMigration = read("supabase/migrations/20260808124500_line_group_routing.sql");
const webhook = read("supabase/functions/line-webhook/index.ts");
const edge = read("supabase/functions/app-api/index.ts");
const html = read("apps/vice-chair/attendance.html");
const script = read("apps/vice-chair/assets/js/attendance.js");
const settingsHtml = read("apps/vice-chair/settings.html");
const settingsScript = read("apps/vice-chair/assets/js/settings.js");

const body = JSON.stringify({
  events: [
    { type: "message", timestamp: 1786150800000, source: { type: "group", groupId: "C-test-group-123" }, message: { type: "text", text: "不得儲存這句訊息" } },
    { type: "message", timestamp: 1786150860000, source: { type: "user", userId: "U-test-user" }, message: { type: "text", text: "ignore" } },
  ],
});
const secret = "test-channel-secret";
const signature = createHmac("sha256", secret).update(body).digest("base64");
assert.equal(await verifyLineSignature(body, signature, secret), true);
assert.equal(await verifyLineSignature(body, `${signature}x`, secret), false);
assert.deepEqual(collectGroupEvents(JSON.parse(body)), [{
  groupId: "C-test-group-123",
  kind: "present",
  occurredAt: new Date(1786150800000).toISOString(),
}]);
assert.doesNotMatch(JSON.stringify(collectGroupEvents(JSON.parse(body))), /不得儲存這句訊息/);

assert.deepEqual(buildLineAttendanceMessage("點名公告"), {
  type: "textV2",
  text: "{all}\n點名公告",
  substitution: { all: { type: "mention", mentionee: { type: "all" } } },
});
assert.equal(buildLineAttendanceMessage("內容 {請確認}").text, "{all}\n內容 {{請確認}}");
assert.match(lineAttendanceFingerprintSource("點名公告"), /^text-v2-mention-all-v1\n/);
assert.throws(() => buildLineAttendanceMessage("字".repeat(5000)), /@所有人後超過 5,000 字/);

assert.match(webhook, /x-line-signature/);
assert.match(webhook, /resolveLineWebhookChannel\(rawBody/);
assert.match(webhook, /LINE_COMMITTEE_CHANNEL_SECRET/);
assert.match(webhook, /User message content is ignored/);
assert.doesNotMatch(webhook, /message\.text/);
assert.match(migration, /revoke all on table public\.line_group_targets, public\.attendance_line_deliveries/);
assert.match(migration, /unique \(attendance_session_id, group_target_id, announcement_sha256\)/);
assert.match(routingMigration, /'attendance', 'committee', 'leadership'/);
assert.match(routingMigration, /line_group_targets_one_active_route/);
assert.match(edge, /status=eq\.confirmed&select=id,meeting_date,status,announcement_snapshot/);
assert.match(edge, /X-Line-Retry-Key/);
assert.match(edge, /messages: \[lineMessage\]/);
assert.equal((edge.match(/async function sha256\(/g) || []).length, 1);
assert.match(edge, /async function sha256Text\(/);
assert.match(edge, /route_key=eq\.attendance/);
assert.match(edge, /availableForAssignment: row\.status === "discovered" \|\| \(row\.status === "disabled" && !row\.left_at\)/);
assert.match(edge, /path === "\/api\/line-groups"/);
assert.match(edge, /body\.action === "send-line"/);
assert.doesNotMatch(edge, /LINE_CHANNEL_ACCESS_TOKEN\s*=\s*["'][^"']+["']/);
assert.match(html, /id="sendLineAnnouncement"/);
assert.match(script, /action:"send-line"/);
assert.match(script, /同一公告版本已阻擋重複發送/);
assert.match(script, /settings\.html#lineBotGroups/);
assert.match(settingsHtml, /id="lineBotGroups"/);
assert.match(settingsScript, /LINE_ROUTE_LABELS=\{attendance:/);
assert.match(settingsScript, /action:"assign"/);
assert.match(settingsScript, /item\.availableForAssignment&&item\.status!=="active"/);
assert.match(settingsScript, /已停用，可直接重新指定/);
assert.match(settingsHtml, /已停用群組可直接重新啟用/);
assert.match(settingsHtml, /assets\/js\/settings\.js\?v=14/);

console.log("LINE attendance delivery tests passed");
