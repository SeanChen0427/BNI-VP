import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const projectRoot = new URL("../../../", import.meta.url);

async function source(path, base = root) {
  return readFile(new URL(path, base), "utf8");
}

test("當責信待寄中心只提供複製與人工寄送留痕，不含核准或自動寄信按鈕", async () => {
  const html = await source("accountability-emails.html");
  const script = await source("assets/js/accountability-emails.js");
  assert.match(html, /id="copyAll"/);
  assert.match(html, /id="markSent"[^>]*>標記已人工寄送/);
  assert.match(html, /沒有核准關卡/);
  assert.doesNotMatch(html, /id="approve|待核准|核准後才能寄/);
  assert.match(script, /action:\s*"record-copy"/);
  assert.match(script, /action, id: task\.id/);
  assert.match(script, /系統不會代為寄送；此動作只保存寄發紀錄/);
  assert.doesNotMatch(script, /sendEmail|smtp|mailto:/i);
});

test("首頁通知中心同步待寄任務並連到副主席專用頁", async () => {
  const notification = await source("assets/js/notification-center.js");
  const index = await source("index.html");
  const navigation = await source("assets/js/workspace-nav.js");
  const login = await source("assets/js/login.js");
  assert.match(notification, /\/api\/accountability-emails/);
  assert.match(notification, /accountability-emails\.html\?task=/);
  assert.match(index, /href="accountability-emails\.html"/);
  assert.match(index, /data-nav-key="common-resources"[\s\S]*href="accountability-emails\.html"[\s\S]*<\/details>/);
  assert.match(navigation, /"當責信待寄",\s*"accountability-emails\.html",\s*"vp"/);
  assert.match(login, /"accountability-emails\.html"/);
});

test("正式 API 只由副主席或 Admin 使用，回應明示不寄信且不需核准", async () => {
  const api = await source("supabase/functions/app-api/index.ts", projectRoot);
  assert.match(api, /accountabilityEmailsApi\(request, context\)/);
  assert.match(api, /leadership\(context\);/);
  assert.match(api, /sendsEmail:\s*false,\s*requiresApproval:\s*false/);
  assert.match(api, /latestAttendancePalms\(\)/);
  assert.match(api, /accountabilityEmailDomain\.crossings\(before, after\)/);
  assert.match(api, /body\.action === "mark-sent"/);
  assert.doesNotMatch(api, /body\.action === "approve-accountability/);
});

test("當責信資料表不開放瀏覽器直寫並保存產生、複製與人工寄送稽核", async () => {
  const migration = await source("supabase/migrations/20260827090000_accountability_email_tasks.sql", projectRoot);
  assert.match(migration, /create table public\.accountability_email_tasks/);
  assert.match(migration, /create table public\.accountability_email_events/);
  assert.match(migration, /revoke all on table public\.accountability_email_tasks, public\.accountability_email_events\s+from public, anon, authenticated/);
  assert.match(migration, /event_type in \('generated', 'copied', 'sent', 'held', 'not_applicable', 'restored'\)/);
  assert.match(migration, /unique \(member_id, reason, occurrence, trigger_on\)/);
});
