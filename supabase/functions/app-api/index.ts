import { parsePalmsText, parseExpiryText, parseTenureText } from "../../../apps/bni-analysis/engine/parse-reports.mjs";
import { parseAuditWeekText, combineAuditWeeks } from "../../../apps/bni-analysis/engine/audit.mjs";
import { buildAnalysisFromParsed } from "../../../apps/bni-analysis/engine/analyze.mjs";
import { renderDashboard } from "../../../apps/bni-analysis/engine/render-dashboard.mjs";
import { parseBniDashboard } from "../../../apps/vice-chair/bni-bridge.mjs";
import "../../../apps/vice-chair/core/attendance-domain.js";

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
    const terms = await db(`committee_terms?person_id=eq.${person.id}&role=eq.${role}&status=eq.active&select=id&limit=1`);
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

function apiAttendanceRow(record: any, memberById: Map<string, any>) {
  const member = memberById.get(record.member_id);
  return {
    name: member?.name || "",
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

async function attendanceState(meetingDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
  const [baseline, memberRows, peopleRows, sessions] = await Promise.all([
    latestAttendancePalms(),
    db("members?status=eq.active&select=id,profession,people!inner(id,display_name)&order=created_at.asc"),
    db("people?status=eq.active&select=id,display_name"),
    db("attendance_sessions?select=*&order=meeting_date.desc&limit=30"),
  ]);
  const members = memberRows.map((row: any) => ({
    id: row.id,
    personId: row.people.id,
    name: String(row.people.display_name || "").replace(/\s+/g, ""),
    profession: row.profession || "",
  }));
  const memberById = new Map(members.map((member: any) => [member.id, member]));
  const memberByName = new Map(members.map((member: any) => [member.name, member]));
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
  for (const member of members) overlay[member.name] = { late: 0, proxy: 0, absence: 0 };
  for (const session of overlaySessions) {
    for (const record of session.attendance_records || []) {
      const member = memberById.get(record.member_id);
      if (!member) continue;
      const counts = operationalCounts(record);
      overlay[member.name].late += counts.late;
      overlay[member.name].proxy += counts.proxy;
      overlay[member.name].absence += counts.absence;
    }
  }
  const official: Record<string, { late: number; proxy: number; absence: number }> = {};
  const missing: string[] = [];
  for (const member of members) {
    const values: any = baseline.members.get(member.name);
    if (!values) missing.push(member.name);
    official[member.name] = values || { late: 0, proxy: 0, absence: 0 };
  }
  return {
    members: members.map(({ id, name, profession }: any) => ({ id, name, profession })),
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
      rows: currentRecords.map((record: any) => apiAttendanceRow(record, memberById)).filter((row: any) => memberByName.has(row.name)),
    } : null,
    history: sessions.map((session: any) => ({
      meetingDate: session.meeting_date,
      status: session.status,
      confirmedAt: session.confirmed_at,
    })),
  };
}

async function saveAttendanceSession(body: any, context: Context, { confirm = false, importing = false } = {}) {
  const meetingDate = String(body.meetingDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("例會日期格式不正確");
  if (meetingDate > new Date().toISOString().slice(0, 10)) throw new Error("例會日期不可在未來");
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
  const [recorderRows, memberRows, baseline] = await Promise.all([
    db("committee_terms?status=eq.active&select=person_id,people!inner(display_name)"),
    db("members?status=eq.active&select=id,people!inner(display_name)"),
    latestAttendancePalms(),
  ]);
  const peopleByName = new Map(recorderRows.map((term: any) => [term.people.display_name, term.person_id]));
  const membersByName = new Map(memberRows.map((member: any) => [String(member.people.display_name || "").replace(/\s+/g, ""), member.id]));
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
  const recordsByMember = new Map<string, any>();
  for (const row of (Array.isArray(body.rows) ? body.rows : []).slice(0, 100)) {
    const memberId = membersByName.get(String(row.name || "").replace(/\s+/g, ""));
    if (!memberId) continue;
    const absent = Boolean(row.absent) && !Boolean(row.proxy);
    const proxy = Boolean(row.proxy);
    recordsByMember.set(memberId, {
      session_id: session.id,
      member_id: memberId,
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
    });
  }
  const records = [...recordsByMember.values()];
  if (records.length) {
    await db("attendance_records?on_conflict=session_id,member_id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(records),
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
    const meetingDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    return attendanceState(meetingDate);
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
    const safeName = String(file.name || "report.xls").replace(/[^\p{Letter}\p{Number}._-]+/gu, "_").slice(-120);
    const storagePath = `monthly-data/${monthly.month}/${body.type}/${Date.now()}-${index}-${safeName}`;
    await uploadRawFile(bytes, storagePath);
    const imported = await insertReportImport({
      report_type: reportType,
      period_start: period.start,
      period_end: period.end,
      storage_path: storagePath,
      sha256: await sha256(bytes),
      imported_by: context.personId,
      metadata: { category: body.type, originalFilename: file.name || "", uploadedBy: context.identity },
    });
    if (body.type === "monthly") await saveMonthlyAttendance(parsed, imported.id, storagePath);
  }
  return { message: "資料已驗證並安全上傳至 Supabase Private Storage", status: await monthlyDataStatus() };
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
  const record = body.record;
  if (!record || !/^meeting-\d{4}-\d{2}$/.test(String(record.id || ""))) throw new Error("會議紀錄編號不正確");
  const items = Array.isArray(record.care?.items) ? record.care.items : [];
  if (items.some((item: any) => item.assignmentRequired !== false && item.owner && item.owner === item.companion)) throw new Error("負責委員與陪訪委員不能是同一人");
  if (record.status === "final" && items.some((item: any) => item.assignmentRequired !== false && (!String(item.owner || "").trim() || !String(item.dueDate || "").trim()))) {
    throw new Error("續約及輔導項目都必須完成追蹤委員與排定日期後才能結案");
  }
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

async function memberDepartureState() {
  const current = await db("members?status=eq.active&select=profession,people!inner(display_name)&order=created_at.asc");
  const departed = await db("members?status=eq.departed&select=departed_on,profession,people!inner(display_name,notes)&order=departed_on.desc");
  return {
    currentMembers: current.map((row: any) => ({ name: row.people.display_name, profession: row.profession || "" })),
    departed: departed.map((row: any) => ({ name: row.people.display_name, confirmedAt: row.departed_on, note: row.people.notes || "" })),
  };
}

async function memberDepartureApi(request: Request, context: Context) {
  leadership(context);
  if (request.method === "GET") return memberDepartureState();
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  const name = String(body.name || "").replace(/\s+/g, "");
  if (!name || String(body.confirmName || "").replace(/\s+/g, "") !== name) throw new Error("確認姓名不一致：請重新輸入完整姓名");
  const people = await db(`people?display_name=eq.${encodeURIComponent(name)}&select=id,status,notes&limit=1`);
  const person = people?.[0];
  if (!person) throw new Error(`${name} 不在會員主檔中`);
  const members = await db(`members?person_id=eq.${person.id}&select=id,status,departed_on&limit=1`);
  const member = members?.[0];
  if (!member) throw new Error(`${name} 沒有會員主檔`);
  if (body.action === "register") {
    const confirmedAt = String(body.confirmedAt || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedAt) || confirmedAt > new Date().toISOString().slice(0, 10)) throw new Error("離會確認日不正確或在未來");
    if (member.status === "departed") throw new Error(`${name} 已在離會名單中`);
    await db(`members?id=eq.${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "departed", departed_on: confirmedAt }) });
    await db(`people?id=eq.${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "departed", notes: String(body.note || "").trim().slice(0, 120) }) });
    return { message: `${name} 已登記離會；下次產出分析會自動排除`, state: await memberDepartureState() };
  }
  if (body.action === "undo") {
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

async function callProvider(provider: Provider, apiKey: string, system: string, prompt: string, maxTokens = 1000) {
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
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`, { method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }) });
    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      assertCompleteAiResponse(provider, payload);
      return { text: (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || "").join("\n").trim(), model: MODELS.gemini };
    }
  } else {
    response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.anthropic, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }) });
    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      assertCompleteAiResponse(provider, payload);
      return { text: (payload?.content || []).filter((item: any) => item?.type === "text").map((item: any) => item.text).join("\n").trim(), model: MODELS.anthropic };
    }
  }
  throw new Error(`AI 平台回應失敗：${String(payload?.error?.message || payload?.error?.status || `HTTP ${response.status}`).slice(0, 180)}`);
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
  const half = latestByCategory(imports, "halfYear") || imports.find((row: any) => row.report_type === "half_year_palms" && !/annual/i.test(JSON.stringify(row.metadata || {})));
  const expiry = latestByCategory(imports, "membership");
  const tenure = latestByCategory(imports, "tenure");
  if (!half || !expiry || !tenure) throw new Error("正式分析需要半年 PALMS、會員到期日與會齡三份基準報表，Private Storage 目前不完整");
  const [halfText, expiryText, tenureText] = await Promise.all([downloadReport(half), downloadReport(expiry), downloadReport(tenure)]);
  const annualRow = latestByCategory(imports, "annual");
  const annual = annualRow ? parsePalmsText(await downloadReport(annualRow), annualRow.storage_path) : null;
  const allAuditRows = imports.filter((row: any) => reportCategory(row) === "audit" && auditDate(row));
  const latestAuditMonth = allAuditRows.map((row: any) => auditDate(row).slice(0, 7)).sort().at(-1) || null;
  const auditRows = allAuditRows.filter((row: any) => auditDate(row).startsWith(latestAuditMonth)).slice(0, 8);
  const audits = [];
  for (const row of auditRows) audits.push(parseAuditWeekText(await downloadReport(row), row.storage_path));
  const departedRows = await db("members?status=eq.departed&select=departed_on,people!inner(display_name)");
  const departed = departedRows.map((row: any) => ({ name: String(row.people.display_name).replace(/\s+/g, ""), confirmedAt: row.departed_on }));
  const sources = [half, expiry, tenure, ...(annualRow ? [annualRow] : []), ...auditRows].map((row: any) => ({ path: `Private Storage/${row.storage_path}`, sha256: row.sha256?.slice(0, 12) || null, modifiedAt: row.imported_at }));
  return {
    engine: buildAnalysisFromParsed({
      palms: parsePalmsText(halfText, half.storage_path),
      expiry: parseExpiryText(expiryText, expiry.storage_path),
      tenure: parseTenureText(tenureText, tenure.storage_path),
      departed,
      annual,
      auditMonth: audits.length ? combineAuditWeeks(audits) : null,
      auditMonthName: latestAuditMonth,
      sources,
    }),
  };
}

const REVIEW_SYSTEM = "你是 BNI 富聯分會會員委員會的月度分析審視員。引擎數據是唯一數據來源：不得重算分數、修改燈號或發明數據。審計觀察必須用關懷語言，不得指控。不得作資格處置、續約核准或投票建議。輸出繁體中文 Markdown 六區關懷報告，結尾標注本報告為草稿，需副主席確認後才正式發佈。";

async function currentDraft() {
  const rows = await db("analysis_snapshots?is_published=eq.false&analysis_version=like.draft-%25&select=*&order=generated_at.desc&limit=1");
  return rows?.[0] || null;
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
    if (engine.aborted) throw Object.assign(new Error("對帳未通過，未產生草稿（先對帳，後分析）"), { status: 409, issues: engine.reconciliation.issues });
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
  if (body.action === "reject") {
    const reason = String(body.reason || "").trim().slice(0, 2000);
    if (!reason) throw new Error("退回重做必須附上原因");
    draft.feedback = [...(draft.feedback || []), { reason, at: new Date().toISOString(), by: context.identity }];
    await db(`analysis_snapshots?id=eq.${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ snapshot: { draft } }) });
    return { draft, message: "已記錄退回原因；重新執行 AI 審視時會一併帶入" };
  }
  if (body.action === "ai-review") {
    const provider = body.provider as Provider;
    if (!PROVIDERS.includes(provider)) throw new Error("AI 平台不正確");
    const previous = await latestPublished();
    const prompt = `前一期正式資料：\n${JSON.stringify(previous?.snapshot?.analysisReview || null)}\n\n副主席退回回饋：\n${JSON.stringify(draft.feedback || [])}\n\n本期引擎結果（唯一數據來源）：\n${JSON.stringify(draft.engine)}`;
    const result = await callProvider(provider, await credential(context.personId, provider), REVIEW_SYSTEM, prompt, REVIEW_MAX_TOKENS);
    draft.aiReview = { provider, model: result.model, text: result.text, generatedAt: new Date().toISOString(), promptChars: prompt.length, feedbackCount: (draft.feedback || []).length };
    await db(`analysis_snapshots?id=eq.${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ snapshot: { draft } }) });
    return { draft };
  }
  if (body.action === "publish") {
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
  leadership(context);
  const rows = await db("committee_meetings?select=id");
  if (request.method === "GET") return { meetings: rows.length };
  if (request.method !== "POST") throw Object.assign(new Error("不支援的操作"), { status: 405 });
  const body = await requestBody(request);
  if (body.confirmation !== "RESET_FULIAN_TEST_DATA") throw new Error("缺少測試資料清除確認");
  await db("committee_meetings?id=not.is.null", { method: "DELETE" });
  return { meetings: rows.length, message: "Supabase 月會測試資料已清除" };
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
    else if (path === "/api/member-departure") result = await memberDepartureApi(request, context);
    else if (path === "/api/ai-settings") result = await aiSettingsApi(request, context);
    else if (path === "/api/ai-chat") result = await aiChatApi(request, context);
    else if (path === "/api/analysis-draft") result = await analysisDraftApi(request, context);
    else if (path === "/api/analysis-snapshots") result = await analysisSnapshotsApi(context);
    else if (path === "/api/company") result = await companyApi(url);
    else if (path === "/api/test-data-reset") result = await testResetApi(request, context);
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
