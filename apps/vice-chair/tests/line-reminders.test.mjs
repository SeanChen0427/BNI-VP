import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addUtcDays,
  buildReminderFallbackMessages,
  firstIsoWeekdayOfMonth,
  formatTaipeiReminderDeadline,
  isOpportunisticReminder,
  isRuleDue,
  lastIsoWeekdayOfMonth,
  nextRuleOccurrence,
  opportunisticDeliveryWindow,
  reminderRouteKey,
  ruleDueDate,
  taipeiDateParts,
  validateReminderUpdate,
} from "../../../supabase/functions/_shared/line-reminder-domain.mjs";
import { buildLineMentionAllMessage } from "../../../supabase/functions/app-api/line-message.mjs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260808170000_line_recurring_reminders.sql");
const committeeMigration = read("supabase/migrations/20260808190000_committee_meeting_reminder.sql");
const replyDrivenMigration = read("supabase/migrations/20260904090000_line_reply_driven_reminders.sql");
const appApi = read("supabase/functions/app-api/index.ts");
const cron = read("supabase/functions/line-reminder-cron/index.ts");
const webhook = read("supabase/functions/line-webhook/index.ts");
const settings = read("apps/vice-chair/assets/js/settings.js");
const nav = read("apps/vice-chair/assets/js/workspace-nav.js");
const index = read("apps/vice-chair/index.html");
const html = read("apps/vice-chair/routine-reminders.html");
const script = read("apps/vice-chair/assets/js/routine-reminders.js");
const mobileCss = read("apps/vice-chair/assets/css/routine-reminders-mobile.css");
const config = read("supabase/config.toml");

const mondayAtEightTaipei = new Date("2026-08-10T12:00:00Z");
assert.deepEqual(taipeiDateParts(mondayAtEightTaipei), {
  year: "2026", month: "08", day: "10", hour: "20", minute: "00",
  date: "2026-08-10", weekday: 1, minuteOfDay: 1200,
});
assert.equal(lastIsoWeekdayOfMonth(2026, 8, 2), "2026-08-25");
assert.equal(firstIsoWeekdayOfMonth(2026, 9, 2), "2026-09-01");
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

const committee = { reminder_key: "monthly_committee_meeting", enabled: true, meeting_weekday: 2, days_before: 1, send_time: "20:00:00" };
assert.equal(ruleDueDate(committee, new Date("2026-08-31T12:00:00Z")), "2026-08-31");
assert.equal(isRuleDue(committee, new Date("2026-08-31T12:05:00Z")), true);
assert.equal(ruleDueDate(committee, new Date("2026-09-07T12:00:00Z")), null);
assert.equal(reminderRouteKey("monthly_committee_meeting"), "committee");
assert.equal(reminderRouteKey("monthly_data_entry"), "exchange");
assert.equal(isOpportunisticReminder("weekly_meeting_alarm"), true);
assert.equal(isOpportunisticReminder("monthly_data_entry"), true);
assert.equal(isOpportunisticReminder("monthly_committee_meeting"), false);
assert.deepEqual(nextRuleOccurrence(monthly, new Date("2026-08-08T06:00:00Z")), {
  date: "2026-08-24", time: "20:00", localDateTime: "2026-08-24T20:00", timezone: "Asia/Taipei", weekday: 1,
});
assert.deepEqual(nextRuleOccurrence(committee, new Date("2026-08-08T06:00:00Z")), {
  date: "2026-08-31", time: "20:00", localDateTime: "2026-08-31T20:00", timezone: "Asia/Taipei", weekday: 1,
});
assert.equal(nextRuleOccurrence(committee, new Date("2026-08-31T12:01:00Z")).localDateTime, "2026-10-05T20:00");

const earlyWeekly = { reminder_key: "weekly_meeting_alarm", enabled: true, send_weekday: 2, send_time: "08:00:00" };
assert.equal(opportunisticDeliveryWindow(earlyWeekly, new Date("2026-08-10T11:59:00Z")), null);
assert.deepEqual(opportunisticDeliveryWindow(earlyWeekly, new Date("2026-08-10T12:00:00Z")), {
  localDueDate: "2026-08-11",
  deadlineLocal: "2026-08-11T08:00",
  scheduledFor: "2026-08-11T00:00:00.000Z",
  windowStart: "2026-08-10T12:00:00.000Z",
  windowEnd: "2026-08-11T00:00:00.000Z",
  expired: false,
});
assert.equal(opportunisticDeliveryWindow(earlyWeekly, new Date("2026-08-11T00:01:00Z")).expired, true);
assert.equal(formatTaipeiReminderDeadline("2026-08-11T00:00:00.000Z"), "2026/08/11（週二）08:00");
assert.deepEqual(buildReminderFallbackMessages({
  reminderKey: "weekly_meeting_alarm",
  scheduledFor: "2026-08-11T00:00:00.000Z",
  content: "明天例會，請記得設定鬧鐘。",
  groupName: "富聯交流群",
}), [
  {
    type: "text",
    text: "🔔【交流群提醒尚未送達】\n副主席秘書 Bot 在 12 小時等待期間內，沒有遇到可用的交流群新訊息，因此尚未將提醒送到交流群。\n\n請副主席或管理者：\n1. 長按並複製下一則訊息\n2. 貼到「富聯交流群」\n3. 送出前在群內手動標註 @所有人\n\n提醒項目：每週例會鬧鐘提醒\n原訂最晚送達：2026/08/11（週二）08:00",
  },
  { type: "text", text: "明天例會，請記得設定鬧鐘。" },
]);

assert.deepEqual(validateReminderUpdate({ reminderKey: "weekly_meeting_alarm", enabled: false, sendWeekday: 5, sendTime: "18:30", messageTemplate: "提醒", mentionAll: true }), {
  reminder_key: "weekly_meeting_alarm", enabled: false, send_time: "18:30", message_template: "提醒", mention_all: true,
  send_weekday: 5, meeting_weekday: null, days_before: null,
});
assert.throws(() => validateReminderUpdate({ reminderKey: "weekly_meeting_alarm", sendWeekday: 0, sendTime: "20:00", messageTemplate: "提醒" }), /每週發送日/);
assert.throws(() => validateReminderUpdate({ reminderKey: "monthly_data_entry", sendTime: "25:00", messageTemplate: "提醒", meetingWeekday: 2, daysBefore: 1 }), /發送時間/);
assert.throws(() => validateReminderUpdate({ reminderKey: "monthly_data_entry", sendTime: "20:00", messageTemplate: "", meetingWeekday: 2, daysBefore: 1 }), /提醒文案/);
assert.deepEqual(validateReminderUpdate({ reminderKey: "monthly_committee_meeting", enabled: false, sendTime: "19:30", messageTemplate: "委員會提醒", meetingWeekday: 3, daysBefore: 7 }), {
  reminder_key: "monthly_committee_meeting", enabled: false, send_time: "19:30", message_template: "委員會提醒", mention_all: true,
  send_weekday: null, meeting_weekday: 3, days_before: 1,
});
assert.equal(buildLineMentionAllMessage("明天例會").text, "{all}\n明天例會");

assert.match(migration, /'attendance', 'committee', 'leadership', 'exchange'/);
assert.match(migration, /enabled boolean not null default false/);
assert.match(migration, /delivery_key text not null unique/);
assert.match(migration, /revoke all on table public\.line_reminder_rules, public\.line_reminder_deliveries/);
assert.match(committeeMigration, /monthly_committee_meeting/);
assert.match(committeeMigration, /enabled,[\s\S]*?false/);
assert.match(committeeMigration, /line_reminder_rules_schedule_shape_check/);
assert.match(replyDrivenMigration, /add column delivery_strategy text not null default 'push'/);
assert.match(replyDrivenMigration, /create table public\.pending_announcements/);
assert.match(replyDrivenMigration, /trigger_source in \('scheduled', 'manual_test'\)/);
assert.match(replyDrivenMigration, /revoke all on table public\.pending_announcements/);
assert.match(replyDrivenMigration, /Stores prepared reminder payloads but never replyTokens, LINE user IDs, or triggering group message contents/);
assert.match(appApi, /path === "\/api\/line-reminders"/);
assert.match(appApi, /reminderRouteKey\(reminderKey\)/);
assert.match(appApi, /nextScheduledLocal: next\?\.localDateTime \|\| null/);
assert.match(appApi, /route_key=in\.\(exchange,committee\)/);
assert.match(appApi, /async function finishLineReminderDelivery[\s\S]*?line_reminder_deliveries\?id=eq\./);
const reminderTestHandler = appApi.match(/async function sendLineReminderTest[\s\S]*?\n}\n\nasync function lineRemindersApi/)[0];
assert.doesNotMatch(reminderTestHandler, /finishLineDelivery\(/);
assert.match(reminderTestHandler, /finishLineReminderDelivery\(/);
assert.match(appApi, /LINE_ROUTE_KEYS = new Set\(\["attendance", "committee", "leadership", "exchange"\]\)/);
assert.match(appApi, /submittedKeys\.size !== LINE_REMINDER_KEYS\.length/);
assert.match(appApi, /Supabase 排程尚未啟用，請先保持提醒關閉/);
assert.match(appApi, /async function queueReplyDrivenReminderTest/);
assert.match(appApi, /action === "mark_manual"/);
assert.match(appApi, /status=in\.\(fallback_notified,failed,expired\)/);
assert.match(cron, /x-cron-secret/);
assert.match(cron, /const deliveryKey = `scheduled:/);
assert.match(cron, /delivery_key: deliveryKey/);
assert.match(cron, /X-Line-Retry-Key/);
assert.match(cron, /existing\.status === "sent" \|\| Number\(existing\.attempt_count \|\| 0\) >= 3/);
assert.match(cron, /status: "processing",[\s\S]*?attempt_count: Number\(existing\.attempt_count/);
assert.match(cron, /const routeKey = reminderRouteKey\(rule\.reminder_key\)/);
assert.match(cron, /"missing-target"/);
assert.match(cron, /opportunisticDeliveryWindow\(rule, now/);
const fallbackHandler = cron.match(/async function sendFallbackBroadcast[\s\S]*?\n}\n\nasync function processFallbacks/)[0];
assert.match(fallbackHandler, /\/v2\/bot\/message\/broadcast/);
assert.match(fallbackHandler, /body: JSON\.stringify\(\{ messages \}\)/);
assert.doesNotMatch(fallbackHandler, /\bto:/);
assert.match(webhook, /for \(const opportunity of collectReplyOpportunityEvents\(payload\)\)/);
assert.match(webhook, /if \(await processReplyOpportunityEvent\(opportunity\)\) break/);
assert.match(webhook, /\/v2\/bot\/message\/reply/);
assert.match(webhook, /messages: \[claimed\[0\]\.message_payload\]/);
assert.match(config, /\[functions\.line-reminder-cron\]\nverify_jwt = false/);
assert.match(settings, /exchange:"交流群常態通知"/);
assert.match(nav, /"常態通知", "routine-reminders\.html", "vp"/);
assert.match(index, /class="nav-item vp-only" href="routine-reminders\.html"/);
assert.match(html, /id="weeklyEnabled"/);
assert.match(html, /id="weeklyWeekday"/);
assert.match(html, /id="monthlyEnabled"/);
assert.match(html, /id="committeeEnabled"/);
assert.match(html, /id="committeeMeetingWeekday"/);
assert.match(html, /id="committeeTime"/);
assert.match(html, /id="committeeTargetState"/);
assert.match(html, /id="monthlyNextReminder"/);
assert.match(html, /id="weeklyNextReminder"/);
assert.match(html, /id="committeeNextReminder"/);
assert.match(html, /id="deliveryList"/);
assert.match(html, /routine-reminders-mobile\.css\?v=4/);
assert.match(html, /work-digest\.css\?v=2/);
assert.match(mobileCss, /\.reminder-card \.toggle-row input\[type="checkbox"\]/);
assert.match(mobileCss, /flex: 0 0 46px/);
assert.match(mobileCss, /\.topbar > label[\s\S]*?display: none !important/);
assert.match(mobileCss, /grid-template-columns: minmax\(0, 1fr\)/);
assert.match(mobileCss, /input\[type="time"\][\s\S]*?width: -webkit-fill-available !important/);
assert.match(script, /action:"save"/);
assert.match(script, /action:"test"/);
assert.match(script, /建立 15 分鐘回覆測試/);
assert.match(script, /15 分鐘未命中就結束測試，不會群發好友備援/);
assert.match(script, /action:"mark_manual"/);
assert.match(script, /data-copy-reminder/);
assert.match(script, /const escapeHtml=/);
assert.match(script, /sendWeekday:Number\(\$\("#weeklyWeekday"\)\.value\)/);
assert.match(script, /monthly_committee_meeting:"committee"/);
assert.match(script, /meetingWeekday:Number\(\$\("#committeeMeetingWeekday"\)\.value\)/);
assert.match(script, /formatNextReminder/);
assert.match(script, /目前未啟用・啟用後才會開始排程/);

console.log("LINE recurring reminder tests passed");
