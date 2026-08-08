import { parsePalmsText, parseExpiryText, parseTenureText } from "../../../apps/bni-analysis/engine/parse-reports.mjs";
import { parseAuditWeekText, combineAuditWeeks } from "../../../apps/bni-analysis/engine/audit.mjs";
import { buildAnalysisFromParsed } from "../../../apps/bni-analysis/engine/analyze.mjs";
import { renderDashboard } from "../../../apps/bni-analysis/engine/render-dashboard.mjs";
import { parseBniDashboard } from "../../../apps/vice-chair/bni-bridge.mjs";
import "../../../apps/vice-chair/core/attendance-domain.js";
import { rawReportObjectPath } from "./storage-object-key.mjs";
import { buildLineAttendanceMessage, buildLineMentionAllMessage, lineAttendanceFingerprintSource } from "./line-message.mjs";
import { LINE_REMINDER_KEYS, nextRuleOccurrence, reminderRouteKey, validateReminderUpdate } from "../_shared/line-reminder-domain.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://seanchen0427.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const PROVIDERS = ["openai", "gemini", "anthropic"] as const;
const MODELS = {
  openai: "gpt-5.6-luna",
  gemini: "gemini-3.5-flash",
  anthropic: "claude-sonnet-5",
} as const;
const DEFAULT_GEMINI_REVIEW_MODEL = "gemini-3.6-flash";
const GEMINI_REVIEW_MODELS = new Set([
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-pro",
]);
const GEMINI_EDGE_TOTAL_BUDGET_MS = 110_000;
const GEMINI_FLASH_ATTEMPT_TIMEOUT_MS = 32_000;
const GEMINI_PRO_ATTEMPT_TIMEOUT_MS = 100_000;
const GEMINI_MIN_ATTEMPT_MS = 5_000;
const GEMINI_MAX_ATTEMPTS = 3;
const REVIEW_MAX_TOKENS = 6000;
const SYSTEM_ADMIN_NAME = "系統開發人員 Admin";
const attendanceDomain = (globalThis as any).FulianAttendanceDomain;

type Provider = typeof PROVIDERS[number];
type Context = {
  authorization: string;
  userId: string;
  role: "admin" | "vp" | "committee";
  identity: string;
  name: string;
  personId: string;
};

function cors(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://seanchen0427.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function respond(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function lineAccessToken() {
  return Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
}

async function serviceFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || payload.hint || `Supabase HTTP ${response.status}`);
  }
  return response;
}

async function db(path: string, options: RequestInit = {}) {
  const response = await serviceFetch(`/rest/v1/${path}`, options);
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Supabase 回應格式不正確：HTTP ${response.status}`);
  }
}

async function ensurePerson(name: string) {
  const rows = await db(`people?display_name=eq.${encodeURIComponent(name)}&select=id,display_name,status&limit=1`);
  if (rows?.[0]) return rows[0];
  const created = await db("people", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ display_name: name, notes: "系統共用管理身分" }),
  });
  return created[0];
}

async function authenticate(request: Request, identity: string): Promise<Context> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("請先登入"), { status: 401 });
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user.id) throw Object.assign(new Error("登入工作階段無效或已逾時"), { status: 401 });
  const accounts = await db(`app_accounts?auth_user_id=eq.${encodeURIComponent(user.id)}&select=role,enabled&limit=1`);
  const account = accounts?.[0];
  if (!account?.enabled) throw Object.assign(new Error("此帳號未啟用"), { status: 403 });
  const match = String(identity || "").match(/^(admin|vp|committee):(.{1,100})$/u);
  if (!match || match[1] !== account.role) throw Object.assign(new Error("登入身份與帳號角色不一致"), { status: 403 });
  const role = account.role as Context["role"];
  const name = match[2].trim();
  let person;
  if (role === "admin") {
    if (name !== SYSTEM_ADMIN_NAME) throw Object.assign(new Error("Admin 身份不正確"), { status: 403 });
    person = await ensurePerson(SYSTEM_ADMIN_NAME);
  } else {
    const people = await db(`people?display_name=eq.${encodeURIComponent(name)}&status=eq.active&select=id,display_name&limit=1`);
    person = people?.[0];
    if (!person) throw Object.assign(new Error("登入姓名不在有效名單"), { status: 403 });
    const today = taipeiDay();
    const terms = await db(`committee_terms?person_id=eq.${person.id}&role=eq.${role}&status=eq.active&starts_on=lte.${today}&or=(ends_on.is.null,ends_on.gte.${today})&select=id&limit=1`);
    if (!terms?.length) throw Object.assign(new Error("登入姓名不具當期角色"), { status: 403 });
  }
  return { authorization, userId: user.id, role, identity, name, personId: person.id };
}

function leadership(context: Context) {
  if (!["admin", "vp"].includes(context.role)) throw Object.assign(new Error("只有副主席或 Admin 可以執行此操作"), { status: 403 });
}

async function requestBody(request: Request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 25 * 1024 * 1024) throw Object.assign(new Error("上傳內容超過 25MB"), { status: 413 });
  return request.json().catch(() => ({}));
}

function routePath(url: URL) {
  const index = url.pathname.indexOf("/api/");
  return index >= 0 ? url.pathname.slice(index) : url.pathname.replace(/^\/app-api/, "");
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function taipeiDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthWindow(offsetMonths: number, countMonths: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - countMonths + 1, 1));
  return { start: isoDay(start), end: isoDay(end), month: isoDay(start).slice(0, 7) };
}

function expectedAuditWeeks(start: string, end: string) {
  let count = 0;
  const date = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (date <= last) {
    if (date.getUTCDay() === 2) count += 1;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return count;
}

async function reportImports() {
  return db("report_imports?select=*&order=imported_at.desc");
}

function reportCategory(row: any) {
  const metadata = row?.metadata || {};
  if (metadata.category) return metadata.category;
  const original = String(metadata.originalPath || metadata.originalFilename || row.storage_path || "");
  if (row.report_type === "monthly_palms") return "monthly";
  if (row.report_type === "membership") return "membership";
  if (row.report_type === "tenure") return "tenure";
  if (row.report_type === "audit") return "audit";
  if (/annual/i.test(original)) return "annual";
  if (row.report_type === "half_year_palms") return "halfYear";
  return "other";
}

function latestByCategory(rows: any[], category: string, period?: { start: string; end: string }) {
  return rows.find((row) => reportCategory(row) === category
    && (!period || (row.period_start === period.start && row.period_end === period.end)));
}

function auditDate(row: any) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.period_start || ""))) return row.period_start;
  const source = [
    row?.storage_path,
    row?.metadata?.originalPath,
    row?.metadata?.originalFilename,
  ].filter(Boolean).join(" ");
  return source.match(/audit_week_(\d{4}-\d{2}-\d{2})\.xls/i)?.[1] || null;
}

async function downloadReport(row: any) {
  if (!row) throw new Error("缺少必要的 BNI 報表");
  const response = await serviceFetch(`/storage/v1/object/authenticated/${row.storage_bucket}/${row.storage_path}`);
  return response.text();
}

function attendanceCountList(map: Map<string, number>) {
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([name, count]) => `${name}（${count}次）`).join("、");
}

async function saveMonthlyAttendance(report: any, importId: string, storagePath: string) {
  const activeRows = await db("members?status=eq.active&select=people!inner(display_name)");
  const active = new Set((activeRows || []).map((row: any) => String(row.people?.display_name || "").replace(/\s+/g, "")));
  const members = report.members.filter((member: any) => active.has(member.name));
  const absence = new Map<string, number>();
  const late = new Map<string, number>();
  const proxy = new Map<string, number>();
  let absenceActual = 0;
  let lateActual = 0;
  let proxyActual = 0;
  const add = (map: Map<string, number>, name: string, count: number) => map.set(name, (map.get(name) || 0) + count);
  for (const member of members) {
    if (member.absent) { absenceActual += member.absent; add(absence, member.name, member.absent); }
    if (member.late) { lateActual += member.late; add(late, member.name, member.late); }
    if (member.substitute) { proxyActual += member.substitute; add(proxy, member.name, member.substitute); }
  }
  const month = report.period.start.slice(0, 7);
  const summary = {
    month,
    memberCount: members.length,
    absenceActual,
    absenceList: attendanceCountList(absence),
    lateActual,
    lateList: attendanceCountList(late),
    proxyActual,
    proxyList: attendanceCountList(proxy),
    periodStart: report.period.start,
    periodEnd: report.period.end,
    source: `BNI Connect 單月 PALMS｜Private Storage/${storagePath}`,
    fetchedAt: new Date().toISOString(),
  };
  await db("monthly_attendance_summaries?on_conflict=month", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ month: `${month}-01`, summary, report_import_id: importId, generated_at: summary.fetchedAt }),
  });
  return summary;
}

async function latestAttendancePalms() {
  const imports = await reportImports();
  const source = latestByCategory(imports, "halfYear");
  if (!source) throw new Error("尚未上傳可作為出席基準的最新半年 PALMS");
  const parsed = parsePalmsText(await downloadReport(source), source.storage_path);
  return {
    importId: source.id,
    periodStart: parsed.period.start,
    periodEnd: parsed.period.end,
    importedAt: source.imported_at,
    source: `BNI Connect 半年 PALMS｜Private Storage/${source.storage_path}`,
    members: new Map(parsed.members.map((member: any) => [member.name, {
      late: Number(member.late) || 0,
      proxy: Number(member.substitute) || 0,
      absence: Number(member.absent) || 0,
    }])),
  };
}

function apiAttendanceRow(record: any, officialById: Map<string, any>, provisionalById: Map<string, any>) {
  const member = record.member_id
    ? officialById.get(record.member_id)
    : provisionalById.get(record.provisional_member_id);
  return {
    attendanceId: member?.attendanceId || "",
    name: member?.name || "",
    profession: member?.profession || "",
    provisional: Boolean(member?.provisional),
    at630: Boolean(record.present_0630),
    at700: Boolean(record.present_0700),
    late: Boolean(record.late),
    early: Boolean(record.left_early),
    proxy: Boolean(record.proxy),
    absent: Boolean(record.absent),
    speech: Boolean(record.presentation_completed),
    badge: Boolean(record.name_badge),
    pin: Boolean(record.pin_badge),
    suit: Boolean(record.suit),
    camera: Boolean(record.camera_on),
    note: record.notes || "",
  };
}

function operationalCounts(record: any) {
  return attendanceDomain.operationalCounts(record);
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function lineRequest(path: string, options: RequestInit = {}) {
  const token = lineAccessToken();
  if (!token) throw Object.assign(new Error("LINE Channel Access Token 尚未設定"), { status: 503 });
  const response = await fetch(`https://api.line.me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  return response;
}

function publicLineTarget(row: any) {
  return {
    id: row.id,
    displayName: row.display_name || "待確認 LINE 群組",
    environment: row.purpose || null,
    routeKey: row.route_key || null,
    status: row.status,
    availableForAssignment: row.status === "discovered" || (row.status === "disabled" && !row.left_at),
    lastEventAt: row.last_event_at,
    verifiedAt: row.verified_at || null,
  };
}

async function refreshLineGroupName(row: any) {
  if (!lineAccessToken() || (row.display_name && row.display_name !== "待確認 LINE 群組")) return row;
  try {
    const response = await lineRequest(`/v2/bot/group/${encodeURIComponent(row.line_group_id)}/summary`);
    if (!response.ok) return row;
    const summary = await response.json().catch(() => ({}));
    const displayName = String(summary.groupName || "").trim().slice(0, 200);
    if (!displayName) return row;
    await db(`line_group_targets?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ display_name: displayName }),
    });
    return { ...row, display_name: displayName };
  } catch {
    return row;
  }
}

async function lineAttendanceState(currentSession: any, context: Context) {
  if (!["admin", "vp"].includes(context.role)) return { visible: false };
  const targetRows = await db("line_group_targets?status=in.(discovered,active)&select=*&order=last_event_at.desc");
  const targets = await Promise.all((targetRows || []).map(refreshLineGroupName));
  const activeTarget = targets.find((target: any) => target.status === "active" && target.route_key === "attendance") || null;
  let delivery = null;
  if (currentSession?.id && currentSession?.announcement_snapshot && activeTarget) {
    const announcementHash = await sha256Text(lineAttendanceFingerprintSource(currentSession.announcement_snapshot));
    const deliveryRows = await db(
      `attendance_line_deliveries?attendance_session_id=eq.${currentSession.id}&group_target_id=eq.${activeTarget.id}&announcement_sha256=eq.${announcementHash}&select=status,attempt_count,requested_at,sent_at,failed_at,error_message&limit=1`,
    );
    const row = deliveryRows?.[0];
    if (row) delivery = {
      status: row.status,
      attemptCount: row.attempt_count,
      requestedAt: row.requested_at,
      sentAt: row.sent_at,
      failedAt: row.failed_at,
      errorMessage: row.error_message || "",
    };
  }
  return {
    visible: true,
    configured: Boolean(lineAccessToken()),
    target: activeTarget ? publicLineTarget(activeTarget) : null,
    discoveredTargets: targets.filter((target: any) => target.status === "discovered").map(publicLineTarget),
    delivery,
    ready: Boolean(lineAccessToken() && activeTarget && currentSession?.status === "confirmed" && currentSession?.announcement_snapshot && delivery?.status !== "sent"),
  };
}

const LINE_ROUTE_KEYS = new Set(["attendance", "committee", "leadership", "exchange"]);
const LINE_ENVIRONMENTS = new Set(["test", "production"]);

async function assignLineTarget(targetId: string, routeKey: string, environment: string, context: Context) {
  leadership(context);
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new Error("LINE 群組識別資料不正確");
  if (!LINE_ROUTE_KEYS.has(routeKey)) throw new Error("LINE 群組用途不正確");
  if (!LINE_ENVIRONMENTS.has(environment)) throw new Error("LINE 群組環境不正確");
  const rows = await db(`line_group_targets?id=eq.${encodeURIComponent(targetId)}&status=in.(discovered,active,disabled)&select=*&limit=1`);
  let target = rows?.[0];
  if (!target) throw Object.assign(new Error("這個 LINE 群組已更新，請重新整理後再操作"), { status: 409 });
  const summaryResponse = await lineRequest(`/v2/bot/group/${encodeURIComponent(target.line_group_id)}/summary`);
  const summary = await summaryResponse.json().catch(() => ({}));
  if (!summaryResponse.ok) {
    throw Object.assign(new Error("LINE Bot 目前無法確認此群組，請確認 Bot 仍在測試群中"), { status: 502 });
  }
  const now = new Date().toISOString();
  await db(`line_group_targets?status=eq.active&route_key=eq.${routeKey}&id=neq.${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "disabled", purpose: null, route_key: null, verified_by: null, verified_at: null }),
  });
  const activated = await db(`line_group_targets?id=eq.${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      display_name: String(summary.groupName || target.display_name || "LINE 測試群").trim().slice(0, 200),
      purpose: environment,
      route_key: routeKey,
      status: "active",
      verified_by: context.personId,
      verified_at: now,
      left_at: null,
    }),
  });
  if (!activated?.[0]) throw Object.assign(new Error("群組連結狀態已變更，請重新整理"), { status: 409 });
  return { message: `已確認「${activated[0].display_name}」的 LINE 群組用途`, target: publicLineTarget(activated[0]) };
}

async function disableLineTarget(targetId: string, context: Context) {
  leadership(context);
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new Error("LINE 群組識別資料不正確");
  const updated = await db(`line_group_targets?id=eq.${encodeURIComponent(targetId)}&status=eq.active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "disabled", purpose: null, route_key: null, verified_by: null, verified_at: null }),
  });
  if (!updated?.[0]) throw Object.assign(new Error("群組設定已更新，請重新整理"), { status: 409 });
  return { message: `已停用「${updated[0].display_name}」`, target: publicLineTarget(updated[0]) };
}

async function lineGroupsApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") {
    const rows = await db("line_group_targets?select=*&order=last_event_at.desc&limit=30");
    const targets = await Promise.all((rows || []).map(refreshLineGroupName));
    return { configured: Boolean(lineAccessToken()), targets: targets.map(publicLineTarget) };
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.action === "assign") {
    return assignLineTarget(String(body.targetId || ""), String(body.routeKey || ""), String(body.environment || "production"), context);
  }
  if (body.action === "disable") return disableLineTarget(String(body.targetId || ""), context);
  throw new Error("LINE 群組操作不正確");
}

function publicLineReminderRule(row: any) {
  const next = nextRuleOccurrence(row);
  return {
    reminderKey: row.reminder_key,
    displayName: row.display_name,
    enabled: Boolean(row.enabled),
    sendWeekday: row.send_weekday,
    sendTime: String(row.send_time || "").slice(0, 5),
    meetingWeekday: row.meeting_weekday,
    daysBefore: row.days_before,
    messageTemplate: row.message_template,
    mentionAll: Boolean(row.mention_all),
    nextScheduledLocal: next?.localDateTime || null,
    updatedAt: row.updated_at,
  };
}

function publicLineReminderDelivery(row: any) {
  return {
    reminderKey: row.reminder_key,
    triggerSource: row.trigger_source,
    localDueDate: row.local_due_date,
    status: row.status,
    requestedAt: row.requested_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    errorMessage: row.error_message || "",
  };
}

async function lineRemindersState() {
  const [rules, targets, deliveries] = await Promise.all([
    db("line_reminder_rules?select=*&order=reminder_key.asc"),
    db("line_group_targets?status=eq.active&route_key=in.(exchange,committee)&select=*&order=route_key.asc"),
    db("line_reminder_deliveries?select=reminder_key,trigger_source,local_due_date,status,requested_at,sent_at,failed_at,error_message&order=requested_at.desc&limit=20"),
  ]);
  const targetByRoute = Object.fromEntries((targets || []).map((target: any) => [target.route_key, publicLineTarget(target)]));
  return {
    configured: Boolean(lineAccessToken()),
    schedulerReady: Boolean(Deno.env.get("LINE_REMINDER_CRON_SECRET")),
    target: targetByRoute.exchange || null,
    targets: {
      exchange: targetByRoute.exchange || null,
      committee: targetByRoute.committee || null,
    },
    rules: (rules || []).map(publicLineReminderRule),
    deliveries: (deliveries || []).map(publicLineReminderDelivery),
  };
}

async function finishLineReminderDelivery(deliveryId: string, patch: any) {
  await db(`line_reminder_deliveries?id=eq.${deliveryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function sendLineReminderTest(reminderKey: string, context: Context) {
  if (!LINE_REMINDER_KEYS.includes(reminderKey)) throw new Error("提醒類型不正確");
  if (!lineAccessToken()) throw Object.assign(new Error("LINE Channel Access Token 尚未設定"), { status: 503 });
  const routeKey = reminderRouteKey(reminderKey);
  const [rules, targets] = await Promise.all([
    db(`line_reminder_rules?reminder_key=eq.${encodeURIComponent(reminderKey)}&select=*&limit=1`),
    db(`line_group_targets?status=eq.active&route_key=eq.${encodeURIComponent(routeKey)}&select=*&limit=1`),
  ]);
  const rule = rules?.[0];
  const target = targets?.[0];
  if (!rule) throw Object.assign(new Error("找不到指定提醒"), { status: 404 });
  if (!target) throw Object.assign(new Error(`尚未在後台指定${routeKey === "committee" ? "會員委員會群" : "交流群"}`), { status: 409 });
  const content = String(rule.message_template || "").trim();
  const message = rule.mention_all ? buildLineMentionAllMessage(content) : { type: "text", text: content };
  const id = crypto.randomUUID();
  const retryKey = crypto.randomUUID();
  const now = new Date().toISOString();
  const deliveryRows = await db("line_reminder_deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      delivery_key: `manual:${reminderKey}:${id}`,
      reminder_key: reminderKey,
      group_target_id: target.id,
      trigger_source: "manual_test",
      local_due_date: taipeiDay(),
      message_sha256: await sha256Text(content),
      retry_key: retryKey,
      requested_by: context.personId,
      requested_by_auth_user_id: context.userId,
      requested_at: now,
    }),
  });
  const delivery = deliveryRows?.[0];
  let response: Response;
  try {
    response = await lineRequest("/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to: target.line_group_id, messages: [message] }),
    });
  } catch (error) {
    const errorMessage = String((error as Error)?.message || error).slice(0, 1000);
    await finishLineReminderDelivery(delivery.id, { status: "failed", failed_at: new Date().toISOString(), error_code: "NETWORK", error_message: errorMessage });
    throw Object.assign(new Error(`LINE 平台連線失敗：${errorMessage}`), { status: 502 });
  }
  const payload = await response.json().catch(() => ({}));
  const acceptedRequestId = response.headers.get("x-line-accepted-request-id") || "";
  if (!response.ok && !(response.status === 409 && acceptedRequestId)) {
    const errorMessage = String(payload.message || `LINE HTTP ${response.status}`).slice(0, 1000);
    await finishLineReminderDelivery(delivery.id, { status: "failed", failed_at: new Date().toISOString(), error_code: `HTTP_${response.status}`, error_message: errorMessage });
    throw Object.assign(new Error(`LINE 測試發送失敗：${errorMessage}`), { status: 502 });
  }
  await finishLineReminderDelivery(delivery.id, {
    status: "sent",
    sent_at: new Date().toISOString(),
    line_request_id: response.headers.get("x-line-request-id") || acceptedRequestId || null,
    line_message_id: payload?.sentMessages?.[0]?.id || null,
  });
  return { message: `測試提醒已發送到「${target.display_name}」`, state: await lineRemindersState() };
}

async function lineRemindersApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") return lineRemindersState();
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.action === "test") return sendLineReminderTest(String(body.reminderKey || ""), context);
  if (body.action !== "save") throw new Error("常態通知操作不正確");
  if (!Array.isArray(body.rules) || body.rules.length !== LINE_REMINDER_KEYS.length) throw new Error("提醒設定不完整");
  const submittedKeys = new Set(body.rules.map((rule: any) => String(rule?.reminderKey || "")));
  if (submittedKeys.size !== LINE_REMINDER_KEYS.length || !LINE_REMINDER_KEYS.every(key => submittedKeys.has(key))) throw new Error("提醒設定類型不完整");
  const updates = body.rules.map(validateReminderUpdate);
  if (updates.some((rule: any) => rule.enabled)) {
    if (!Deno.env.get("LINE_REMINDER_CRON_SECRET")) throw Object.assign(new Error("Supabase 排程尚未啟用，請先保持提醒關閉"), { status: 409 });
    const requiredRoutes = new Set(updates.filter((rule: any) => rule.enabled).map((rule: any) => reminderRouteKey(rule.reminder_key)));
    const targets = await db("line_group_targets?status=eq.active&route_key=in.(exchange,committee)&select=route_key");
    const activeRoutes = new Set((targets || []).map((target: any) => target.route_key));
    const missingRoute = [...requiredRoutes].find(route => !activeRoutes.has(route));
    if (missingRoute) throw Object.assign(new Error(`啟用提醒前，請先在系統設定指定${missingRoute === "committee" ? "會員委員會群" : "交流群"}`), { status: 409 });
  }
  for (const rule of updates) {
    await db(`line_reminder_rules?reminder_key=eq.${encodeURIComponent(rule.reminder_key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ...rule, updated_by: context.personId }),
    });
  }
  return { message: "常態通知設定已保存", state: await lineRemindersState() };
}

async function beginLineDelivery(session: any, target: any, announcementHash: string, context: Context) {
  const existingRows = await db(
    `attendance_line_deliveries?attendance_session_id=eq.${session.id}&group_target_id=eq.${target.id}&announcement_sha256=eq.${announcementHash}&select=*&limit=1`,
  );
  const existing = existingRows?.[0];
  if (existing?.status === "sent") {
    throw Object.assign(new Error("這個版本的公告已發送到 LINE 群組，系統已阻擋重複發送"), { status: 409 });
  }
  if (existing?.status === "processing" && Date.now() - new Date(existing.requested_at).getTime() < 5 * 60 * 1000) {
    throw Object.assign(new Error("LINE 公告正在發送，請勿重複操作"), { status: 409 });
  }
  const now = new Date().toISOString();
  if (existing) {
    const updated = await db(`attendance_line_deliveries?id=eq.${existing.id}&status=neq.sent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "processing",
        attempt_count: Number(existing.attempt_count || 0) + 1,
        requested_by: context.personId,
        requested_by_auth_user_id: context.userId,
        requested_at: now,
        sent_at: null,
        failed_at: null,
        line_request_id: null,
        line_message_id: null,
        error_code: null,
        error_message: null,
      }),
    });
    if (!updated?.[0]) throw Object.assign(new Error("LINE 公告狀態已更新，請重新整理"), { status: 409 });
    return updated[0];
  }
  try {
    const inserted = await db("attendance_line_deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        attendance_session_id: session.id,
        group_target_id: target.id,
        announcement_sha256: announcementHash,
        requested_by: context.personId,
        requested_by_auth_user_id: context.userId,
      }),
    });
    return inserted[0];
  } catch (error) {
    if (String((error as Error)?.message || error).includes("duplicate key")) {
      throw Object.assign(new Error("LINE 公告正在發送或已發送，請勿重複操作"), { status: 409 });
    }
    throw error;
  }
}

async function finishLineDelivery(deliveryId: string, patch: any) {
  await db(`attendance_line_deliveries?id=eq.${deliveryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function sendLineAttendance(meetingDate: string, context: Context) {
  leadership(context);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
  if (!lineAccessToken()) throw Object.assign(new Error("LINE Channel Access Token 尚未設定"), { status: 503 });
  const [sessionRows, targetRows] = await Promise.all([
    db(`attendance_sessions?meeting_date=eq.${meetingDate}&status=eq.confirmed&select=id,meeting_date,status,announcement_snapshot&limit=1`),
    db("line_group_targets?status=eq.active&route_key=eq.attendance&select=*&limit=1"),
  ]);
  const session = sessionRows?.[0];
  const target = targetRows?.[0];
  if (!session?.announcement_snapshot) throw Object.assign(new Error("本週尚未完成最終確認，不能發送到 LINE"), { status: 409 });
  if (!target) throw Object.assign(new Error("尚未在後台設定每週出席公告群"), { status: 409 });
  const announcement = String(session.announcement_snapshot);
  let lineMessage;
  try {
    lineMessage = buildLineAttendanceMessage(announcement);
  } catch (error) {
    throw Object.assign(error as Error, { status: 413 });
  }
  const announcementHash = await sha256Text(lineAttendanceFingerprintSource(announcement));
  const delivery = await beginLineDelivery(session, target, announcementHash, context);
  let response: Response;
  try {
    response = await lineRequest("/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Line-Retry-Key": delivery.retry_key,
      },
      body: JSON.stringify({ to: target.line_group_id, messages: [lineMessage] }),
    });
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 1000);
    await finishLineDelivery(delivery.id, { status: "failed", failed_at: new Date().toISOString(), error_code: "NETWORK", error_message: message });
    throw Object.assign(new Error(`LINE 平台連線失敗：${message}`), { status: 502 });
  }
  const payload = await response.json().catch(() => ({}));
  const acceptedRequestId = response.headers.get("x-line-accepted-request-id") || "";
  if (!response.ok && !(response.status === 409 && acceptedRequestId)) {
    const message = String(payload.message || `LINE HTTP ${response.status}`).slice(0, 1000);
    await finishLineDelivery(delivery.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_code: `HTTP_${response.status}`,
      error_message: message,
      line_request_id: response.headers.get("x-line-request-id") || null,
    });
    throw Object.assign(new Error(`LINE 發送失敗：${message}`), { status: 502 });
  }
  const sentAt = new Date().toISOString();
  const requestId = response.headers.get("x-line-request-id") || acceptedRequestId || null;
  await finishLineDelivery(delivery.id, {
    status: "sent",
    sent_at: sentAt,
    failed_at: null,
    error_code: null,
    error_message: null,
    line_request_id: requestId,
    line_message_id: payload?.sentMessages?.[0]?.id || null,
  });
  await db(`attendance_sessions?id=eq.${session.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ announcement_sent_at: sentAt }),
  });
  return { message: `公告已發送到「${target.display_name}」`, sentAt, target: publicLineTarget(target) };
}

async function attendanceState(meetingDate: string, context: Context) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
  const [baseline, memberRows, provisionalRows, peopleRows, sessions] = await Promise.all([
    latestAttendancePalms(),
    db("members?status=eq.active&select=id,profession,people!inner(id,display_name)&order=created_at.asc"),
    db("provisional_members?status=eq.pending_palms&select=id,display_name,profession,joined_on&order=registered_at.asc"),
    db("people?status=eq.active&select=id,display_name"),
    db("attendance_sessions?select=*&order=meeting_date.desc&limit=30"),
  ]);
  const officialMembers = memberRows.map((row: any) => ({
    id: row.id,
    attendanceId: `member:${row.id}`,
    personId: row.people.id,
    name: String(row.people.display_name || "").replace(/\s+/g, ""),
    profession: row.profession || "",
    provisional: false,
  }));
  const provisionalMembers = (provisionalRows || []).map((row: any) => ({
    id: row.id,
    attendanceId: `provisional:${row.id}`,
    personId: null,
    name: String(row.display_name || "").replace(/\s+/g, ""),
    profession: row.profession || "",
    joinedOn: row.joined_on,
    provisional: true,
  }));
  const members = [...officialMembers, ...provisionalMembers];
  const officialById = new Map(officialMembers.map((member: any) => [member.id, member]));
  const provisionalById = new Map(provisionalMembers.map((member: any) => [member.id, member]));
  const memberByAttendanceId = new Map(members.map((member: any) => [member.attendanceId, member]));
  const people = new Map(peopleRows.map((person: any) => [person.id, person.display_name]));
  const currentSession = sessions.find((session: any) => session.meeting_date === meetingDate) || null;
  const currentRecords = currentSession
    ? await db(`attendance_records?session_id=eq.${currentSession.id}&select=*&order=created_at.asc`)
    : [];
  const overlaySessions = (await db(
    `attendance_sessions?status=eq.confirmed&select=id,meeting_date,attendance_records(*)&order=meeting_date.asc`,
  )).filter((session: any) =>
    attendanceDomain.isUnreconciledMeeting(session.meeting_date, baseline.periodEnd, meetingDate)
  );
  const overlay: Record<string, { late: number; proxy: number; absence: number }> = {};
  for (const member of members) overlay[member.attendanceId] = { late: 0, proxy: 0, absence: 0 };
  for (const session of overlaySessions) {
    for (const record of session.attendance_records || []) {
      const member = record.member_id
        ? officialById.get(record.member_id)
        : provisionalById.get(record.provisional_member_id);
      if (!member) continue;
      const counts = operationalCounts(record);
      overlay[member.attendanceId].late += counts.late;
      overlay[member.attendanceId].proxy += counts.proxy;
      overlay[member.attendanceId].absence += counts.absence;
    }
  }
  const official: Record<string, { late: number; proxy: number; absence: number }> = {};
  const missing: string[] = [];
  for (const member of officialMembers) {
    const values: any = baseline.members.get(member.name);
    if (!values) missing.push(member.name);
    official[member.attendanceId] = values || { late: 0, proxy: 0, absence: 0 };
  }
  for (const member of provisionalMembers) {
    official[member.attendanceId] = { late: 0, proxy: 0, absence: 0 };
  }
  const line = await lineAttendanceState(currentSession, context);
  return {
    members: members.map(({ id, attendanceId, name, profession, provisional, joinedOn }: any) => ({
      id,
      attendanceId,
      name,
      profession,
      provisional,
      joinedOn: joinedOn || null,
    })),
    palms: {
      ready: missing.length === 0,
      importId: baseline.importId,
      periodStart: baseline.periodStart,
      periodEnd: baseline.periodEnd,
      importedAt: baseline.importedAt,
      source: baseline.source,
      official,
      missing,
    },
    overlay: {
      from: baseline.periodEnd,
      through: meetingDate,
      sessionCount: overlaySessions.length,
      totals: overlay,
    },
    session: currentSession ? {
      id: currentSession.id,
      meetingDate: currentSession.meeting_date,
      status: currentSession.status,
      primaryRecorder: people.get(currentSession.primary_recorder_id) || "",
      assistantRecorder: people.get(currentSession.assistant_recorder_id) || "",
      recorderConfirmed: currentSession.status === "confirmed",
      vpConfirmed: currentSession.status === "confirmed",
      confirmedAt: currentSession.confirmed_at,
      confirmedBy: people.get(currentSession.confirmed_by) || "",
      announcementSnapshot: currentSession.announcement_snapshot || "",
      rows: currentRecords
        .map((record: any) => apiAttendanceRow(record, officialById, provisionalById))
        .filter((row: any) => memberByAttendanceId.has(row.attendanceId)),
    } : null,
    history: sessions.map((session: any) => ({
      meetingDate: session.meeting_date,
      status: session.status,
      confirmedAt: session.confirmed_at,
    })),
    line,
  };
}

async function saveAttendanceSession(body: any, context: Context, { confirm = false, importing = false } = {}) {
  const meetingDate = String(body.meetingDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
  if (meetingDate > taipeiDay()) throw new Error("例會日期不可在未來");
  const existingRows = await db(`attendance_sessions?meeting_date=eq.${meetingDate}&select=*&limit=1`);
  const existing = existingRows?.[0] || null;
  if (existing?.status === "confirmed") {
    if (importing) return existing;
    throw Object.assign(new Error("此週點名已由副主席確認，歷史紀錄為唯讀"), { status: 409 });
  }
  if (confirm) {
    leadership(context);
    if (!body.recorderConfirmed || !body.vpConfirmed) throw new Error("主要紀錄委員與副主席都必須完成確認");
  }
  const [recorderRows, memberRows, provisionalRows, baseline] = await Promise.all([
    db("committee_terms?status=eq.active&select=person_id,people!inner(display_name)"),
    db("members?status=eq.active&select=id,people!inner(display_name)"),
    db("provisional_members?status=eq.pending_palms&select=id,display_name"),
    latestAttendancePalms(),
  ]);
  const peopleByName = new Map(recorderRows.map((term: any) => [term.people.display_name, term.person_id]));
  const attendanceMembers = [
    ...memberRows.map((member: any) => ({
      attendanceId: `member:${member.id}`,
      memberId: member.id,
      provisionalMemberId: null,
      name: String(member.people.display_name || "").replace(/\s+/g, ""),
    })),
    ...(provisionalRows || []).map((member: any) => ({
      attendanceId: `provisional:${member.id}`,
      memberId: null,
      provisionalMemberId: member.id,
      name: String(member.display_name || "").replace(/\s+/g, ""),
    })),
  ];
  const membersByAttendanceId = new Map(attendanceMembers.map((member: any) => [member.attendanceId, member]));
  const membersByName = new Map<string, any[]>();
  for (const member of attendanceMembers) {
    if (!membersByName.has(member.name)) membersByName.set(member.name, []);
    membersByName.get(member.name)!.push(member);
  }
  const primaryRecorderId = peopleByName.get(body.primaryRecorder)
    || (peopleByName.get(context.name) ? context.personId : null);
  const assistantRecorderId = peopleByName.get(body.assistantRecorder) || null;
  if (!primaryRecorderId) throw new Error("請選擇當期副主席或會員委員作為主要紀錄人");
  if (assistantRecorderId && assistantRecorderId === primaryRecorderId) throw new Error("主要紀錄與協助點名不可為同一人");
  const now = new Date().toISOString();
  const sessionPayload: any = {
    meeting_date: meetingDate,
    status: "draft",
    primary_recorder_id: primaryRecorderId,
    assistant_recorder_id: assistantRecorderId,
    palms_report_import_id: baseline.importId,
    palms_period_start: baseline.periodStart,
    palms_period_end: baseline.periodEnd,
    announcement_snapshot: String(body.announcement || "").slice(0, 30000) || null,
  };
  const sessionRows = await db("attendance_sessions?on_conflict=meeting_date", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(sessionPayload),
  });
  const session = sessionRows[0];
  const officialRecords = new Map<string, any>();
  const provisionalRecords = new Map<string, any>();
  for (const row of (Array.isArray(body.rows) ? body.rows : []).slice(0, 100)) {
    const attendanceId = String(row.attendanceId || "");
    let member = membersByAttendanceId.get(attendanceId);
    if (!member && !attendanceId) {
      const legacyMatches = membersByName.get(String(row.name || "").replace(/\s+/g, "")) || [];
      if (legacyMatches.length === 1) member = legacyMatches[0];
    }
    if (!member) continue;
    const absent = Boolean(row.absent) && !Boolean(row.proxy);
    const proxy = Boolean(row.proxy);
    const payload = {
      session_id: session.id,
      member_id: member.memberId,
      provisional_member_id: member.provisionalMemberId,
      present_0630: absent ? false : Boolean(row.at630),
      present_0700: absent ? false : Boolean(row.at700),
      late: Boolean(row.late),
      left_early: Boolean(row.early),
      proxy,
      absent,
      presentation_completed: proxy ? true : Boolean(row.speech),
      name_badge: Boolean(row.badge),
      pin_badge: Boolean(row.pin),
      suit: Boolean(row.suit),
      camera_on: Boolean(row.camera),
      notes: String(row.note || "").slice(0, 1000) || null,
      updated_by: context.personId,
    };
    if (member.memberId) officialRecords.set(member.memberId, payload);
    else provisionalRecords.set(member.provisionalMemberId, payload);
  }
  if (officialRecords.size) {
    await db("attendance_records?on_conflict=session_id,member_id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([...officialRecords.values()]),
    });
  }
  if (provisionalRecords.size) {
    await db("attendance_records?on_conflict=session_id,provisional_member_id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([...provisionalRecords.values()]),
    });
  }
  if (confirm) {
    const confirmed = await db(`attendance_sessions?id=eq.${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "confirmed",
        confirmed_by: context.personId,
        confirmed_at: now,
        announcement_snapshot: String(body.announcement || "").slice(0, 30000) || null,
      }),
    });
    return confirmed[0];
  }
  return session;
}

async function attendanceApi(request: Request, url: URL, context: Context) {
  if (request.method === "GET") {
    const meetingDate = url.searchParams.get("date") || taipeiDay();
    return attendanceState(meetingDate, context);
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.action === "save-draft") {
    const session = await saveAttendanceSession(body, context);
    return { message: "本週點名草稿已保存至 Supabase", session };
  }
  if (body.action === "confirm") {
    const session = await saveAttendanceSession(body, context, { confirm: true });
    return { message: "本週點名已由副主席確認；後續週次將納入 LINE 公告暫時累計", session };
  }
  if (body.action === "activate-line-test-group") {
    return assignLineTarget(String(body.targetId || ""), "attendance", "test", context);
  }
  if (body.action === "send-line") {
    return sendLineAttendance(String(body.meetingDate || ""), context);
  }
  if (body.action === "reopen") {
    leadership(context);
    const meetingDate = String(body.meetingDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
    const existingRows = await db(`attendance_sessions?meeting_date=eq.${meetingDate}&select=*&limit=1`);
    const existing = existingRows?.[0];
    if (!existing) throw Object.assign(new Error("找不到這一週的點名紀錄"), { status: 404 });
    if (existing.status !== "confirmed") return { message: "本週紀錄已可編輯", session: existing };
    const reopened = await db(`attendance_sessions?id=eq.${existing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "draft",
        confirmed_by: null,
        confirmed_at: null,
      }),
    });
    return { message: "本週紀錄已重新開啟，修正後請再次完成雙重確認", session: reopened[0] };
  }
  if (body.action === "import-history") {
    leadership(context);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((item: any) => item?.recorderConfirmed && item?.vpConfirmed)
      .slice(0, 30);
    let imported = 0;
    for (const item of history) {
      await saveAttendanceSession({
        ...item,
        announcement: item.announcement || "",
        recorderConfirmed: true,
        vpConfirmed: true,
      }, context, { confirm: true, importing: true });
      imported += 1;
    }
    return { message: `已匯入 ${imported} 筆既有已確認週次`, imported };
  }
  throw new Error("不支援的動作");
}

async function monthlyDataStatus() {
  const rows = await reportImports();
  const monthly = monthWindow(-1, 1);
  const half = monthWindow(-1, 6);
  const annual = monthWindow(-1, 12);
  const auditRows = rows.filter((row: any) => {
    const date = auditDate(row);
    return reportCategory(row) === "audit" && date && date >= monthly.start && date <= monthly.end;
  });
  const expectedAudits = expectedAuditWeeks(monthly.start, monthly.end);
  const items = [
    { type: "halfYear", label: "半年 PALMS", period: `${half.start} 至 ${half.end}`, complete: Boolean(latestByCategory(rows, "halfYear", half)), detail: latestByCategory(rows, "halfYear", half) ? "已上傳至 Private Storage" : "供燈號與關懷儀表板使用", accept: ".xls", multiple: false },
    { type: "annual", label: "一年 PALMS", period: `${annual.start} 至 ${annual.end}`, complete: Boolean(latestByCategory(rows, "annual", annual)), detail: latestByCategory(rows, "annual", annual) ? "已上傳至 Private Storage" : "供續約審查與全年數據使用", accept: ".xls", multiple: false },
    { type: "monthly", label: "單月 PALMS", period: `${monthly.start} 至 ${monthly.end}`, complete: Boolean(latestByCategory(rows, "monthly", monthly)), detail: latestByCategory(rows, "monthly", monthly) ? "已上傳並完成月會摘要" : "供月會與上月出席統計使用", accept: ".xls", multiple: false },
    { type: "audit", label: "每週審計資料", period: `${monthly.start} 至 ${monthly.end}`, complete: auditRows.length >= expectedAudits, detail: `已上傳 ${auditRows.length}／預計 ${expectedAudits} 份`, accept: ".xls", multiple: true },
  ];
  return { month: monthly.month, items, completed: items.filter((item) => item.complete).length, total: items.length, generatedAt: new Date().toISOString() };
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function uploadRawFile(bytes: Uint8Array, storagePath: string) {
  await serviceFetch(`/storage/v1/object/raw-reports/${storagePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.ms-excel", "x-upsert": "true" },
    body: bytes,
  });
}

async function insertReportImport(payload: any) {
  const rows = await db("report_imports", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function monthlyDataApi(request: Request, url: URL, context: Context) {
  leadership(context);
  if (request.method === "GET") return monthlyDataStatus();
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!["halfYear", "annual", "monthly", "audit"].includes(body.type) || !files.length) throw new Error("請選擇要上傳的資料");
  if (body.type !== "audit" && files.length !== 1) throw new Error("此類資料每次只能上傳一份");
  if (files.length > 8) throw new Error("每次最多上傳 8 份檔案");
  const monthly = monthWindow(-1, 1);
  const half = monthWindow(-1, 6);
  const annual = monthWindow(-1, 12);
  const provisionalReconciliation = { promoted: [] as string[], blocked: [] as string[] };
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const bytes = decodeBase64(String(file?.dataBase64 || ""));
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("檔案內容為空或超過 8MB");
    const text = new TextDecoder().decode(bytes);
    let period;
    let reportType;
    let parsed = null;
    if (body.type === "audit") {
      const audit = parseAuditWeekText(text, file.name || `第 ${index + 1} 份審計報告`);
      if (!audit.week || audit.week < monthly.start || audit.week > monthly.end) throw new Error(`審計報告 ${audit.week || "日期不明"} 不屬於 ${monthly.month}`);
      period = { start: audit.week, end: audit.week };
      reportType = "audit";
    } else {
      parsed = parsePalmsText(text, file.name || "PALMS");
      const expected = body.type === "halfYear" ? half : body.type === "annual" ? annual : monthly;
      if (parsed.period.start !== expected.start || parsed.period.end !== expected.end) {
        throw new Error(`報表期間是 ${parsed.period.start} 至 ${parsed.period.end}，本次需要 ${expected.start} 至 ${expected.end}`);
      }
      period = parsed.period;
      reportType = body.type === "monthly" ? "monthly_palms" : "half_year_palms";
    }
    const contentHash = await sha256(bytes);
    const storagePath = rawReportObjectPath({
      month: monthly.month,
      type: body.type,
      index,
      createdAt: Date.now(),
      sha256: contentHash,
    });
    await uploadRawFile(bytes, storagePath);
    const imported = await insertReportImport({
      report_type: reportType,
      period_start: period.start,
      period_end: period.end,
      storage_path: storagePath,
      sha256: contentHash,
      imported_by: context.personId,
      metadata: { category: body.type, originalFilename: file.name || "", uploadedBy: context.identity },
    });
    if (body.type === "monthly") await saveMonthlyAttendance(parsed, imported.id, storagePath);
    if (body.type === "halfYear") {
      const reconciled = await reconcileProvisionalMembersWithPalms(parsed, imported.id, context);
      provisionalReconciliation.promoted.push(...reconciled.promoted);
      provisionalReconciliation.blocked.push(...reconciled.blocked);
    }
  }
  const promotedMessage = provisionalReconciliation.promoted.length
    ? `；${provisionalReconciliation.promoted.join("、")} 已由 PALMS 唯一對帳並升格正式會員`
    : "";
  const blockedMessage = provisionalReconciliation.blocked.length
    ? `；${provisionalReconciliation.blocked.join("、")} 暫不升格，請人工確認來源識別碼`
    : "";
  return {
    message: `資料已驗證並安全上傳至 Supabase Private Storage${promotedMessage}${blockedMessage}`,
    provisionalReconciliation,
    status: await monthlyDataStatus(),
  };
}

function meetingToApi(row: any, names: Map<string, string>) {
  return {
    id: `meeting-${row.meeting_month.slice(0, 7)}`,
    meetingMonth: row.meeting_month.slice(0, 7),
    meetingDate: row.meeting_date,
    reportMonth: row.report_month.slice(0, 7),
    recorder: names.get(row.recorder_id) || "",
    attendees: (row.attendee_ids || []).map((id: string) => names.get(id)).filter(Boolean),
    status: row.status,
    attendance: row.attendance_summary || {},
    growth: row.growth_summary || {},
    care: row.care_summary || {},
    memberAssistance: row.member_assistance || "",
    motions: row.motions || "",
    conclusion: row.conclusion || "",
    followUps: row.follow_ups || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.care_summary?._updatedBy || "",
  };
}

function monthlyCareTaskReference(record: any, item: any) {
  if (String(item.taskId || "").trim()) return String(item.taskId).trim().slice(0, 160);
  const careId = String(item.id || `${item.taskType}-${item.member}`)
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "care";
  return `monthly-${String(record.id || "meeting").slice(0, 70)}-${careId}`.slice(0, 160);
}

function monthlyCareTaskInput(record: any, item: any, id: string, context: Context) {
  const scheduledAt = String(item.dueDate).includes("T") ? item.dueDate : `${item.dueDate}T19:00`;
  return {
    id,
    type: item.taskType,
    member: item.member,
    profession: "",
    scheduledAt,
    lead: item.owner,
    companions: item.companion ? [item.companion] : [],
    priority: item.taskType === "midterm" ? "normal" : "high",
    stage: item.taskType === "renewal"
      ? "續約訪談已排定"
      : item.taskType === "midterm"
        ? "期中關懷已排定"
        : "會員關懷已排定",
    notes: item.note || item.action || "",
    completed: false,
    createdAt: new Date().toISOString(),
    createdBy: context.name,
    source: "monthly-meeting",
    sourceMeetingId: record.id,
    sourceCareId: item.id,
  };
}

async function ensureMonthlyCareTasks(record: any, context: Context, directory?: any) {
  const care = record?.care || {};
  const items = Array.isArray(care.items) ? care.items.map((item: any) => ({ ...item })) : [];
  const actionable = items.filter((item: any) =>
    item.assignmentRequired !== false
    && ["pending", "scheduled", "active"].includes(String(item.state || "pending"))
    && ["renewal", "midterm", "special"].includes(String(item.taskType || ""))
    && String(item.member || "").trim()
    && String(item.owner || "").trim()
    && String(item.dueDate || "").trim()
  );
  if (!actionable.length) return { record: { ...record, care: { ...care, items } }, created: 0, linked: 0 };

  const rows = await db(`tasks?source=eq.${TASK_SOURCE}&select=id,source_reference,category,title,status,result_summary`);
  const byReference = new Map((rows || []).map((row: any) => [row.source_reference, row]));
  const directoryState = directory || await taskDirectory();
  let created = 0;
  let linked = 0;

  for (const item of actionable) {
    let preferredReference = monthlyCareTaskReference(record, item);
    let existing = byReference.get(preferredReference);
    if (existing && (existing.category !== item.taskType || existing.title !== item.member)) {
      item.taskId = "";
      item.taskCreatedByMeeting = false;
      preferredReference = monthlyCareTaskReference(record, item);
      existing = byReference.get(preferredReference);
    }
    if (!existing) {
      existing = (rows || []).find((row: any) => {
        const meta: any = parseTaskJson(row.result_summary);
        return (meta.sourceMeetingId === record.id && meta.sourceCareId === item.id)
          || (row.status !== "completed" && row.category === item.taskType && row.title === item.member);
      });
    }
    if (existing && (existing.category !== item.taskType || existing.title !== item.member)) {
      existing = undefined;
    }
    if (existing) {
      if (item.taskId !== existing.source_reference) linked += 1;
      item.taskId = existing.source_reference;
      item.taskCreatedByMeeting = parseTaskJson(existing.result_summary).localSource === "monthly-meeting";
      if (existing.status === "completed") item.state = "done";
      continue;
    }

    await saveLeadershipTask(monthlyCareTaskInput(record, item, preferredReference, context), context, directoryState);
    item.taskId = preferredReference;
    item.taskCreatedByMeeting = true;
    if (item.state === "pending") item.state = "scheduled";
    const inserted = {
      source_reference: preferredReference,
      category: item.taskType,
      title: item.member,
      status: "pending",
      result_summary: JSON.stringify({
        localSource: "monthly-meeting",
        sourceMeetingId: record.id,
        sourceCareId: item.id,
      }),
    };
    rows.push(inserted);
    byReference.set(preferredReference, inserted);
    created += 1;
  }
  return { record: { ...record, care: { ...care, items } }, created, linked };
}

async function committeeMeetingsApi(request: Request, context: Context) {
  const settingsRows = await db("app_settings?key=eq.monthly_meeting&select=value&limit=1");
  const settings = settingsRows?.[0]?.value || { chapterSizeTarget: 51 };
  const peopleRows = await db("people?select=id,display_name");
  const names = new Map((peopleRows || []).map((person: any) => [person.id, person.display_name]));
  const ids = new Map((peopleRows || []).map((person: any) => [person.display_name, person.id]));
  if (request.method === "GET") {
    const filter = context.role === "committee" ? "&status=eq.final" : "";
    const rows = await db(`committee_meetings?select=*&order=meeting_date.desc${filter}`);
    return { settings, records: rows.map((row: any) => meetingToApi(row, names)), access: context.role === "committee" ? "history" : "manage" };
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  leadership(context);
  const body = await requestBody(request);
  if (body.action === "reconcile-care-tasks") {
    const rows = await db("committee_meetings?status=eq.draft&select=*&order=meeting_date.desc");
    const directory = await taskDirectory();
    let created = 0;
    let linked = 0;
    for (const row of rows || []) {
      const current = meetingToApi(row, names);
      const result = await ensureMonthlyCareTasks(current, context, directory);
      created += result.created;
      linked += result.linked;
      if (!result.created && !result.linked) continue;
      await db(`committee_meetings?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          care_summary: { ...(result.record.care || {}), _updatedBy: context.identity },
        }),
      });
    }
    return { repaired: created, relinked: linked };
  }
  if (body.action === "settings") {
    const target = Math.round(Number(body.chapterSizeTarget));
    if (!Number.isFinite(target) || target < 1 || target > 500) throw new Error("分會目標人數不正確");
    const value = { chapterSizeTarget: target, updatedAt: new Date().toISOString(), updatedBy: context.identity };
    await db("app_settings?on_conflict=key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: "monthly_meeting", value, updated_by: context.personId }),
    });
    return { settings: value };
  }
  let record = body.record;
  if (!record || !/^meeting-\d{4}-\d{2}$/.test(String(record.id || ""))) throw new Error("會議紀錄編號不正確");
  const items = Array.isArray(record.care?.items) ? record.care.items : [];
  if (items.some((item: any) => item.assignmentRequired !== false && item.owner && item.owner === item.companion)) throw new Error("負責委員與陪訪委員不能是同一人");
  if (record.status === "final" && items.some((item: any) => item.assignmentRequired !== false && (!String(item.owner || "").trim() || !String(item.dueDate || "").trim()))) {
    throw new Error("續約及輔導項目都必須完成追蹤委員與排定日期後才能結案");
  }
  record = (await ensureMonthlyCareTasks(record, context)).record;
  const recorderId = ids.get(record.recorder) || context.personId;
  const attendeeIds = (record.attendees || []).map((name: string) => ids.get(name)).filter(Boolean);
  const now = new Date().toISOString();
  const payload: any = {
    meeting_month: `${record.meetingMonth}-01`,
    meeting_date: record.meetingDate,
    report_month: `${record.reportMonth}-01`,
    recorder_id: recorderId,
    attendee_ids: attendeeIds,
    status: record.status === "final" ? "final" : "draft",
    attendance_summary: record.attendance || {},
    growth_summary: record.growth || {},
    care_summary: { ...(record.care || {}), _updatedBy: context.identity },
    member_assistance: record.memberAssistance || "",
    motions: record.motions || "",
    conclusion: record.conclusion || "",
    follow_ups: record.followUps || "",
  };
  if (payload.status === "final") {
    payload.finalized_by = context.personId;
    payload.finalized_at = now;
  }
  const rows = await db("committee_meetings?on_conflict=meeting_month", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return { record: meetingToApi(rows[0], names) };
}

function normalizedIdentityPart(value: unknown) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-TW");
}

async function newMemberRegistrationState() {
  const [taskRows, stateRows, registrationRows, officialRows, peopleRows] = await Promise.all([
    db(`tasks?source=eq.${TASK_SOURCE}&category=eq.new&status=eq.completed&select=id,source_reference,title,result_summary,completed_at&order=completed_at.desc`),
    db("task_case_states?select=task_id,workflow"),
    db("provisional_members?select=*&order=registered_at.desc"),
    db("members?status=eq.active&select=id,profession,people!inner(display_name)"),
    db("people?select=id,display_name"),
  ]);
  const states = new Map((stateRows || []).map((row: any) => [row.task_id, row.workflow || {}]));
  const registeredTasks = new Set((registrationRows || [])
    .filter((row: any) => row.status !== "cancelled")
    .map((row: any) => row.source_task_id));
  const people = new Map((peopleRows || []).map((row: any) => [row.id, row.display_name]));
  const eligibleCases = (taskRows || [])
    .filter((row: any) => Boolean(states.get(row.id)?.closed) && !registeredTasks.has(row.id))
    .map((row: any) => {
      const meta = parseTaskJson(row.result_summary);
      return {
        taskId: row.source_reference,
        name: String(row.title || "").replace(/\s+/g, ""),
        profession: String(meta.profession || "").trim(),
        completedAt: row.completed_at,
      };
    });
  const registrations = (registrationRows || []).map((row: any) => ({
    id: row.id,
    taskId: row.source_task_id,
    name: row.display_name,
    profession: row.profession,
    joinedOn: row.joined_on,
    status: row.status,
    registeredBy: people.get(row.registered_by) || "",
    registeredAt: row.registered_at,
    promotedAt: row.promoted_at,
    cancelledAt: row.cancelled_at,
  }));
  const pendingCount = registrations.filter((row: any) => row.status === "pending_palms").length;
  return {
    eligibleCases,
    registrations,
    officialCount: (officialRows || []).length,
    operationalCount: (officialRows || []).length + pendingCount,
    pendingCount,
  };
}

async function newMemberRegistrationApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") return newMemberRegistrationState();
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.action === "register") {
    const taskReference = String(body.taskId || "").trim();
    const profession = String(body.profession || "").trim().replace(/\s+/g, " ").slice(0, 200);
    const joinedOn = String(body.joinedOn || "");
    if (!taskReference) throw new Error("請選擇已完成的新會員案件");
    if (!profession) throw new Error("專業別必須填寫，供同名會員辨識與後續主檔使用");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedOn) || joinedOn > taipeiDay()) throw new Error("入會確認日不正確或在未來");
    const taskRows = await db(`tasks?source=eq.${TASK_SOURCE}&source_reference=eq.${encodeURIComponent(taskReference)}&category=eq.new&status=eq.completed&select=id,title,result_summary&limit=1`);
    const task = taskRows?.[0];
    if (!task) throw new Error("此新會員案件尚未完成正式確認，不能登錄");
    const stateRows = await db(`task_case_states?task_id=eq.${task.id}&select=workflow&limit=1`);
    if (!stateRows?.[0]?.workflow?.closed) throw new Error("此新會員案件尚未正式結案，不能登錄");
    const name = String(task.title || "").normalize("NFKC").replace(/\s+/g, "").slice(0, 100);
    if (!name || normalizedIdentityPart(body.confirmName) !== normalizedIdentityPart(name)) {
      throw new Error("確認姓名不一致：請重新輸入完整姓名");
    }
    const [registrations, officialMembers] = await Promise.all([
      db("provisional_members?status=eq.pending_palms&select=display_name,profession,source_task_id"),
      db("members?status=eq.active&select=profession,people!inner(display_name)"),
    ]);
    const duplicatePending = (registrations || []).some((row: any) =>
      normalizedIdentityPart(row.display_name) === normalizedIdentityPart(name)
      && normalizedIdentityPart(row.profession) === normalizedIdentityPart(profession)
    );
    const duplicateOfficial = (officialMembers || []).some((row: any) =>
      normalizedIdentityPart(row.people?.display_name) === normalizedIdentityPart(name)
      && normalizedIdentityPart(row.profession) === normalizedIdentityPart(profession)
    );
    if (duplicatePending || duplicateOfficial) throw new Error("相同姓名與專業別已存在，不可重複登錄");
    const existingTask = (registrations || []).some((row: any) => row.source_task_id === task.id);
    if (existingTask) throw new Error("此新會員案件已完成登錄");
    await db("provisional_members", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        source_task_id: task.id,
        display_name: name,
        profession,
        joined_on: joinedOn,
        registered_by: context.personId,
      }),
    });
    return {
      message: `${name} 已加入點名名單；正式分析仍等待下一份 PALMS 唯一對帳`,
      state: await newMemberRegistrationState(),
    };
  }
  if (body.action === "cancel") {
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("新會員登錄編號不正確");
    const rows = await db(`provisional_members?id=eq.${encodeURIComponent(id)}&status=eq.pending_palms&select=id,display_name&limit=1`);
    const registration = rows?.[0];
    if (!registration) throw new Error("此登錄已更新或已由 PALMS 升格，請重新整理");
    if (normalizedIdentityPart(body.confirmName) !== normalizedIdentityPart(registration.display_name)) {
      throw new Error("確認姓名不一致：未取消登錄");
    }
    await db(`provisional_members?id=eq.${registration.id}&status=eq.pending_palms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "cancelled",
        cancelled_by: context.personId,
        cancelled_at: new Date().toISOString(),
        cancellation_note: String(body.note || "副主席撤銷誤登錄").trim().slice(0, 500),
      }),
    });
    return {
      message: `${registration.display_name} 已移出後續點名名單；既有已確認週次仍保留`,
      state: await newMemberRegistrationState(),
    };
  }
  throw new Error("不支援的動作");
}

async function reconcileProvisionalMembersWithPalms(parsed: any, importId: string, context: Context) {
  const [pendingRows, officialRows] = await Promise.all([
    db("provisional_members?status=eq.pending_palms&select=id,display_name,profession"),
    db("members?status=eq.active&select=people!inner(display_name)"),
  ]);
  const reportCounts = new Map<string, number>();
  for (const member of parsed?.members || []) {
    const key = normalizedIdentityPart(member.name);
    reportCounts.set(key, (reportCounts.get(key) || 0) + 1);
  }
  const pendingCounts = new Map<string, number>();
  for (const member of pendingRows || []) {
    const key = normalizedIdentityPart(member.display_name);
    pendingCounts.set(key, (pendingCounts.get(key) || 0) + 1);
  }
  const officialNames = new Set((officialRows || []).map((row: any) => normalizedIdentityPart(row.people?.display_name)));
  const promoted: string[] = [];
  const blocked: string[] = [];
  for (const member of pendingRows || []) {
    const key = normalizedIdentityPart(member.display_name);
    if (!reportCounts.has(key)) continue;
    if (reportCounts.get(key) !== 1 || pendingCounts.get(key) !== 1 || officialNames.has(key)) {
      blocked.push(`${member.display_name}（同名資料無法由 PALMS 唯一辨識）`);
      continue;
    }
    try {
      await db("rpc/edge_promote_provisional_member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_provisional_member_id: member.id,
          p_report_import_id: importId,
          p_actor: context.personId,
        }),
      });
      promoted.push(member.display_name);
    } catch (error) {
      console.error("provisional PALMS promotion", member.id, error);
      blocked.push(`${member.display_name}（自動升格未完成，原登錄與點名紀錄保持不變）`);
    }
  }
  return { promoted, blocked };
}

async function memberDepartureState() {
  const current = await db("members?status=eq.active&select=profession,people!inner(display_name)&order=created_at.asc");
  const departed = await db("members?status=eq.departed&select=departed_on,profession,people!inner(display_name,notes)&order=departed_on.desc");
  return {
    currentMembers: current.map((row: any) => ({ name: row.people.display_name, profession: row.profession || "" })),
    departed: departed.map((row: any) => ({ name: row.people.display_name, confirmedAt: row.departed_on, note: row.people.notes || "" })),
  };
}

async function verifiedHistoricalDepartureCandidate(name: string) {
  const imports = await reportImports();
  const expectedHalf = monthWindow(-1, 6);
  const halfRow = latestByCategory(imports, "halfYear", expectedHalf);
  const expiryRow = latestByCategory(imports, "membership");
  if (!halfRow || !expiryRow) throw new Error("缺少本期半年 PALMS 或會員到期日報告，無法確認這筆名單差異");
  const [palms, expiry] = await Promise.all([
    downloadReport(halfRow).then((text) => parsePalmsText(text, halfRow.storage_path)),
    downloadReport(expiryRow).then((text) => parseExpiryText(text, expiryRow.storage_path)),
  ]);
  if (palms.members.some((member: any) => member.name === name)) throw new Error(`${name} 仍存在於本期 PALMS，不可由名單差異流程登記離會`);
  const candidate = expiry.members.find((member: any) => member.name === name);
  if (!candidate) throw new Error(`${name} 已不在目前的到期報告差異中，請重新產出分析`);
  return candidate;
}

async function memberDepartureApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") return memberDepartureState();
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  const name = String(body.name || "").replace(/\s+/g, "");
  if (!name || String(body.confirmName || "").replace(/\s+/g, "") !== name) throw new Error("確認姓名不一致：請重新輸入完整姓名");
  const people = await db(`people?display_name=eq.${encodeURIComponent(name)}&select=id,status,notes&limit=1`);
  let person = people?.[0];
  const members = person ? await db(`members?person_id=eq.${person.id}&select=id,status,departed_on&limit=1`) : [];
  let member = members?.[0];
  if (body.action === "register") {
    const confirmedAt = String(body.confirmedAt || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedAt) || confirmedAt > taipeiDay()) throw new Error("離會確認日不正確或在未來");
    const note = String(body.note || "").trim().slice(0, 120);
    if (!member && body.source === "analysis-reconciliation") {
      const candidate = await verifiedHistoricalDepartureCandidate(name);
      const peopleRows = await db("people?on_conflict=display_name", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ display_name: name, status: "departed", notes: note }),
      });
      person = peopleRows?.[0];
      if (!person?.id) throw new Error(`${name} 的歷史離會人員資料建立失敗`);
      const memberRows = await db("members?on_conflict=person_id", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          person_id: person.id,
          profession: candidate.occupation || "",
          membership_started_on: candidate.startDate || null,
          membership_expires_on: candidate.expiryDate || null,
          status: "departed",
          departed_on: confirmedAt,
        }),
      });
      member = memberRows?.[0];
      if (!member?.id) throw new Error(`${name} 的歷史離會會員資料建立失敗`);
      return { message: `${name} 已建立歷史離會紀錄；下次產出分析會自動排除`, historical: true, state: await memberDepartureState() };
    }
    if (!person) throw new Error(`${name} 不在會員主檔中`);
    if (!member) throw new Error(`${name} 沒有會員主檔`);
    if (member.status === "departed") return { message: `${name} 已在離會名單中；下次產出分析會自動排除`, state: await memberDepartureState() };
    await db(`members?id=eq.${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "departed", departed_on: confirmedAt }) });
    await db(`people?id=eq.${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "departed", notes: note }) });
    return { message: `${name} 已登記離會；下次產出分析會自動排除`, state: await memberDepartureState() };
  }
  if (body.action === "undo") {
    if (!person) throw new Error(`${name} 不在會員主檔中`);
    if (!member) throw new Error(`${name} 沒有會員主檔`);
    if (member.status !== "departed") throw new Error(`${name} 目前不是離會狀態`);
    await db(`members?id=eq.${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "active", departed_on: null }) });
    await db(`people?id=eq.${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "active" }) });
    return { message: `${name} 的離會登記已撤銷，會員主檔已還原`, state: await memberDepartureState() };
  }
  throw new Error("不支援的動作");
}

async function encryptionKey() {
  const secret = Deno.env.get("FULIAN_AI_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("AI 金鑰加密服務尚未完成設定");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return decodeBase64(value);
}

async function encryptSecret(clear: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(clear));
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}

async function decryptSecret(envelopeText: string) {
  const envelope = JSON.parse(envelopeText);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, await encryptionKey(), base64ToBytes(envelope.data));
  return new TextDecoder().decode(clear);
}

async function aiStatus(personId: string) {
  const [profiles, credentials] = await Promise.all([
    db(`ai_profiles?person_id=eq.${personId}&select=default_provider&limit=1`),
    db(`ai_credentials?person_id=eq.${personId}&select=provider,key_suffix,updated_at`),
  ]);
  const byProvider = new Map((credentials || []).map((row: any) => [row.provider, row]));
  return {
    defaultProvider: profiles?.[0]?.default_provider || "openai",
    providers: Object.fromEntries(PROVIDERS.map((provider) => {
      const row: any = byProvider.get(provider);
      return [provider, { configured: Boolean(row), suffix: row?.key_suffix || "", updatedAt: row?.updated_at || "" }];
    })),
    storage: "Supabase 伺服器端 AES-GCM 加密保存・不寫入 GitHub",
  };
}

async function aiSettingsApi(request: Request, context: Context) {
  if (request.method === "GET") return aiStatus(context.personId);
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (!PROVIDERS.includes(body.defaultProvider)) throw new Error("預設 AI 平台不正確");
  for (const provider of PROVIDERS) {
    const value = String(body.keys?.[provider] || "").trim();
    if (!value) continue;
    if (value.length < 12 || value.length > 500) throw new Error(`${provider} API Key 格式或長度不正確`);
    await db("ai_credentials?on_conflict=person_id,provider", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ person_id: context.personId, provider, encrypted_payload: await encryptSecret(value), key_suffix: value.slice(-4), encryption_version: "aes-gcm-v1" }),
    });
  }
  for (const provider of Array.isArray(body.remove) ? body.remove : []) {
    if (PROVIDERS.includes(provider)) await db(`ai_credentials?person_id=eq.${context.personId}&provider=eq.${provider}`, { method: "DELETE" });
  }
  await db("ai_profiles?on_conflict=person_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ person_id: context.personId, default_provider: body.defaultProvider }),
  });
  return aiStatus(context.personId);
}

async function credential(personId: string, provider: Provider) {
  const rows = await db(`ai_credentials?person_id=eq.${personId}&provider=eq.${provider}&select=encrypted_payload&limit=1`);
  if (!rows?.[0]) throw new Error("此身分尚未綁定所選平台的 API Key，請先到設定完成綁定");
  return decryptSecret(rows[0].encrypted_payload);
}

function extractOpenAiText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  return (data?.output || []).flatMap((item: any) => item?.content || []).filter((item: any) => item?.type === "output_text").map((item: any) => item.text).join("\n").trim();
}

function assertCompleteAiResponse(provider: Provider, payload: any) {
  const reason = provider === "openai"
    ? (payload?.status === "incomplete" ? payload?.incomplete_details?.reason || "incomplete" : "")
    : provider === "gemini"
      ? payload?.candidates?.[0]?.finishReason || ""
      : payload?.stop_reason || "";
  const complete = provider === "openai"
    ? !reason
    : provider === "gemini"
      ? !reason || reason === "STOP"
      : !reason || reason === "end_turn" || reason === "stop_sequence";
  if (complete) return;
  if (["max_output_tokens", "MAX_TOKENS", "max_tokens", "model_context_window_exceeded"].includes(reason)) {
    throw Object.assign(new Error("AI 平台回應達到長度上限，系統已阻止顯示不完整答案；請重新提問"), { status: 502 });
  }
  throw Object.assign(new Error(`AI 平台未完整產生回答（${String(reason).slice(0, 60)}）`), { status: 502 });
}

function temporaryGeminiFailure(response: Response, payload: any) {
  const message = String(payload?.error?.message || payload?.error?.status || "");
  return response.status === 429
    || response.status === 503
    || /high demand|try again later|temporar|resource_exhausted|unavailable/i.test(message);
}

function retryDelay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function geminiAttemptTimeout(model: string, elapsedMs: number) {
  const remainingMs = GEMINI_EDGE_TOTAL_BUDGET_MS - elapsedMs;
  if (remainingMs < GEMINI_MIN_ATTEMPT_MS) return 0;
  const modelLimit = model.endsWith("-pro")
    ? GEMINI_PRO_ATTEMPT_TIMEOUT_MS
    : GEMINI_FLASH_ATTEMPT_TIMEOUT_MS;
  return Math.min(modelLimit, remainingMs);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function abortedRequest(error: unknown) {
  return (error as any)?.name === "AbortError";
}

function reviewModel(provider: Provider, requested: unknown) {
  if (provider !== "gemini") return MODELS[provider];
  const model = String(requested || DEFAULT_GEMINI_REVIEW_MODEL);
  if (!GEMINI_REVIEW_MODELS.has(model)) throw new Error("不支援的 Gemini 模型，請重新選擇");
  return model;
}

async function callProvider(provider: Provider, apiKey: string, system: string, prompt: string, maxTokens = 1000, selectedModel = MODELS[provider]) {
  let response;
  let payload: any;
  if (provider === "openai") {
    response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.openai, instructions: system, input: prompt, max_output_tokens: maxTokens }) });
    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      assertCompleteAiResponse(provider, payload);
      return { text: extractOpenAiText(payload), model: MODELS.openai };
    }
  } else if (provider === "gemini") {
    const startedAt = Date.now();
    let attemptCount = 0;
    let lastAttemptTimedOut = false;
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt += 1) {
      const timeoutMs = geminiAttemptTimeout(selectedModel, Date.now() - startedAt);
      if (!timeoutMs) break;
      attemptCount += 1;
      lastAttemptTimedOut = false;
      try {
        response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`, { method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }) }, timeoutMs);
        payload = await response.json().catch(() => ({}));
      } catch (error) {
        if (!abortedRequest(error)) throw error;
        lastAttemptTimedOut = true;
        payload = { error: { status: "DEADLINE_EXCEEDED", message: "Gemini request timed out" } };
      }
      if (!lastAttemptTimedOut && response?.ok) {
        assertCompleteAiResponse(provider, payload);
        return { text: (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || "").join("\n").trim(), model: selectedModel };
      }
      if (!lastAttemptTimedOut && (!response || !temporaryGeminiFailure(response, payload))) break;
      if (lastAttemptTimedOut && selectedModel.endsWith("-pro")) break;
      if (attempt < GEMINI_MAX_ATTEMPTS - 1) {
        const delayMs = 1500 * (attempt + 1);
        const remainingAfterDelay = GEMINI_EDGE_TOTAL_BUDGET_MS - (Date.now() - startedAt) - delayMs;
        if (remainingAfterDelay < GEMINI_MIN_ATTEMPT_MS) break;
        await retryDelay(delayMs);
      }
    }
    if (lastAttemptTimedOut) {
      const modelHint = selectedModel.endsWith("-pro") ? "請改選 Flash 模型，或稍後再試" : "請改選另一個 Gemini 模型，或稍後再試";
      throw Object.assign(new Error(`Google Gemini（${selectedModel}）回應逾時；系統已在 Supabase 強制終止前主動取消。${modelHint}`), { status: 504 });
    }
    if (response && temporaryGeminiFailure(response, payload)) {
      throw Object.assign(new Error(`Google Gemini（${selectedModel}）目前流量過高，系統已嘗試 ${attemptCount} 次仍未成功。請改選另一個 Gemini 模型或稍後再試`), { status: 503 });
    }
  } else {
    response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.anthropic, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }) });
    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      assertCompleteAiResponse(provider, payload);
      return { text: (payload?.content || []).filter((item: any) => item?.type === "text").map((item: any) => item.text).join("\n").trim(), model: MODELS.anthropic };
    }
  }
  throw new Error(`AI 平台回應失敗：${String(payload?.error?.message || payload?.error?.status || `HTTP ${response?.status || "unknown"}`).slice(0, 180)}`);
}

function compactAiSource(source: any, queryContext: string) {
  const members = Array.isArray(source?.members) ? source.members : [];
  const matched = members.filter((member: any) => {
    const name = String(member?.name || "").replace(/\s+/g, "");
    return name && queryContext.replace(/\s+/g, "").includes(name);
  });
  if (!matched.length) return JSON.stringify(source).slice(0, 80000);
  return JSON.stringify({
    report: source.report || null,
    memberData: source.memberData || null,
    publishedVersion: source.publishedVersion || null,
    members: matched,
  });
}

async function latestPublished() {
  const rows = await db("analysis_snapshots?is_published=eq.true&select=*&order=period_end.desc,generated_at.desc&limit=1");
  return rows?.[0] || null;
}

async function aiChatApi(request: Request, context: Context) {
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  const provider = body.provider as Provider;
  if (!PROVIDERS.includes(provider)) throw new Error("AI 平台不正確");
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) throw new Error("請輸入問題");
  const published = await latestPublished();
  const source = published?.snapshot || {};
  const history = Array.isArray(body.history) ? body.history.slice(-6).map((item: any) => `${item.role === "assistant" ? "助手" : "使用者"}：${String(item.text || "").slice(0, 500)}`).join("\n") : "";
  const prompt = `${history ? `最近對話：\n${history}\n\n` : ""}本次問題：\n${question}\n\n[來源1] Supabase 已發佈會員分析快照\n${compactAiSource(source, `${history}\n${question}`)}`;
  const system = "你是富聯分會會員委員會系統內的查詢助手。只能依據提供的系統資料回答；資料不足時明確說請向中心區確認。不得代替投票、核准或處置會員。使用繁體中文，先直接回答結論，最多六個簡短條列並標示 [來源1]。資料期間之後的未來數值不得推測；例如新月份 PALMS 尚未上傳時，必須說明要等新報表才能確定。";
  const result = await callProvider(provider, await credential(context.personId, provider), system, prompt, 1800);
  if (!result.text) throw new Error("AI 平台未回傳可顯示的文字");
  return { answer: result.text, model: result.model, sources: [{ title: "最新已發佈會員分析快照", path: "Supabase/analysis_snapshots" }] };
}

async function loadEngineSources() {
  const imports = await reportImports();
  const expectedMonth = monthWindow(-1, 1);
  const expectedHalf = monthWindow(-1, 6);
  const expectedAnnual = monthWindow(-1, 12);
  const half = latestByCategory(imports, "halfYear", expectedHalf);
  const expiry = latestByCategory(imports, "membership");
  const tenure = latestByCategory(imports, "tenure");
  const annualRow = latestByCategory(imports, "annual", expectedAnnual);
  const missing = [];
  if (!half) missing.push(`半年 PALMS（${expectedHalf.start} 至 ${expectedHalf.end}）`);
  if (!annualRow) missing.push(`一年 PALMS（${expectedAnnual.start} 至 ${expectedAnnual.end}）`);
  if (!expiry) missing.push("會員到期日報告");
  if (!tenure) missing.push("會齡報告");
  if (missing.length) throw new Error(`正式分析資料尚未完整：請先上傳${missing.join("、")}`);
  const [halfText, expiryText, tenureText] = await Promise.all([downloadReport(half), downloadReport(expiry), downloadReport(tenure)]);
  const annual = parsePalmsText(await downloadReport(annualRow), annualRow.storage_path);
  const allAuditRows = imports.filter((row: any) => reportCategory(row) === "audit" && auditDate(row));
  const auditRows = allAuditRows.filter((row: any) => {
    const date = auditDate(row);
    return date >= expectedMonth.start && date <= expectedMonth.end;
  }).slice(0, 8);
  const expectedAudits = expectedAuditWeeks(expectedMonth.start, expectedMonth.end);
  if (auditRows.length < expectedAudits) throw new Error(`正式分析資料尚未完整：${expectedMonth.month} 每週審計報告預計 ${expectedAudits} 份，目前 ${auditRows.length} 份`);
  const audits = [];
  for (const row of auditRows) audits.push(parseAuditWeekText(await downloadReport(row), row.storage_path));
  const departedRows = await db("members?status=eq.departed&select=departed_on,people!inner(display_name)");
  const departed = departedRows.map((row: any) => ({ name: String(row.people.display_name).replace(/\s+/g, ""), confirmedAt: row.departed_on }));
  const [renewalRows, activeMemberRows, completedMidtermRows] = await Promise.all([
    db("membership_renewal_completions?revoked_at=is.null&select=id,member_id,prior_expiry_on,completed_on,source,confirmed_at&order=confirmed_at.desc"),
    db("members?status=eq.active&select=id,people!inner(display_name)"),
    db("tasks?source=eq.vice-chair-work-plan&category=eq.midterm&status=eq.completed&completed_at=not.is.null&select=id,member_id,title,completed_at,source_reference&order=completed_at.desc"),
  ]);
  const renewalNames = new Map((activeMemberRows || []).map((row: any) => [row.id, String(row.people.display_name).replace(/\s+/g, "")]));
  const renewalCompletions = (renewalRows || []).map((row: any) => ({
    id: row.id,
    name: renewalNames.get(row.member_id) || "",
    priorExpiryOn: row.prior_expiry_on,
    completedOn: row.completed_on,
    source: row.source,
    confirmedAt: row.confirmed_at,
  })).filter((row: any) => row.name);
  const midtermCompletions = (completedMidtermRows || []).map((row: any) => ({
    name: renewalNames.get(row.member_id) || String(row.title || "").replace(/\s+/g, ""),
    completedAt: row.completed_at,
    sourceReference: row.source_reference,
  })).filter((row: any) => row.name && row.completedAt);
  const sources = [half, expiry, tenure, ...(annualRow ? [annualRow] : []), ...auditRows].map((row: any) => ({ path: `Private Storage/${row.storage_path}`, sha256: row.sha256?.slice(0, 12) || null, modifiedAt: row.imported_at }));
  return {
    engine: buildAnalysisFromParsed({
      palms: parsePalmsText(halfText, half.storage_path),
      expiry: parseExpiryText(expiryText, expiry.storage_path),
      tenure: parseTenureText(tenureText, tenure.storage_path),
      departed,
      annual,
      auditMonth: combineAuditWeeks(audits),
      auditMonthName: expectedMonth.month,
      renewalCompletions,
      midtermCompletions,
      sources,
    }),
  };
}

const REVIEW_SYSTEM = "你是 BNI 富聯分會會員委員會的月度分析審視員。引擎數據是唯一數據來源：不得重算分數、修改燈號或發明數據。審計觀察必須用關懷語言，不得指控。不得作資格處置、續約核准或投票建議。輸出繁體中文 Markdown 六區關懷報告，結尾標注本報告為草稿，需副主席確認後才正式發佈。";

async function currentDraft() {
  const rows = await db("analysis_snapshots?is_published=eq.false&analysis_version=like.draft-%25&select=*&order=generated_at.desc&limit=1");
  return rows?.[0] || null;
}

function assertAnalysisReconciled(engine: any) {
  const issues = Array.isArray(engine?.reconciliation?.issues) ? engine.reconciliation.issues : [];
  const blocking = issues.filter((issue: any) => issue?.level === "blocking");
  if (engine?.aborted || blocking.length) {
    throw Object.assign(new Error("對帳未通過，未產生草稿（先對帳，後分析）"), { status: 409, issues });
  }
}

async function analysisDraftApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") {
    const row = await currentDraft();
    return { draft: row?.snapshot?.draft || null };
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.action === "generate") {
    const { engine } = await loadEngineSources();
    assertAnalysisReconciled(engine);
    const previous = await currentDraft();
    const draft = { id: `draft-${Date.now()}`, status: "draft", engine, aiReview: null, feedback: previous?.snapshot?.draft?.engine?.meta?.period?.end === engine.meta.period.end ? previous.snapshot.draft.feedback || [] : [], createdAt: new Date().toISOString(), createdBy: context.identity };
    await db("analysis_snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ schema_version: "fulian.analysis-draft.v1", analysis_version: `draft-${Date.now()}`, period_start: engine.meta.period.start, period_end: engine.meta.period.end, generated_at: draft.createdAt, source_version: "supabase-private-storage", member_count: engine.reconciliation.counts.active, reconciliation: engine.reconciliation, snapshot: { draft }, is_published: false }),
    });
    return { draft };
  }
  const row = await currentDraft();
  if (!row?.snapshot?.draft) throw new Error("目前沒有分析草稿，請先產出分析");
  const draft = row.snapshot.draft;
  if (body.action === "confirm-renewal") {
    const name = String(body.name || "").replace(/\s+/g, "");
    const priorExpiryOn = String(body.priorExpiryOn || "");
    const completedOn = String(body.completedOn || "");
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(priorExpiryOn)) throw new Error("續約會員或原到期日不正確");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completedOn) || completedOn > taipeiDay()) throw new Error("中心區完成日不正確或在未來");
    const radarItem = (draft.engine?.renewalRadar || []).find((item: any) => item.name === name && item.expiryDate === priorExpiryOn);
    if (!radarItem) throw Object.assign(new Error("這筆續約提醒已更新，請重新整理草稿後再確認"), { status: 409 });
    const memberRows = await db(`members?status=eq.active&select=id,membership_expires_on,people!inner(display_name)&people.display_name=eq.${encodeURIComponent(name)}&limit=1`);
    const member = memberRows?.[0];
    if (!member?.id) throw new Error(`${name} 不在現任會員主檔中`);
    if (member.membership_expires_on && member.membership_expires_on !== priorExpiryOn) {
      throw Object.assign(new Error("會員主檔到期日已更新，請重新產出分析後再確認"), { status: 409 });
    }
    await db("membership_renewal_completions?on_conflict=member_id,prior_expiry_on", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        member_id: member.id,
        prior_expiry_on: priorExpiryOn,
        completed_on: completedOn,
        source: "center-office",
        confirmed_by: context.personId,
        confirmed_at: new Date().toISOString(),
        revoked_at: null,
        revoked_by: null,
      }),
    });
    const { engine } = await loadEngineSources();
    assertAnalysisReconciled(engine);
    draft.engine = engine;
    draft.aiReview = null;
    draft.createdAt = new Date().toISOString();
    draft.createdBy = context.identity;
    await db(`analysis_snapshots?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ generated_at: draft.createdAt, reconciliation: engine.reconciliation, snapshot: { draft } }),
    });
    return { draft, message: `${name} 已記錄為中心區完成續約；本到期週期已自續約雷達移除` };
  }
  if (body.action === "revoke-renewal") {
    const completionId = String(body.completionId || "");
    const confirmation = (draft.engine?.renewalConfirmations || []).find((item: any) => item.id === completionId);
    if (!confirmation) throw Object.assign(new Error("這筆完成紀錄已更新，請重新整理草稿後再操作"), { status: 409 });
    await db(`membership_renewal_completions?id=eq.${encodeURIComponent(completionId)}&revoked_at=is.null`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_by: context.personId }),
    });
    const { engine } = await loadEngineSources();
    assertAnalysisReconciled(engine);
    draft.engine = engine;
    draft.aiReview = null;
    draft.createdAt = new Date().toISOString();
    draft.createdBy = context.identity;
    await db(`analysis_snapshots?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ generated_at: draft.createdAt, reconciliation: engine.reconciliation, snapshot: { draft } }),
    });
    return { draft, message: `${confirmation.name} 的中心區完成確認已撤銷，續約提醒已恢復` };
  }
  if (body.action === "reject") {
    const reason = String(body.reason || "").trim().slice(0, 2000);
    if (!reason) throw new Error("退回重做必須附上原因");
    draft.feedback = [...(draft.feedback || []), { reason, at: new Date().toISOString(), by: context.identity }];
    await db(`analysis_snapshots?id=eq.${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ snapshot: { draft } }) });
    return { draft, message: "已記錄退回原因；重新執行 AI 審視時會一併帶入" };
  }
  if (body.action === "ai-review") {
    assertAnalysisReconciled(draft.engine);
    const provider = body.provider as Provider;
    if (!PROVIDERS.includes(provider)) throw new Error("AI 平台不正確");
    const model = reviewModel(provider, body.model);
    const previous = await latestPublished();
    const prompt = `前一期正式資料：\n${JSON.stringify(previous?.snapshot?.analysisReview || null)}\n\n副主席退回回饋：\n${JSON.stringify(draft.feedback || [])}\n\n本期引擎結果（唯一數據來源）：\n${JSON.stringify(draft.engine)}`;
    const result = await callProvider(provider, await credential(context.personId, provider), REVIEW_SYSTEM, prompt, REVIEW_MAX_TOKENS, model);
    draft.aiReview = { provider, model: result.model, text: result.text, generatedAt: new Date().toISOString(), promptChars: prompt.length, feedbackCount: (draft.feedback || []).length };
    await db(`analysis_snapshots?id=eq.${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ snapshot: { draft } }) });
    return { draft };
  }
  if (body.action === "publish") {
    assertAnalysisReconciled(draft.engine);
    if (!draft.aiReview) throw new Error("尚未執行 AI 審視，請先完成審視再發佈");
    const history = await db("analysis_snapshots?is_published=eq.true&select=id");
    const version = history.length + 1;
    const html = renderDashboard({ engine: draft.engine, aiReview: draft.aiReview, version, publishedAt: new Date().toISOString() });
    const snapshot: any = parseBniDashboard(html, { sourcePath: "Supabase/analysis_snapshots", sourceModifiedAt: new Date().toISOString() });
    const memberRows = await db("members?select=profession,membership_expires_on,people!inner(display_name)&status=eq.active");
    const master = new Map(memberRows.map((member: any) => [String(member.people.display_name).replace(/\s+/g, ""), member]));
    snapshot.members = draft.engine.members.map((member: any) => {
      const profile: any = master.get(member.name) || {};
      return {
        name: member.name,
        profession: profile.profession || "",
        expiryDate: profile.membership_expires_on || "",
        metrics: { givenIn: member.metrics.refGivenInternal, givenOut: member.metrics.refGivenExternal, visitors: member.metrics.visitors, oneToOne: Math.round(member.metrics.otoPerWeek * member.weeks), amount: member.metrics.tyfcb, education: member.metrics.ceu, substitutes: member.metrics.substitute },
        official: { weeks: member.weeks, componentScores: member.scores, score: member.total, light: member.light },
        score: member.total,
        light: member.light === "green" ? "綠燈" : member.light === "yellow" ? "黃燈" : member.light === "red" ? "紅燈" : "黑燈",
      };
    });
    snapshot.analysisReview = draft.aiReview;
    snapshot.publishedVersion = version;
    await db("analysis_snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ schema_version: "fulian.bni-analysis.v1", analysis_version: `v${version}`, period_start: draft.engine.meta.period.start, period_end: draft.engine.meta.period.end, generated_at: new Date().toISOString(), source_version: "supabase-private-storage", member_count: snapshot.members.length, reconciliation: draft.engine.reconciliation, snapshot, is_published: true, published_at: new Date().toISOString(), published_by: context.personId }),
    });
    await db(`analysis_snapshots?id=eq.${row.id}`, { method: "DELETE" });
    return { message: `已發佈第 ${version} 版分析快照，會員關懷儀表板已更新`, version };
  }
  throw new Error("不支援的動作");
}

async function analysisSnapshotsApi(context: Context) {
  const rows = await db("analysis_snapshots?is_published=eq.true&select=id,analysis_version,period_start,period_end,published_at,published_by&order=published_at.asc");
  const people = await db("people?select=id,display_name");
  const names = new Map(people.map((person: any) => [person.id, person.display_name]));
  const snapshots = rows.map((row: any, index: number) => ({ version: Number(String(row.analysis_version).replace(/\D/g, "")) || index + 1, id: row.id, publishedAt: row.published_at, publishedBy: `${context.role}:${names.get(row.published_by) || "系統"}`, period: { start: row.period_start, end: row.period_end } }));
  return { snapshots, latest: snapshots.at(-1) || null };
}

const TASK_SOURCE = "vice-chair-work-plan";
const TASK_TYPES = new Set(["renewal", "new", "midterm", "industry", "departure", "special"]);

function parseTaskJson(value: unknown) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanTaskInput(value: any) {
  const id = String(value?.id || "").trim().slice(0, 160);
  const type = String(value?.type || "").trim();
  const member = String(value?.member || "").trim().slice(0, 100);
  const lead = String(value?.lead || "").trim().slice(0, 100);
  const companions = [...new Set((Array.isArray(value?.companions) ? value.companions : [])
    .map((name: unknown) => String(name || "").trim().slice(0, 100))
    .filter(Boolean))]
    .filter((name) => name !== lead)
    .slice(0, 2);
  if (!id || !TASK_TYPES.has(type) || !member || !lead) throw new Error("排程資料缺少有效的案件編號、類型、對象或主責人");
  return {
    id,
    type,
    member,
    profession: String(value?.profession || "").trim().slice(0, 200),
    scheduledAt: String(value?.scheduledAt || "").trim().slice(0, 40),
    lead,
    companions,
    priority: value?.priority === "high" ? "high" : "normal",
    stage: String(value?.stage || "").trim().slice(0, 200),
    notes: String(value?.notes || "").trim().slice(0, 10000),
    completed: Boolean(value?.completed),
    completedAt: value?.completedAt ? String(value.completedAt).slice(0, 40) : null,
    completedBy: value?.completedBy ? String(value.completedBy).trim().slice(0, 100) : "",
    createdAt: value?.createdAt ? String(value.createdAt).slice(0, 40) : null,
    createdBy: value?.createdBy ? String(value.createdBy).trim().slice(0, 100) : "",
    localSource: value?.source ? String(value.source).slice(0, 100) : "",
    sourceMeetingId: value?.sourceMeetingId ? String(value.sourceMeetingId).slice(0, 160) : "",
    sourceCareId: value?.sourceCareId ? String(value.sourceCareId).slice(0, 160) : "",
    revision: Number.isSafeInteger(Number(value?._revision)) ? Number(value._revision) : null,
  };
}

async function taskDirectory() {
  const [people, members, terms] = await Promise.all([
    db("people?select=id,display_name,status"),
    db("members?select=id,people!inner(display_name)"),
    db("committee_terms?status=eq.active&select=person_id,role,starts_on,ends_on,people!inner(display_name,status)"),
  ]);
  const today = taipeiDay();
  const activeCommittee = (terms || []).filter((term: any) =>
    term.people?.status === "active"
    && term.starts_on <= today
    && (!term.ends_on || term.ends_on >= today)
  );
  return {
    people,
    personById: new Map(people.map((person: any) => [person.id, person.display_name])),
    personByName: new Map(activeCommittee.map((term: any) => [term.people.display_name, term.person_id])),
    memberByName: new Map(members.map((member: any) => [member.people?.display_name, member.id])),
  };
}

async function taskResponse(context: Context) {
  const [rows, assignments, details, directory] = await Promise.all([
    db(`tasks?source=eq.${TASK_SOURCE}&select=*&order=created_at.asc`),
    db("task_assignments?select=task_id,person_id,role&order=assigned_at.asc"),
    db("task_private_details?select=task_id,details"),
    taskDirectory(),
  ]);
  const assignmentByTask = new Map<string, any[]>();
  for (const assignment of assignments || []) {
    if (!assignmentByTask.has(assignment.task_id)) assignmentByTask.set(assignment.task_id, []);
    assignmentByTask.get(assignment.task_id)!.push(assignment);
  }
  const detailByTask = new Map((details || []).map((detail: any) => [detail.task_id, detail.details]));
  const isLeader = ["admin", "vp"].includes(context.role);
  const tasks = (rows || []).map((row: any) => {
    const assigned = assignmentByTask.get(row.id) || [];
    const assignedIds = new Set(assigned.map((item: any) => item.person_id));
    const meta: any = parseTaskJson(row.result_summary);
    const privateMeta: any = isLeader || assignedIds.has(context.personId)
      ? parseTaskJson(detailByTask.get(row.id))
      : {};
    const companions = assigned
      .filter((item: any) => item.role === "companion")
      .map((item: any) => directory.personById.get(item.person_id))
      .filter(Boolean);
    return {
      id: row.source_reference,
      type: row.category,
      member: row.title,
      profession: meta.profession || "",
      scheduledAt: meta.scheduledAt || row.due_at || "",
      lead: directory.personById.get(row.lead_person_id) || "",
      companions,
      priority: meta.priority === "high" ? "high" : "normal",
      stage: meta.stage || "",
      notes: privateMeta.notes || "",
      completed: row.status === "completed",
      completedAt: row.completed_at || null,
      completedBy: directory.personById.get(row.completed_by) || meta.completedBy || "",
      createdAt: row.created_at,
      createdBy: meta.createdBy || "",
      _revision: Number(row.revision || 1),
      ...(meta.localSource ? { source: meta.localSource } : {}),
      ...(meta.sourceMeetingId ? { sourceMeetingId: meta.sourceMeetingId } : {}),
      ...(meta.sourceCareId ? { sourceCareId: meta.sourceCareId } : {}),
    };
  });
  return { tasks, syncedAt: new Date().toISOString() };
}

async function saveLeadershipTask(input: any, context: Context, directory: any) {
  const task = cleanTaskInput(input);
  const memberId = directory.memberByName.get(task.member) || null;
  if (task.type !== "new" && !memberId) {
    throw new Error(`案件會員「${task.member}」不在正式會員名單`);
  }
  const leadId = directory.personByName.get(task.lead);
  if (!leadId) throw new Error(`主責人「${task.lead}」不在有效委員名單`);
  const companionIds = task.companions.map((name: string) => {
    const personId = directory.personByName.get(name);
    if (!personId) throw new Error(`陪訪人「${name}」不在有效委員名單`);
    return personId;
  });
  const dueAt = task.scheduledAt
    ? (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(task.scheduledAt)
      ? `${task.scheduledAt}${task.scheduledAt.length === 16 ? ":00" : ""}+08:00`
      : task.scheduledAt)
    : "";
  const meta = {
    profession: task.profession,
    scheduledAt: task.scheduledAt,
    priority: task.priority,
    stage: task.stage,
    createdBy: task.createdBy || context.name,
    completedBy: task.completedBy || (task.completed ? context.name : ""),
    localSource: task.localSource,
    sourceMeetingId: task.sourceMeetingId,
    sourceCareId: task.sourceCareId,
  };
  await db("rpc/edge_save_task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_task: {
        id: task.id,
        type: task.type,
        member: task.member,
        completed: task.completed,
        completedAt: task.completedAt,
        dueAt,
        meta: JSON.stringify(meta),
        notes: task.notes,
      },
      p_actor: context.personId,
      p_lead: leadId,
      p_companions: companionIds,
      p_member: memberId,
      p_expected_revision: task.revision,
      p_import: Boolean(input?._legacyImport),
    }),
  });
}

async function completeAssignedTask(input: any, context: Context) {
  const task = cleanTaskInput(input);
  if (!["special", "midterm", "departure"].includes(task.type) || !task.completed) {
    throw Object.assign(new Error("此案件必須依正式流程完成，不能直接結案"), { status: 403 });
  }
  const rows = await db(`tasks?source=eq.${TASK_SOURCE}&source_reference=eq.${encodeURIComponent(task.id)}&select=id,title,category,lead_person_id,status,revision&limit=1`);
  const row = rows?.[0];
  if (!row || row.lead_person_id !== context.personId) throw Object.assign(new Error("只有此工作的主責委員可以完成"), { status: 403 });
  if (row.title !== task.member || row.category !== task.type) {
    throw Object.assign(new Error("案件會員或類型與正式任務不一致，請重新整理後再操作"), { status: 409 });
  }
  if (row.status === "completed") return;
  if (task.revision !== Number(row.revision)) {
    throw Object.assign(new Error("這項工作已在其他裝置更新，請重新整理後再操作"), { status: 409 });
  }
  if (task.type !== "special") {
    const states = await db(`task_case_states?task_id=eq.${row.id}&select=workflow&limit=1`);
    if (!states?.[0]?.workflow?.wordSaved) {
      throw Object.assign(new Error("訪談 Word 尚未成功保存，不能結案"), { status: 409 });
    }
  }
  const updated = await db(`tasks?id=eq.${row.id}&revision=eq.${row.revision}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      status: "completed",
      completed_at: task.completedAt || new Date().toISOString(),
      completed_by: context.personId,
      revision: Number(row.revision) + 1,
    }),
  });
  if (!updated?.length) throw Object.assign(new Error("這項工作已在其他裝置更新，請重新整理後再操作"), { status: 409 });
}

async function tasksApi(request: Request, context: Context) {
  if (request.method === "GET") return taskResponse(context);
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (!["upsert", "import", "delete"].includes(body.action)) throw new Error("不支援的排程動作");
  if (body.action === "delete") {
    leadership(context);
    const id = String(body.id || "").trim();
    if (!id) throw new Error("缺少要刪除的案件編號");
    const rows = await db(`tasks?source=eq.${TASK_SOURCE}&source_reference=eq.${encodeURIComponent(id)}&select=id,case_id,revision&limit=1`);
    const row = rows?.[0];
    const files = row
      ? await db(`task_case_files?task_id=eq.${row.id}&select=object_path`)
      : [];
    try {
      await db("rpc/edge_delete_task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_source_reference: id,
          p_expected_revision: row ? Number(body.revision) : null,
        }),
      });
    } catch (error) {
      if (String((error as any)?.message).includes("TASK_CONFLICT")) {
        throw Object.assign(new Error("這項工作已在其他裝置更新，已重新載入最新資料，請確認後再刪除"), { status: 409 });
      }
      throw error;
    }
    for (const file of files || []) {
      await serviceFetch(`/storage/v1/object/case-files/${file.object_path}`, { method: "DELETE" }).catch(console.error);
    }
    return taskResponse(context);
  }
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length > 250) throw Object.assign(new Error("單次排程同步不可超過 250 筆"), { status: 413 });
  if (["admin", "vp"].includes(context.role)) {
    const directory = await taskDirectory();
    for (const task of tasks) {
      try {
        await saveLeadershipTask(body.action === "import" ? { ...task, _legacyImport: true } : task, context, directory);
      } catch (error) {
        if (String((error as any)?.message).includes("TASK_DELETED")) {
          continue;
        }
        if (String((error as any)?.message).includes("TASK_CONFLICT")) {
          throw Object.assign(new Error("這項工作已在其他裝置更新，已重新載入最新資料，請重新操作"), { status: 409 });
        }
        if (String((error as any)?.message).includes("TASK_IDENTITY_IMMUTABLE")) {
          throw Object.assign(new Error("既有案件的會員與類型不可變更；請建立新案件"), { status: 409 });
        }
        throw error;
      }
    }
  } else {
    if (body.action !== "upsert") throw Object.assign(new Error("會員委員不能匯入或刪除排程"), { status: 403 });
    for (const task of tasks) await completeAssignedTask(task, context);
  }
  return taskResponse(context);
}

async function taskAccess(sourceReference: string, context: Context) {
  const rows = await db(`tasks?source=eq.${TASK_SOURCE}&source_reference=eq.${encodeURIComponent(sourceReference)}&select=id,case_id,member_id,title,source_reference,category,lead_person_id,revision&limit=1`);
  const task = rows?.[0];
  if (!task) throw Object.assign(new Error("找不到指定案件"), { status: 404 });
  const assignments = await db(`task_assignments?task_id=eq.${task.id}&select=person_id`);
  const assigned = (assignments || []).some((item: any) => item.person_id === context.personId);
  return { task, assigned, leadership: ["admin", "vp"].includes(context.role) };
}

async function ensureTaskCase(access: any, context: Context) {
  if (access.task.case_id) return access.task.case_id;
  if (!["renewal", "new", "industry"].includes(access.task.category)) {
    throw Object.assign(new Error("此案件類型不適用委員回饋與投票"), { status: 409 });
  }
  const caseId = await db("rpc/edge_ensure_task_case", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_task_id: access.task.id, p_actor: context.personId }),
  });
  access.task.case_id = String(caseId || "");
  if (!access.task.case_id) throw new Error("正式案件對照建立失敗");
  return access.task.case_id;
}

async function caseParticipationForCases(caseIds: string[]) {
  const ids = [...new Set(caseIds.filter(Boolean))];
  const result = new Map<string, any>();
  if (!ids.length) return result;
  const filter = `in.(${ids.join(",")})`;
  const [people, feedback, snapshots] = await Promise.all([
    db("people?select=id,display_name"),
    db(`case_feedback?case_id=${filter}&select=case_id,author_person_id,submitted_by_person_id,body,submitted_at,updated_at`),
    db(`vote_snapshots?case_id=${filter}&select=id,case_id,status,opened_at,deadline_at,closed_at,original_base,eligible_base,majority_threshold,result,approve_count,reject_count`),
  ]);
  const names = new Map((people || []).map((person: any) => [person.id, person.display_name]));
  const snapshotIds = (snapshots || []).map((snapshot: any) => snapshot.id);
  const snapshotFilter = snapshotIds.length ? `in.(${snapshotIds.join(",")})` : "";
  const [voters, votes] = snapshotIds.length
    ? await Promise.all([
      db(`vote_snapshot_voters?snapshot_id=${snapshotFilter}&select=snapshot_id,person_id,is_recused`),
      db(`votes?snapshot_id=${snapshotFilter}&select=snapshot_id,voter_person_id,choice,cast_at`),
    ])
    : [[], []];
  const snapshotByCase = new Map((snapshots || []).map((snapshot: any) => [snapshot.case_id, snapshot]));
  for (const caseId of ids) {
    const snapshot: any = snapshotByCase.get(caseId) || null;
    const snapshotVoters = snapshot
      ? (voters || []).filter((voter: any) => voter.snapshot_id === snapshot.id)
      : [];
    const snapshotVotes = snapshot
      ? (votes || []).filter((vote: any) => vote.snapshot_id === snapshot.id)
      : [];
    result.set(caseId, {
      feedback: Object.fromEntries((feedback || [])
        .filter((item: any) => item.case_id === caseId)
        .map((item: any) => [names.get(item.author_person_id), item.body])
        .filter(([name]: any) => Boolean(name))),
      feedbackMeta: Object.fromEntries((feedback || [])
        .filter((item: any) => item.case_id === caseId)
        .map((item: any) => {
          const authorName = names.get(item.author_person_id);
          const submittedBy = names.get(item.submitted_by_person_id) || authorName;
          return [authorName, {
            submittedBy,
            delegated: Boolean(item.submitted_by_person_id && item.submitted_by_person_id !== item.author_person_id),
            updatedAt: item.updated_at || item.submitted_at || "",
          }];
        })
        .filter(([name]: any) => Boolean(name))),
      voterSnapshot: snapshotVoters
        .filter((voter: any) => !voter.is_recused)
        .map((voter: any) => names.get(voter.person_id))
        .filter(Boolean),
      votes: Object.fromEntries(snapshotVotes
        .map((vote: any) => [names.get(vote.voter_person_id), vote.choice])
        .filter(([name]: any) => Boolean(name))),
      snapshot,
    });
  }
  return result;
}

function visibleCaseState(row: any, task: any, assigned: boolean, leadershipRole: boolean, participation: any = null, viewerName = "") {
  const decisionCase = ["renewal", "new", "industry"].includes(task.category);
  const recusedApplicant = decisionCase
    && Boolean(viewerName)
    && String(task.title || "").trim() === String(viewerName).trim();
  const storedWorkflow = row?.workflow || {};
  const fullWorkflow = {
    ...storedWorkflow,
    form: {
      ...(storedWorkflow.form || {}),
      caseType: task.category,
      applicant: task.title,
    },
  };
  const participationWorkflow = decisionCase
    ? {
      ...fullWorkflow,
      feedback: recusedApplicant
        ? {}
        : { ...(fullWorkflow.feedback || {}), ...(participation?.feedback || {}) },
      feedbackMeta: recusedApplicant
        ? {}
        : { ...(fullWorkflow.feedbackMeta || {}), ...(participation?.feedbackMeta || {}) },
      voterSnapshot: participation?.snapshot
        ? participation.voterSnapshot
        : (Array.isArray(fullWorkflow.voterSnapshot) ? fullWorkflow.voterSnapshot : []),
      votes: recusedApplicant
        ? {}
        : { ...(fullWorkflow.votes || {}), ...(participation?.votes || {}) },
    }
    : fullWorkflow;
  const workflow = leadershipRole || assigned || decisionCase
    ? participationWorkflow
    : {
      wordSaved: Boolean(participationWorkflow.wordSaved),
      closed: Boolean(participationWorkflow.closed),
      interviewCompletedAt: participationWorkflow.interviewCompletedAt || "",
    };
  return {
    taskId: task.source_reference,
    workflow,
    draft: leadershipRole || assigned ? row?.draft || {} : null,
    revision: Number(row?.revision || 0),
    canReadFile: leadershipRole || assigned || decisionCase,
  };
}

async function saveCaseStateRecord(access: any, existing: any, workflow: any, draft: any, context: Context) {
  if (existing) {
    const saved = await db(`task_case_states?task_id=eq.${access.task.id}&revision=eq.${existing.revision}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ workflow, draft, revision: Number(existing.revision) + 1, updated_by: context.personId }),
    });
    if (!saved?.length) throw Object.assign(new Error("案件已在其他裝置更新，請重新整理後再操作"), { status: 409 });
    return saved[0];
  }
  const saved = await db("task_case_states", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ task_id: access.task.id, workflow, draft, revision: 1, updated_by: context.personId }),
  });
  return saved[0];
}

async function caseStateResponse(access: any, row: any, context: Context) {
  let task = access.task;
  if (!task.case_id) {
    const taskRows = await db(`tasks?id=eq.${task.id}&select=id,case_id,member_id,title,source_reference,category&limit=1`);
    if (taskRows?.[0]) task = { ...task, ...taskRows[0] };
  }
  const participation = task.case_id
    ? (await caseParticipationForCases([task.case_id])).get(task.case_id)
    : null;
  return visibleCaseState(row, task, access.assigned, access.leadership, participation, context.name);
}

function normalizedDeadline(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("請先設定投票截止時間");
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)
    ? `${raw}${raw.length === 16 ? ":00" : ""}+08:00`
    : raw;
  const deadline = new Date(normalized);
  if (!Number.isFinite(deadline.getTime())) throw new Error("投票截止時間格式不正確");
  if (deadline.getTime() <= Date.now()) throw new Error("投票期限已截止，請先更新截止時間");
  return deadline.toISOString();
}

async function activeVotingRoster() {
  const today = taipeiDay();
  return db(`committee_terms?status=eq.active&has_voting_right=eq.true&starts_on=lte.${today}&or=(ends_on.is.null,ends_on.gte.${today})&people.status=eq.active&select=id,person_id,role,people!inner(display_name,status)&order=created_at.asc`);
}

async function openVoteSnapshot(access: any, existing: any, workflow: any, context: Context, materializeLegacy = false) {
  if (context.role !== "vp" && !materializeLegacy) throw Object.assign(new Error("只有副主席可以開啟投票"), { status: 403 });
  if (String(access.task.title || "").trim() === context.name) {
    throw Object.assign(new Error("申請者本人須迴避，不得開啟本案投票"), { status: 403 });
  }
  if (materializeLegacy && !existing?.workflow?.votingOpen) {
    throw Object.assign(new Error("投票尚未由副主席開啟"), { status: 409 });
  }
  const deadlineAt = normalizedDeadline(workflow?.form?.voteDeadline);
  try {
    await db("rpc/edge_open_task_vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_task_id: access.task.id,
        p_actor: context.personId,
        p_actor_auth_user_id: context.userId,
        p_workflow: workflow,
        p_expected_revision: Number(existing?.revision || 0),
        p_deadline: deadlineAt,
      }),
    });
  } catch (error) {
    if (String((error as any)?.message).includes("CASE_CONFLICT")) {
      throw Object.assign(new Error("案件已在其他裝置更新，請重新整理後再操作"), { status: 409 });
    }
    throw error;
  }
  const taskRows = await db(`tasks?id=eq.${access.task.id}&select=case_id&limit=1`);
  const caseId = taskRows?.[0]?.case_id;
  const current = caseId ? await db(`vote_snapshots?case_id=eq.${caseId}&select=*&limit=1`) : [];
  if (!current?.[0]) throw new Error("投票資格快照建立失敗");
  return current[0];
}

async function caseStatesApi(request: Request, context: Context) {
  if (request.method === "GET") {
    const [tasks, assignments, states] = await Promise.all([
      db(`tasks?source=eq.${TASK_SOURCE}&select=id,case_id,member_id,title,source_reference,category`),
      db("task_assignments?select=task_id,person_id"),
      db("task_case_states?select=task_id,workflow,draft,revision"),
    ]);
    const stateByTask = new Map((states || []).map((row: any) => [row.task_id, row]));
    const assignedIds = new Set((assignments || [])
      .filter((row: any) => row.person_id === context.personId)
      .map((row: any) => row.task_id));
    const leadershipRole = ["admin", "vp"].includes(context.role);
    const participation = await caseParticipationForCases((tasks || []).map((task: any) => task.case_id).filter(Boolean));
    return {
      states: (tasks || []).map((task: any) =>
        visibleCaseState(stateByTask.get(task.id), task, assignedIds.has(task.id), leadershipRole, participation.get(task.case_id), context.name)
      ),
    };
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  const access = await taskAccess(String(body.taskId || ""), context);
  const rows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
  const existing = rows?.[0] || null;
  const expectedRevision = Number(body.revision || 0);
  const currentWorkflow = existing?.workflow || {};
  const currentDraft = existing?.draft || {};

  if (body.kind === "feedback") {
    if (!["vp", "committee"].includes(context.role)) throw Object.assign(new Error("此身份不能提交委員回饋"), { status: 403 });
    const requestedAuthorName = String(body.authorName || "").trim();
    let authorPersonId = context.personId;
    let authorName = context.name;
    if (requestedAuthorName && requestedAuthorName !== context.name) {
      if (context.role !== "vp") {
        throw Object.assign(new Error("只有副主席可以代填會員委員回饋"), { status: 403 });
      }
      const roster = await activeVotingRoster();
      const target = (roster || []).find((item: any) =>
        item.role === "committee"
        && String(item.people?.display_name || "").trim() === requestedAuthorName
      );
      if (!target) throw Object.assign(new Error("只能代填現任會員委員的回饋"), { status: 403 });
      authorPersonId = target.person_id;
      authorName = String(target.people?.display_name || "").trim();
    }
    if (String(access.task.title || "").trim() === authorName) {
      throw Object.assign(new Error("申請者本人須迴避，不得提交本案回饋"), { status: 403 });
    }
    if (currentWorkflow.closed) throw Object.assign(new Error("案件已結案，無法修改回饋"), { status: 409 });
    const value = String(body.value || "").trim().slice(0, 10000);
    if (!value) throw new Error("請先填寫回饋內容");
    await db("rpc/edge_save_case_feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_task_id: access.task.id,
        p_actor: context.personId,
        p_body: value,
        p_author: authorPersonId,
      }),
    });
    const latestRows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
    return caseStateResponse(access, latestRows?.[0] || existing, context);
  }

  if (body.kind === "vote") {
    if (!["vp", "committee"].includes(context.role)) throw Object.assign(new Error("此身份不能參與投票"), { status: 403 });
    if (currentWorkflow.closed) throw Object.assign(new Error("案件已結案，無法投票"), { status: 409 });
    if (!currentWorkflow.votingOpen || !currentWorkflow.voteNoticeSent) {
      throw Object.assign(new Error("投票尚未開放或尚未通知"), { status: 409 });
    }
    const choice = String(body.value || "");
    if (!["approve", "reject"].includes(choice)) throw new Error("投票選項不正確");
    let caseId = access.task.case_id;
    let snapshots = caseId ? await db(`vote_snapshots?case_id=eq.${caseId}&select=*&limit=1`) : [];
    if (!snapshots?.[0]) {
      await openVoteSnapshot(access, existing, currentWorkflow, context, true);
      const taskRows = await db(`tasks?id=eq.${access.task.id}&select=case_id&limit=1`);
      caseId = taskRows?.[0]?.case_id;
      snapshots = caseId ? await db(`vote_snapshots?case_id=eq.${caseId}&select=*&limit=1`) : [];
    }
    if (!snapshots?.[0]) throw new Error("本案尚未建立投票資格快照");
    await db("rpc/edge_cast_case_vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_task_id: access.task.id,
        p_actor: context.personId,
        p_actor_auth_user_id: context.userId,
        p_choice: choice,
      }),
    });
    const latestRows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
    return caseStateResponse(access, latestRows?.[0] || existing, context);
  }

  if (existing && expectedRevision !== Number(existing.revision)) {
    throw Object.assign(new Error("案件已在其他裝置更新，請重新整理後再操作"), { status: 409 });
  }
  let workflow = currentWorkflow;
  let draft = currentDraft;
  let voteDeadlineUpdate = "";

  if (body.kind === "open-vote") {
    const proposed = body.value && typeof body.value === "object" ? body.value : {};
    await openVoteSnapshot(access, existing, proposed, context);
    const latestRows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
    return caseStateResponse(access, latestRows?.[0], context);
  } else if (body.kind === "reset") {
    leadership(context);
    try {
      await db("rpc/edge_reset_task_case_as_user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_task_id: access.task.id,
          p_actor: context.personId,
          p_actor_auth_user_id: context.userId,
          p_expected_revision: expectedRevision,
        }),
      });
    } catch (error) {
      if (String((error as any)?.message).includes("CASE_CONFLICT")) {
        throw Object.assign(new Error("案件已在其他裝置更新，請重新整理後再操作"), { status: 409 });
      }
      throw error;
    }
    const latestRows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
    return caseStateResponse(access, latestRows?.[0], context);
  } else if (body.kind === "draft") {
    if (!access.leadership && !access.assigned) {
      throw Object.assign(new Error("只有副主席或本案受指派人員可以保存訪談草稿"), { status: 403 });
    }
    draft = body.value && typeof body.value === "object" ? body.value : {};
  } else if (body.kind === "workflow") {
    const proposed = body.value && typeof body.value === "object" ? body.value : {};
    if (access.leadership) {
      workflow = {
        ...proposed,
        form: {
          ...(proposed.form || {}),
          caseType: access.task.category,
          applicant: access.task.title,
        },
        feedback: currentWorkflow.feedback || {},
        votes: currentWorkflow.votes || {},
        voterSnapshot: currentWorkflow.voterSnapshot || [],
      };
      if (
        currentWorkflow.votingOpen
        && proposed.form?.voteDeadline
        && proposed.form.voteDeadline !== currentWorkflow.form?.voteDeadline
      ) {
        voteDeadlineUpdate = normalizedDeadline(proposed.form.voteDeadline);
      }
    } else {
      if (access.assigned) {
        const protectedKeys = new Set([
          "votingOpen", "voteNoticeSent", "voterSnapshot", "leadersSent",
          "advisorStatus", "advisorNote", "closed",
        ]);
        workflow = { ...workflow };
        for (const [key, value] of Object.entries(proposed)) {
          if (!protectedKeys.has(key) && !["feedback", "votes"].includes(key)) workflow[key] = value;
        }
        workflow.form = {
          ...(workflow.form || {}),
          caseType: access.task.category,
          applicant: access.task.title,
        };
        if (["midterm", "departure"].includes(access.task.category) && proposed.wordSaved) workflow.closed = true;
      }
    }
  } else {
    throw new Error("不支援的案件同步類型");
  }

  try {
    await db("rpc/edge_save_case_state_as_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_task_id: access.task.id,
        p_actor: context.personId,
        p_actor_auth_user_id: context.userId,
        p_workflow: workflow,
        p_draft: draft,
        p_expected_revision: expectedRevision,
        p_vote_deadline: voteDeadlineUpdate || null,
      }),
    });
  } catch (error) {
    if (String((error as any)?.message).includes("CASE_CONFLICT")) {
      throw Object.assign(new Error("案件已在其他裝置更新，請重新整理後再操作"), { status: 409 });
    }
    throw error;
  }
  const latestRows = await db(`task_case_states?task_id=eq.${access.task.id}&select=*&limit=1`);
  return caseStateResponse(access, latestRows?.[0], context);
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < value.length; index += chunk) {
    binary += String.fromCharCode(...value.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function taskFileApi(request: Request, url: URL, context: Context) {
  const body = request.method === "POST" ? await requestBody(request) : {};
  const taskId = String(url.searchParams.get("task") || body.taskId || "");
  const access = await taskAccess(taskId, context);
  const decisionCase = ["renewal", "new", "industry"].includes(access.task.category);
  const canRead = access.leadership || access.assigned || decisionCase;
  if (!canRead) throw Object.assign(new Error("你沒有權限讀取此案件附件"), { status: 403 });
  if (request.method === "GET") {
    const rows = await db(`task_case_files?task_id=eq.${access.task.id}&select=*&limit=1`);
    const file = rows?.[0];
    if (!file) throw Object.assign(new Error("此案件尚未保存 Word"), { status: 404 });
    const response = await serviceFetch(`/storage/v1/object/authenticated/case-files/${file.object_path}`);
    return {
      name: file.original_filename,
      type: file.content_type,
      size: file.size_bytes,
      base64: encodeBase64(new Uint8Array(await response.arrayBuffer())),
    };
  }
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  if (!access.leadership && !access.assigned) {
    throw Object.assign(new Error("只有副主席或本案受指派人員可以保存附件"), { status: 403 });
  }
  const filename = String(body.filename || "interview.docx").trim().slice(0, 240);
  const contentType = String(body.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  if (contentType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    throw Object.assign(new Error("訪談附件目前只接受 Word .docx"), { status: 415 });
  }
  const bytes = decodeBase64(String(body.base64 || ""));
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw Object.assign(new Error("Word 檔案大小無效"), { status: 413 });
  const objectPath = `${access.task.id}/interview.docx`;
  await serviceFetch(`/storage/v1/object/case-files/${objectPath}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  await db("task_case_files?on_conflict=task_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      task_id: access.task.id,
      bucket_id: "case-files",
      object_path: objectPath,
      original_filename: filename,
      content_type: contentType,
      size_bytes: bytes.length,
      uploaded_by: context.personId,
    }),
  });
  return { message: "Word 已保存至 Supabase Private Storage", name: filename, size: bytes.length };
}

async function companyApi(url: URL) {
  const taxId = (url.searchParams.get("taxId") || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(taxId)) throw new Error("統編必須為 8 碼數字");
  const endpoint = new URL("https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6");
  endpoint.searchParams.set("$format", "json");
  endpoint.searchParams.set("$filter", `Business_Accounting_NO eq ${taxId}`);
  const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "Fulian-Membership-Committee/1.0" } });
  if (!response.ok) throw Object.assign(new Error(`官方公司資料暫時無法查詢：HTTP ${response.status}`), { status: 502 });
  const rows = await response.json();
  const company = rows?.[0];
  if (!company) throw Object.assign(new Error("查無公司登記資料；若為商號或行號請手動填寫"), { status: 404 });
  const digits = String(company.Company_Setup_Date || "").replace(/\D/g, "");
  const setupDate = digits.length === 7 ? `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}` : "";
  return { found: true, name: company.Company_Name || "", capital: company.Capital_Stock_Amount || "", setupDate, status: company.Company_Status_Desc || "", source: "經濟部商業發展署商工行政資料開放平臺" };
}

async function testResetApi(request: Request, context: Context) {
  if (context.role !== "admin") {
    throw Object.assign(new Error("只有系統開發人員 Admin 可以清除測試資料"), { status: 403 });
  }
  const [meetings, tasks, files, protectedRegistrations] = await Promise.all([
    db("committee_meetings?select=id"),
    db(`tasks?source=eq.${TASK_SOURCE}&select=id,source_reference,revision`),
    db("task_case_files?select=task_id,object_path"),
    db("provisional_members?status=in.(pending_palms,promoted)&select=source_task_id"),
  ]);
  const protectedTaskIds = new Set((protectedRegistrations || []).map((row: any) => row.source_task_id));
  const resettableTasks = (tasks || []).filter((task: any) => !protectedTaskIds.has(task.id));
  const resettableTaskIds = new Set(resettableTasks.map((task: any) => task.id));
  const resettableFiles = (files || []).filter((file: any) => resettableTaskIds.has(file.task_id));
  if (request.method === "GET") return {
    meetings: meetings.length,
    tasks: resettableTasks.length,
    files: resettableFiles.length,
    protectedNewMemberCases: protectedTaskIds.size,
  };
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.confirmation !== "RESET_FULIAN_TEST_DATA") throw new Error("缺少測試資料清除確認");
  await db("committee_meetings?id=not.is.null", { method: "DELETE" });
  for (const task of resettableTasks) {
    await db("rpc/edge_delete_task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_source_reference: task.source_reference,
        p_expected_revision: Number(task.revision),
      }),
    });
  }
  for (const file of resettableFiles) {
    await serviceFetch(`/storage/v1/object/case-files/${file.object_path}`, { method: "DELETE" }).catch(console.error);
  }
  return {
    meetings: meetings.length,
    tasks: resettableTasks.length,
    files: resettableFiles.length,
    protectedNewMemberCases: protectedTaskIds.size,
    message: "Supabase 月會、案件、草稿與附件測試資料已清除",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (!supabaseUrl || !anonKey || !serviceKey) return respond(request, 500, { message: "Supabase Edge API 環境設定不完整" });
  const url = new URL(request.url);
  const path = routePath(url);
  try {
    const bodyForIdentity = request.method === "GET" ? null : await request.clone().json().catch(() => ({}));
    const identity = url.searchParams.get("identity") || bodyForIdentity?.identity || "";
    const context = await authenticate(request, identity);
    let result;
    if (path === "/api/monthly-data") result = await monthlyDataApi(request, url, context);
    else if (path === "/api/committee-meetings") result = await committeeMeetingsApi(request, context);
    else if (path === "/api/new-member-registration") result = await newMemberRegistrationApi(request, context);
    else if (path === "/api/member-departure") result = await memberDepartureApi(request, context);
    else if (path === "/api/ai-settings") result = await aiSettingsApi(request, context);
    else if (path === "/api/ai-chat") result = await aiChatApi(request, context);
    else if (path === "/api/analysis-draft") result = await analysisDraftApi(request, context);
    else if (path === "/api/analysis-snapshots") result = await analysisSnapshotsApi(context);
    else if (path === "/api/tasks") result = await tasksApi(request, context);
    else if (path === "/api/case-states") result = await caseStatesApi(request, context);
    else if (path === "/api/task-file") result = await taskFileApi(request, url, context);
    else if (path === "/api/company") result = await companyApi(url);
    else if (path === "/api/test-data-reset") result = await testResetApi(request, context);
    else if (path === "/api/line-groups") result = await lineGroupsApi(request, context);
    else if (path === "/api/line-reminders") result = await lineRemindersApi(request, context);
    else if (path === "/api/attendance") result = await attendanceApi(request, url, context);
    else throw Object.assign(new Error("找不到指定的應用服務"), { status: 404 });
    return respond(request, 200, result);
  } catch (error) {
    console.error(path, error);
    const status = Number((error as any)?.status || 400);
    const payload: any = { message: String((error as any)?.message || error).slice(0, 300) };
    if ((error as any)?.issues) payload.issues = (error as any).issues;
    return respond(request, status >= 400 && status <= 599 ? status : 500, payload);
  }
});
