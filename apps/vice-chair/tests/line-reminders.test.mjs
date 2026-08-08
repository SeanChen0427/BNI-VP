import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addUtcDays,
  isRuleDue,
  lastIsoWeekdayOfMonth,
  ruleDueDate,
  taipeiDateParts,
  validateReminderUpdate,
} from "../../../supabase/functions/_shared/line-reminder-domain.mjs";
import { buildLineMentionAllMessage } from "../../../supabase/functions/app-api/line-message.mjs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260808170000_line_recurring_reminders.sql");
const appApi = read("supabase/functions/app-api/index.ts");
const cron = read("supabase/functions/line-reminder-cron/index.ts");
const settings = read("apps/vice-chair/assets/js/settings.js");
const nav = read("apps/vice-chair/assets/js/workspace-nav.js");
const html = read("apps/vice-chair/routine-reminders.html");
const script = read("apps/vice-chair/assets/js/routine-reminders.js");
const config = read("supabase/config.toml");

const mondayAtEightTaipei = new Date("2026-08-10T12:00:00Z");
assert.deepEqual(taipeiDateParts(mondayAtEightTaipei), {
  year: "2026", month: "08", day: "10", hour: "20", minute: "00",
  date: "2026-08-10", weekday: 1, minuteOfDay: 1200,
});
assert.equal(lastIsoWeekdayOfMonth(2026, 8, 2), "2026-08-25");
assert.equal(addUtcDays("2026-08-25", -1), "2026-08-24");

const weekly = { reminder_key: "weekly_meeting_alarm", enabled: true, send_weekday: 1, send_time: "20:00:00" };
assert.equal(ruleDueDate(weekly, mondayAtEightTaipei), "2026-08-10");
assert.equal(isRuleDue(weekly, mondayAtEightTaipei), true);
assert.equal(isRuleDue(weekly, new Date("2026-08-10T11:59:00Z")), false);
assert.equal(isRuleDue(weekly, new Date("2026-08-10T18:01:00Z")), false);

const monthly = { reminder_key: "monthly_data_entry", enabled: true, meeting_weekday: 2, days_before: 1, send_time: "20:00:00" };
assert.equal(ruleDueDate(monthly, new Date("2026-08-24T12:00:00Z")), "2026-08-24");
assert.equal(ruleDueDate(monthly, new Date("2026-08-17T12:00:00Z")), null);
assert.equal(isRuleDue(monthly, new Date("2026-08-24T12:05:00Z")), true);

assert.deepEqual(validateReminderUpdate({ reminderKey: "weekly_meeting_alarm", enabled: false, sendTime: "18:30", messageTemplate: "提醒", mentionAll: true }), {
  reminder_key: "weekly_meeting_alarm", enabled: false, send_time: "18:30", message_template: "提醒", mention_all: true,
  send_weekday: 1, meeting_weekday: null, days_before: null,
});
assert.throws(() => validateReminderUpdate({ reminderKey: "monthly_data_entry", sendTime: "25:00", messageTemplate: "提醒", meetingWeekday: 2, daysBefore: 1 }), /發送時間/);
assert.throws(() => validateReminderUpdate({ reminderKey: "monthly_data_entry", sendTime: "20:00", messageTemplate: "", meetingWeekday: 2, daysBefore: 1 }), /提醒文案/);
assert.equal(buildLineMentionAllMessage("明天例會").text, "{all}\n明天例會");

assert.match(migration, /'attendance', 'committee', 'leadership', 'exchange'/);
assert.match(migration, /enabled boolean not null default false/);
assert.match(migration, /delivery_key text not null unique/);
assert.match(migration, /revoke all on table public\.line_reminder_rules, public\.line_reminder_deliveries/);
assert.match(appApi, /path === "\/api\/line-reminders"/);
assert.match(appApi, /route_key=eq\.exchange/);
assert.match(appApi, /async function finishLineReminderDelivery[\s\S]*?line_reminder_deliveries\?id=eq\./);
const reminderTestHandler = appApi.match(/async function sendLineReminderTest[\s\S]*?\n}\n\nasync function lineRemindersApi/)[0];
assert.doesNotMatch(reminderTestHandler, /finishLineDelivery\(/);
assert.match(reminderTestHandler, /finishLineReminderDelivery\(/);
assert.match(appApi, /LINE_ROUTE_KEYS = new Set\(\["attendance", "committee", "leadership", "exchange"\]\)/);
assert.match(appApi, /submittedKeys\.size !== LINE_REMINDER_KEYS\.length/);
assert.match(appApi, /Supabase 排程尚未啟用，請先保持提醒關閉/);
assert.match(cron, /x-cron-secret/);
assert.match(cron, /const deliveryKey = `scheduled:/);
assert.match(cron, /delivery_key: deliveryKey/);
assert.match(cron, /X-Line-Retry-Key/);
assert.match(cron, /existing\.status === "sent" \|\| Number\(existing\.attempt_count \|\| 0\) >= 3/);
assert.match(cron, /status: "processing",[\s\S]*?attempt_count: Number\(existing\.attempt_count/);
assert.match(config, /\[functions\.line-reminder-cron\]\nverify_jwt = false/);
assert.match(settings, /exchange:"交流群常態通知"/);
assert.match(nav, /"常態通知", "routine-reminders\.html", "vp"/);
assert.match(html, /id="weeklyEnabled"/);
assert.match(html, /id="monthlyEnabled"/);
assert.match(html, /id="deliveryList"/);
assert.match(script, /action:"save"/);
assert.match(script, /action:"test"/);
assert.match(script, /測試訊息會真的 @所有人/);
assert.match(script, /const escapeHtml=/);

console.log("LINE recurring reminder tests passed");
