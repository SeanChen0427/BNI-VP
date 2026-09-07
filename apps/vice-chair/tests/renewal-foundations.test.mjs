import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import domain from "../core/renewal-foundation-domain.js";
import { createRenewalFoundationsApi } from "../../../supabase/functions/app-api/renewal-foundations.mjs";
import { foundationVisitorCount, foundationCoverage } from "../../bni-analysis/engine/foundation-progress.mjs";
import { createFoundationMeasurements } from "../../../supabase/functions/app-api/foundation-measurements.mjs";

const ids = Array.from({ length: 7 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const [id, sourceId, memberId, vpId, leadId, companionId, otherId] = ids;
const vp = { role: "vp", personId: vpId, name: "測試副主席" };
const lead = { role: "committee", personId: leadId, name: "測試主責" };
const companion = { role: "committee", personId: companionId, name: "測試陪同" };
const other = { role: "committee", personId: otherId, name: "其他委員" };
const base = () => ({ title: "指定培訓", criterion: "完成約定課程並提供證明", source: "測試決議與確認依據", dueOn: "2026-09-07", nextCheckOn: "2026-09-05", leadId, companionIds: [companionId], leadName: lead.name, companionNames: [companion.name], memberName: "測試會員", caseId: "RE-TEST", status: "tracking", reminderCount: 0 });

test("續約地基以台北日期提示，逾期不自行改變達成或會員狀態", () => {
  const value = { ...base(), nextCheckOn: "2026-09-07" };
  assert.equal(domain.attention(value, "2026-09-06T16:00:00Z").key, "check");
  assert.equal(domain.attention(value, "2026-09-07T15:59:59Z").key, "check");
  assert.equal(domain.attention(value, "2026-09-07T16:00:00Z").key, "overdue");
  assert.equal(value.status, "tracking");
  assert.equal(domain.attention({ ...value, status: "achieved" }, "2026-10-01").key, "resolved");
  assert.equal(domain.attention({ ...value, status: "unmet" }, "2026-10-01").key, "unmet");
  assert.equal(domain.attention({ ...value, handoverPending: true }, "2026-09-01").key, "handover");
  assert.equal(domain.attention({ ...value, nextCheckOn: "2026-09-06" }, "2026-09-01").key, "soon");
});

test("條件不補造門檻，日期及主陪同必須有效", () => {
  for (const invalid of [{ criterion: "" }, { dueOn: "2026-02-30" }, { nextCheckOn: "x" }, { companionIds: [leadId] }, { companionIds: [vpId, companionId, otherId] }]) {
    assert.throws(() => domain.definition({ ...base(), ...invalid }));
  }
  assert.equal(domain.definition(base()).criterion, base().criterion);
});

test("提醒必須記錄實際日期、方式與回覆，補記較早提醒不倒退最近日期", () => {
  const value = { ...base(), lastRemindedOn: "2026-09-06", reminderCount: 1 };
  const input = { action: "reminder", note: "已告知條件與期限", contactedOn: "2026-09-04", channel: "電話", response: "尚未回覆" };
  const { next, detail } = domain.transition(value, input, companion, "2026-09-07");
  assert.equal(next.lastRemindedOn, "2026-09-06");
  assert.equal(next.reminderCount, 2);
  assert.equal(detail.response, "尚未回覆");
  assert.throws(() => domain.transition(value, { ...input, contactedOn: "2026-09-08" }, lead, "2026-09-07"));
  assert.throws(() => domain.transition(value, { ...input, response: "" }, lead, "2026-09-07"));
  assert.throws(() => domain.transition(value, { ...input, nextCheckOn: "2026-09-08" }, companion, "2026-09-07"), /只有主責/);
  domain.reminderText(value);
  assert.equal(value.reminderCount, 1, "複製文案不算已提醒");
});

test("主責回報與副主席人工確認分開，陪同與未指派委員不能越權", () => {
  const input = { action: "progress", note: "收到完成證明", status: "reported", nextCheckOn: "2026-09-08" };
  assert.equal(domain.transition(base(), input, lead).next.status, "reported");
  assert.throws(() => domain.transition(base(), input, companion), /只有主責/);
  assert.throws(() => domain.transition(base(), input, other), /受指派/);
  assert.throws(() => domain.transition(base(), { ...input, action: "resolve", status: "achieved" }, lead), /僅限/);
  const achieved = domain.transition(base(), { ...input, action: "resolve", status: "achieved" }, vp).next;
  assert.throws(() => domain.transition(achieved, { action: "note", note: "改寫" }, vp), /重新開啟/);
  assert.equal(domain.transition(achieved, { action: "reopen", note: "證據需補充", nextCheckOn: "2026-09-09" }, vp).next.status, "tracking");
  assert.throws(() => domain.transition({ ...base(), status: "unmet" }, input, lead), /重新開啟/);
});

function fixture({ hasRenewal = true } = {}) {
  const rows = new Map(), events = [], writes = [], assignments = [];
  const directory = {
    personByName: new Map([[vp.name, vpId], [lead.name, leadId], [companion.name, companionId], [other.name, otherId]]),
    personById: new Map([[vpId, vp.name], [leadId, lead.name], [companionId, companion.name], [otherId, other.name]]),
    memberById: new Map([[memberId, { name: "測試會員", status: "active" }]]),
  };
  async function db(path, options = {}) {
    if (path.startsWith("task_assignments?")) return assignments;
    if (path.startsWith("tasks?")) return !hasRenewal ? [] : [{ id: sourceId, member_id: memberId, source_reference: "RE-TEST", status: "completed" }];
    if (path.startsWith("renewal_foundation_events?")) return events;
    if (path.startsWith("renewal_foundations?")) return path.includes("id=eq.") ? [...rows.values()].filter(row => path.includes(row.id)) : [...rows.values()];
    if (path === "rpc/edge_save_renewal_foundation") {
      const data = JSON.parse(options.body), old = rows.get(data.p_id);
      if ((old?.revision || 0) !== data.p_revision) throw new Error("revision conflict");
      writes.push(data);
      rows.set(data.p_id, { id: data.p_id, member_id: data.p_member_id, source_task_id: data.p_source_task_id, revision: data.p_revision + 1, status: data.p_data.status, data: data.p_data, due_on: data.p_data.dueOn, next_check_on: data.p_data.nextCheckOn });
      events.push({ actor_name: data.p_actor_name, detail: data.p_detail, previous_data: old?.data, next_data: data.p_data });
      return data.p_revision + 1;
    }
    throw new Error(`Unexpected route: ${path}`);
  }
  const api = createRenewalFoundationsApi({ db, taskDirectory: async () => directory, taskSource: "vice-chair-work-plan" });
  const call = (context, body, query = "") => api(new Request(`http://local/api/renewal-foundations${query}`, body ? { method: "POST", body: JSON.stringify(body) } : {}), context);
  const create = () => call(vp, { ...base(), action: "create", sourceTaskId: sourceId, id });
  return { call, create, rows, writes, events, directory, assignments };
}

test("API 可從已結案續約建立獨立地基，其他委員僅得摘要，完整紀錄受保護", async () => {
  const f = fixture();
  await assert.rejects(f.call(lead, { ...base(), action: "create", sourceTaskId: sourceId, id }), /只有副主席/);
  await f.create();
  const general = await f.call(other);
  assert.equal(general.items[0].criterion, undefined);
  assert.equal(general.items[0].source, undefined);
  assert.equal(general.sources.length, 0);
  assert.equal((await f.call(lead)).items[0].criterion, base().criterion);
  await assert.rejects(f.call(other, null, `?id=${id}`), /完整追蹤/);
  assert.equal((await f.call(companion, null, `?id=${id}`)).events.length, 1);
  assert.equal(f.writes[0].p_source_task_id, sourceId);
  assert.equal(f.writes[0].p_actor_name, vp.name);
});

test("API 拒絕舊版覆寫、冒名、變更會員與無效追蹤人，並保留重新指派歷程", async () => {
  const f = fixture();
  await f.create();
  await assert.rejects(f.call(vp, { id, revision: 0, action: "note", note: "舊資料" }), /其他人更新/);
  await assert.rejects(f.call(other, { id, revision: 1, action: "note", note: "越權" }), /受指派/);
  await assert.rejects(f.call(vp, { ...base(), id, revision: 1, action: "amend", leadId: memberId, note: "錯誤指派" }), /當期有效/);
  f.directory.personByName.delete(lead.name);
  assert.equal((await f.call(vp)).items[0].handoverPending, true);
  await f.call(vp, { ...base(), id, revision: 1, action: "amend", leadId: otherId, note: "換屆接手", memberName: "冒名會員", sourceTaskId: memberId, actorName: "偽造操作者" });
  assert.equal(f.events[1].previous_data.leadId, leadId);
  assert.equal(f.events[1].next_data.leadId, otherId);
  assert.equal(f.events[1].next_data.memberName, "測試會員");
  assert.equal(f.events[1].actor_name, vp.name);
  assert.equal((await f.call(lead)).items[0].canReadDetail, false);
  assert.equal((await f.call(other)).items[0].canReadDetail, true);
  assert.equal(f.writes.length, 2);
});

test("SQL 交易將版本檢查與稽核一起保存，前端角色無法直寫且不變更會籍", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260907090000_renewal_foundation_tracking.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/i);
  assert.match(sql, /v_previous\.revision <> p_revision/);
  assert.match(sql, /insert into public\.renewal_foundation_events/);
  assert.match(sql, /revoke all on table public\.renewal_foundations, public\.renewal_foundation_events from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.edge_save_renewal_foundation[^;]+from public, anon, authenticated/);
  assert.doesNotMatch(sql, /(?:update|delete from) public\.(?:members|tasks|renewal_foundation_events)\b/);
});

test("從續約日起每 3 個月檢視，前期未確認不消失，確認本期不完成下一期", () => {
  const value = { ...base(), kind: "quarterly_workshop", startOn: "2026-11-15", dueOn: "2027-11-15", nextCheckOn: "2026-11-15" };
  assert.equal(domain.attention(value, "2026-11-14").key, "scheduled");
  assert.deepEqual(domain.cycles(value, "2027-02-15").map(cycle => [cycle.start, cycle.end]), [["2026-11-15", "2027-02-14"], ["2027-02-15", "2027-05-14"]]);
  assert.equal(domain.cycles(value, "2028-01-01").length, 4, "期限當日不另生第五期");
  const input = { action: "confirm-quarter", periodKey: "2026-11-15", attendedOn: "2026-12-20", status: "achieved", note: "已核對培訓簽到證明" };
  const confirmed = domain.transition(value, input, vp, "2027-01-01").next;
  assert.equal(domain.attention(confirmed, "2027-01-01").key, "quarter_confirmed");
  assert.equal(domain.attention(confirmed, "2027-02-15").key, "quarter_pending");
  assert.equal(domain.cycles(confirmed, "2027-02-15")[1].result, null);
  assert.throws(() => domain.transition(value, input, lead, "2027-01-01"), /僅限/);
  assert.throws(() => domain.transition(value, { ...input, attendedOn: "2026-11-14" }, vp, "2027-01-01"), /參加日期/);
  assert.throws(() => domain.transition(value, { ...input, periodKey: "2027-02-15" }, vp, "2027-01-01"), /已開始/);
  assert.throws(() => domain.transition(value, { action: "resolve", status: "achieved", note: "完成" }, vp), /不能一次完成整年/);
});

test("每月來賓逐期核對，超額不挪至下月，缺資料不當成零，續約前半年才啟動累計型", () => {
  const value = { ...base(), kind: "monthly_visitors", startOn: "2026-10-01", dueOn: "2027-10-01", target: 1, periodMeasurements: { "2026-10-01": { current: 3 }, "2026-11-01": { current: 0 } } };
  assert.equal(domain.attention(value, "2026-09-30").key, "scheduled");
  assert.match(domain.attention(value, "2026-11-20").label, /第 2 月/);
  assert.match(domain.progressText(value, "2026-12-01"), /資料待補/);
  assert.equal(domain.cycles(value, "2027-10-01").length, 12);
  const cumulative = { ...value, kind: "visitors", target: 4 };
  assert.equal(domain.trackingStartsOn(cumulative), "2027-04-01");
  assert.equal(domain.attention(cumulative, "2027-03-31").key, "scheduled");
  assert.equal(domain.attention(cumulative, "2027-04-01").key, "visitor_tracking");
});

const report = (id, start, end, visitors, importedAt = "2026-12-01") => ({ id, start, end, importedAt, parsed: { period: { start, end }, members: [{ name: "測試會員", visitors }] } });
test("來賓只從唯一對帳、完整且不重疊的 PALMS 加總，缺月與索引不符即停止顯示數字", () => {
  const reports = [report("old", "2026-10-01", "2026-10-31", 9, "2026-11-01"), report("oct", "2026-10-01", "2026-10-31", 1), report("nov", "2026-11-01", "2026-11-30", 2), report("overlap", "2026-09-01", "2026-11-30", 20)];
  const input = { memberName: "測 試會員", start: "2026-10-01", end: "2026-11-30", reports };
  const value = foundationVisitorCount(input);
  assert.equal(value.current, 3);
  assert.deepEqual(value.sources.map(source => source.id), ["oct", "nov"]);
  assert.match(value.formula, /= 3 位/);
  assert.equal(foundationVisitorCount({ ...input, reports: reports.filter(row => row.id !== "nov") }).current, null);
  assert.equal(foundationVisitorCount({ ...input, memberName: "不在名單" }).current, null);
  const bad = report("bad", "2026-10-01", "2026-11-30", 8); bad.parsed.period.end = "2026-10-31";
  assert.equal(foundationVisitorCount({ ...input, reports: [bad] }).current, null);
  const dup = report("dup", "2026-10-01", "2026-11-30", 3); dup.parsed.members.push({ name: "測試會員", visitors: 2 });
  assert.equal(foundationVisitorCount({ ...input, reports: [dup] }).current, null);
  const alternate = [...reports, report("dead-end", "2026-10-01", "2026-11-15", 5)];
  assert.equal(foundationCoverage({ ...input, reports: alternate }).complete, true, "不能貪婪選擇無法接續的最長片段");
});

test("本期無 PALMS 時仍回傳待補，解析失敗不偽造目前人數", async () => {
  const value = { ...base(), kind: "monthly_visitors", startOn: "2026-10-01", dueOn: "2027-10-01", target: 1 };
  const measure = createFoundationMeasurements({ reportImports: async () => [], reportCategory: () => "monthly", downloadReport: async () => { throw new Error("不應下載"); } });
  const [result] = await measure([value], "2026-11-04");
  assert.equal(result.periodMeasurements["2026-10-01"].current, null);
  assert.equal(result.periodMeasurements["2026-11-01"].current, null);
  assert.match(result.periodMeasurements["2026-11-01"].reason, /尚無正式/);
});

test("受派新訪談可讀取同會員舊地基，但不能修改舊追蹤；月會只保存必要摘要", async () => {
  const f = fixture();
  await f.create();
  assert.equal((await f.call(other, null, "?summary=1&contextTask=RE-TEST")).items[0].canReadDetail, false);
  f.assignments.push({ person_id: otherId });
  const interview = await f.call(other, null, "?summary=1&contextTask=RE-TEST");
  assert.equal(interview.items[0].criterion, base().criterion);
  assert.equal(interview.items[0].canRecord, false);
  await assert.rejects(f.call(other, { id, revision: 1, action: "note", note: "修改原地基" }), /受指派/);
  const { snapshot } = await f.call(vp, null, "?meeting=1");
  assert.ok(snapshot.capturedAt);
  assert.equal(snapshot.items[0].source, undefined);
  assert.equal(snapshot.items[0].criterion, undefined);
  const prior = JSON.stringify(snapshot);
  await f.call(vp, { ...base(), id, revision: 1, action: "amend", note: "調整名稱", title: "新版標題" });
  assert.equal(JSON.stringify(snapshot), prior, "已擷取月會紀錄不跟著地基後續變更");
  await assert.rejects(f.call(other, null, "?meeting=1"), /僅限副主席/);
});


test("無續約案件的在籍會員可補登既有地基，日期不重設且會員與登錄來源由後端固定", async () => {
  const f = fixture({ hasRenewal: false });
  const input = { ...base(), id, action: "create", origin: "legacy", memberId, memberName: "偽造姓名", kind: "quarterly_workshop", startOn: "2026-02-15", dueOn: "2027-02-15", status: "achieved", periodResults: { "2026-02-15": { status: "achieved" } }, actorName: "偽造操作者" };
  assert.equal((await f.call(vp)).sources.length, 0);
  assert.deepEqual((await f.call(vp)).members, [{ id: memberId, name: "測試會員" }]);
  assert.deepEqual((await f.call(other)).members, []);
  await assert.rejects(f.call(lead, input), /只有副主席/);
  await assert.rejects(f.call(vp, { ...input, origin: "unknown" }), /來源無效/);
  await assert.rejects(f.call(vp, { ...input, sourceTaskId: sourceId }), /不連結續約案件/);
  await assert.rejects(f.call(vp, { ...input, memberId: otherId }), /有效在籍會員/);
  f.directory.memberById.get(memberId).status = "departed";
  assert.deepEqual((await f.call(vp)).members, []);
  await assert.rejects(f.call(vp, input), /有效在籍會員/);
  f.directory.memberById.get(memberId).status = "active";
  await f.call(vp, input);
  const row = f.rows.get(id);
  assert.equal(row.source_task_id, null);
  assert.equal(row.member_id, memberId);
  assert.equal(row.data.memberName, "測試會員");
  assert.equal(row.data.caseId, null);
  assert.equal(row.data.origin, "legacy");
  assert.equal(row.data.status, "tracking");
  assert.equal(row.data.startOn, "2026-02-15");
  assert.equal(row.data.periodResults, undefined, "補登不能偷偷標記歷史已達成");
  assert.equal(domain.cycles(row.data, "2026-09-07").length, 3);
  assert.equal(f.events[0].actor_name, vp.name);
  assert.match(f.events[0].detail.note, /補登/);
  await f.call(vp, { ...input, action: "amend", revision: 1, origin: "renewal", sourceTaskId: sourceId, memberId: otherId, note: "補充原約定證據" });
  assert.equal(f.rows.get(id).source_task_id, null);
  assert.equal(f.rows.get(id).member_id, memberId);
  assert.equal(f.rows.get(id).data.origin, "legacy");
  assert.equal((await f.call(vp)).items[0].memberId, memberId);
  assert.equal((await f.call(other)).items[0].criterion, undefined);
});


test("結構化地基可省略文字，自動產生標題與標準，不補造議定證據", () => {
  const input = { ...base(), kind: "monthly_visitors", startOn: "2026-10-01", dueOn: "2027-10-01", target: 2, title: "", criterion: "", source: "" };
  const value = domain.definition(input);
  assert.equal(value.title, "每月 2 位來賓");
  assert.equal(value.criterion, "每月 2 位來賓，各月分開計算");
  assert.equal(value.source, "");
  assert.equal(value.titleGenerated, true);
  assert.equal(domain.definition({ ...input, kind: "quarterly_workshop" }).title, "每 3 個月 1 場工作坊");
  assert.equal(domain.definition({ ...input, kind: "visitors", target: 4 }).title, "續約前累計 4 位來賓");
  const custom = domain.definition({ ...input, title: "自訂摘要", criterion: "另有約定", source: "補充依據" });
  assert.equal(custom.title, "自訂摘要");
  assert.equal(custom.titleGenerated, false);
  assert.throws(() => domain.definition({ ...input, title: "長".repeat(161) }), /最多/);
  assert.throws(() => domain.definition({ ...input, kind: "manual" }), /完成標準/);
  assert.equal(domain.definition({ ...input, kind: "manual", criterion: "完成指定事項" }).title, "其他地基");
});

test("同會員兩項地基獨立保存，確認工作坊不改動每月來賓", async () => {
  const f = fixture({ hasRenewal: false });
  const common = { ...base(), action: "create", origin: "legacy", memberId, startOn: "2026-01-01", dueOn: "2027-01-01", target: 1, title: "", criterion: "", source: "" };
  await f.call(vp, { ...common, id, kind: "monthly_visitors" });
  await f.call(vp, { ...common, id: otherId, kind: "quarterly_workshop" });
  assert.equal((await f.call(vp)).items.length, 2);
  assert.equal(f.rows.get(id).data.title, "每月 1 位來賓");
  await f.call(vp, { id: otherId, revision: 1, action: "confirm-quarter", periodKey: "2026-01-01", attendedOn: "2026-02-03", status: "achieved", note: "核對該期簽到" });
  assert.equal(f.rows.get(otherId).data.periodResults["2026-01-01"].status, "achieved");
  assert.equal(f.rows.get(id).revision, 1);
  assert.equal(f.rows.get(id).data.periodResults, undefined);
  assert.equal(f.rows.get(id).data.status, "tracking");
});

const flexible = (extra = {}) => ({ ...base(), kind: "flexible", metric: "visitors", cadence: "recurring", intervalMonths: 3, leadMonths: 0, startOn: "2026-01-31", dueOn: "2027-01-31", target: 2, title: "", criterion: "", ...extra });

test("自由地基支援三種指標、多種週期、累計啟動時間及有效目標", () => {
  for (const metric of ["visitors", "ceu", "workshop"]) for (const intervalMonths of [1, 2, 3, 6, 12]) {
    const value = domain.definition(flexible({ metric, intervalMonths }));
    assert.equal(value.intervalMonths, intervalMonths);
    assert.equal(value.metric, metric);
    assert.ok(value.title);
    assert.equal(value.nextCheckOn, value.startOn);
  }
  const cumulative = domain.definition(flexible({ metric: "ceu", cadence: "cumulative", target: 20.5, leadMonths: 6 }));
  assert.equal(cumulative.nextCheckOn, "2026-07-31");
  assert.equal(cumulative.intervalMonths, 0);
  assert.equal(domain.attention(cumulative, "2026-07-30").key, "scheduled");
  for (const invalid of [{ target: 0 }, { target: 1.5 }, { metric: "ceu", target: 1.001 }, { intervalMonths: 0 }, { intervalMonths: 1.5 }, { intervalMonths: 37 }, { leadMonths: 6 }, { metric: "score" }, { cadence: "weekly" }]) assert.throws(() => domain.definition(flexible(invalid)));
});

test("月底起算不漂移，半年各期獨立，舊期缺口持續呈現", () => {
  const value = { ...domain.definition(flexible({ intervalMonths: 1 })), status: "tracking" };
  const periods = domain.cycles(value, "2026-04-01");
  assert.deepEqual(periods.map(p => [p.start, p.end]), [["2026-01-31", "2026-02-27"], ["2026-02-28", "2026-03-30"], ["2026-03-31", "2026-04-29"]]);
  value.periodMeasurements = { "2026-03-31": { current: 2 } };
  assert.equal(domain.attention(value, "2026-04-01").rank, 0);
  assert.match(domain.compactProgress(value, "2026-04-01"), /另有 2 期/);
  assert.deepEqual(domain.cycles(flexible({ intervalMonths: 6 }), "2026-09-01").map(p => p.start), ["2026-01-31", "2026-07-31"]);
  const cumulative = { ...domain.definition(flexible({ cadence: "cumulative" })), measurement: { current: 2 } };
  assert.equal(domain.cycles(cumulative, "2026-09-01").length, 1);
  assert.equal(domain.attention(cumulative, "2026-09-01").label, "累計數據達標・待確認");
});

test("工作坊多場須副主席逐期核對，變更目標不沿用不足場次的完成判定", () => {
  const value = { ...flexible({ metric: "workshop", startOn: "2026-01-01" }), status: "tracking" };
  const input = { action: "confirm-quarter", periodKey: "2026-01-01", attendedOn: "2026-02-04", status: "achieved", completedCount: 2, note: "核對兩場參加證據" };
  assert.throws(() => domain.transition(value, { ...input, completedCount: 1 }, vp, "2026-03-01"), /場次/);
  assert.throws(() => domain.transition(value, input, lead, "2026-03-01"), /僅限副主席/);
  const { next } = domain.transition(value, input, vp, "2026-03-01");
  assert.equal(domain.attention(next, "2026-03-01").rank, 4);
  assert.equal(domain.attention({ ...next, target: 3 }, "2026-03-01").rank, 1);
  assert.throws(() => domain.transition(value, { action: "resolve", status: "achieved", note: "全期完成" }, vp), /逐期/);
  assert.throws(() => domain.transition(value, { ...value, action: "amend", intervalMonths: 6, note: "改週期" }, vp), /週期不可改寫/);
  assert.equal(domain.cycleReached({ kind: "quarterly_workshop", target: 1 }, { result: { status: "achieved" } }), true);
});

test("培訓採原始教育單位，空值不能當零，完整期間不重複加總", async () => {
  const { foundationMetricCount } = await import("../../bni-analysis/engine/foundation-progress.mjs");
  const report = (id, start, end, ceu, ceuRecorded = true) => ({ id, start, end, parsed: { period: { start, end }, members: [{ name: "測試會員", ceu, ceuRecorded, visitors: 2 }] } });
  const input = { memberName: "測試會員", start: "2026-01-01", end: "2026-02-28", metric: "ceu", reports: [report("a", "2026-01-01", "2026-01-31", 10.25), report("b", "2026-02-01", "2026-02-28", 2.5)] };
  assert.equal(foundationMetricCount(input).current, 12.75);
  assert.equal(foundationMetricCount({ ...input, reports: [...input.reports, report("combined", input.start, input.end, 12.75)] }).current, 12.75);
  for (const amount of [null, NaN, -1]) assert.equal(foundationMetricCount({ ...input, reports: [report("a", input.start, input.end, amount)] }).current, null);
  assert.equal(foundationMetricCount({ ...input, reports: [report("a", input.start, input.end, 0, false)] }).current, null);
  assert.equal(foundationMetricCount({ ...input, reports: [report("a", input.start, input.end, 0)] }).current, 0);
  assert.equal(foundationMetricCount({ ...input, reports: [input.reports[0]] }).current, null);
});

test("同名不同會員不混合，同會員各項資料與權限獨立，月會只帶必要摘要", async () => {
  const f = fixture({ hasRenewal: false });
  const common = { ...flexible({ startOn: "2026-01-01", dueOn: "2027-01-01" }), action: "create", origin: "legacy", memberId };
  await f.call(vp, { ...common, id });
  await f.call(vp, { ...common, id: otherId, metric: "ceu", leadId: vpId, companionIds: [] });
  const result = await f.call(lead);
  const groups = domain.groupByMember(result.items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(result.items.find(item => item.id === otherId).canReadDetail, false);
  await assert.rejects(f.call(lead, { id: otherId, revision: 1, action: "note", note: "未受派不可編輯" }), /受指派/);
  assert.equal(domain.groupByMember([...result.items, { ...result.items[0], memberId: "another-member" }]).length, 2);
  assert.equal(domain.summaryText(result.items).split("測試會員").length - 1, 1);
  const { snapshot } = await f.call(vp, null, "?meeting=1");
  assert.equal(snapshot.items[0].memberId, memberId);
  assert.equal(snapshot.items[0].dueOn, "2026-12-31");
  assert.equal(snapshot.items[0].criterion, undefined);
});

test("PALMS 解析與正式量測串接培訓，兩個地基共用報表但不共用結果", async () => {
  const { parsePalmsText } = await import("../../bni-analysis/engine/parse-reports.mjs");
  const row = cells => `<Row>${cells.map(([index, value]) => `<Cell ss:Index="${index}"><Data ss:Type="String">${value}</Data></Cell>`).join("")}</Row>`;
  const xml = ceu => `<Workbook><Worksheet><Table>${row([[1,"從:"],[2,"2026-01-01T00:00:00"]])}${row([[1,"至:"],[2,"2026-01-31T00:00:00"]])}${row([[1,"姓氏"],[2,"名字"]])}${row([[1,"測試"],[2,"會員"],[16,"3"],[20,ceu]])}</Table></Worksheet></Workbook>`;
  assert.equal(parsePalmsText(xml("")).members[0].ceuRecorded, false);
  assert.equal(parsePalmsText(xml("無")).members[0].ceuRecorded, false);
  assert.equal(parsePalmsText(xml("0")).members[0].ceuRecorded, true);
  let downloads = 0;
  const measure = createFoundationMeasurements({ reportImports: async () => [{ id: "palms-jan", period_start: "2026-01-01", period_end: "2026-01-31" }], reportCategory: () => "monthly", downloadReport: async () => { downloads++; return xml("12.5"); } });
  const common = flexible({ startOn: "2026-01-01", dueOn: "2026-02-01" });
  const [training, visitors] = await measure([{ ...common, metric: "ceu", cadence: "cumulative" }, { ...common, metric: "visitors", intervalMonths: 1 }], "2026-02-10");
  assert.equal(training.measurement.current, 12.5);
  assert.equal(visitors.periodMeasurements["2026-01-01"].current, 3);
  assert.equal(downloads, 1);
  assert.match(domain.reminderText({ ...common, cadence: "cumulative" }), /約定期限：2026-01-31/);
});

test("可修正既有起算日，重新核對受影響期間且保留原確認與提醒歷程", () => {
  for (const kind of ["quarterly_workshop", "monthly_visitors", "visitors", "flexible"]) {
    const value = { ...domain.definition(flexible({ kind, metric: "workshop", startOn: "2026-01-01", dueOn: "2027-01-01" })), status: "tracking", reminderCount: 2, lastRemindedOn: "2026-02-01", periodResults: { "2026-01-01": { status: "achieved", count: 2 }, "2026-04-01": { status: "achieved", count: 2 } }, measurement: { current: 99 }, periodMeasurements: { old: { current: 99 } } };
    const input = { ...value, action: "amend", startOn: "2026-02-01", note: "更正誤填的起算日" };
    const { next, detail } = domain.transition(value, input, vp, "2026-08-01");
    assert.equal(next.startOn, "2026-02-01");
    assert.equal(next.nextCheckOn, domain.trackingStartsOn(next));
    assert.equal(next.measurement, undefined);
    assert.equal(next.periodMeasurements, undefined);
    assert.equal(next.periodResults["2026-01-01"], undefined);
    assert.equal(next.reminderCount, 2);
    assert.equal(value.periodResults["2026-01-01"].status, "achieved");
    assert.equal(detail.scheduleChanged, true);
    assert.throws(() => domain.transition(value, input, lead), /僅限副主席/);
    assert.throws(() => domain.transition(value, { ...input, startOn: "2027-02-01" }, vp), /適用期間/);
  }
});

test("日期更正只沿用完整區間相同的工作坊；已達成的累計改期後重新追蹤", () => {
  const value = { ...domain.definition(flexible({ metric: "workshop", startOn: "2026-01-01", dueOn: "2027-01-01" })), status: "tracking", periodResults: { "2026-01-01": { status: "achieved", count: 2 }, "2026-04-01": { status: "achieved", count: 2 } } };
  const { next, detail } = domain.transition(value, { ...value, action: "amend", startOn: "2026-04-01", note: "前一期不在約定範圍" }, vp);
  assert.deepEqual(Object.keys(next.periodResults), ["2026-04-01"]);
  assert.equal(detail.resetPeriodCount, 1);
  const shortened = domain.transition(value, { ...value, action: "amend", dueOn: "2026-05-01", note: "更正結束日" }, vp).next;
  assert.deepEqual(Object.keys(shortened.periodResults), ["2026-01-01"]);
  const done = { ...domain.definition(flexible({ cadence: "cumulative" })), status: "achieved" };
  assert.equal(domain.transition(done, { ...done, action: "amend", startOn: "2026-02-01", note: "重核期間" }, vp).next.status, "tracking");
});

test("可刪除與復原地基，刪除前狀態保留且非管理者不可操作", () => {
  for (const status of ["tracking", "achieved", "unmet", "cancelled"]) {
    const value = { ...base(), status };
    const { next, detail } = domain.transition(value, { action: "delete", note: "誤建刪除" }, vp, "2026-09-08");
    assert.equal(next.status, "cancelled");
    assert.equal(next.statusBeforeDelete, status);
    assert.equal(detail.operation, "delete");
    assert.ok(next.deletedAt);
    assert.throws(() => domain.transition(next, { action: "note", note: "不可修改已刪除" }, vp), /已刪除/);
    assert.throws(() => domain.transition(next, { action: "restore", note: "復原" }, lead), /僅限副主席/);
    const restored = domain.transition(next, { action: "restore", note: "誤刪復原" }, vp).next;
    assert.equal(restored.status, status);
    assert.equal(restored.deletedAt, undefined);
    assert.throws(() => domain.transition(value, { action: "delete", note: "" }, vp), /本次紀錄/);
  }
});

test("API 刪除逐項生效、排除首頁月會訪談，保留可復原稽核與版本衝突保護", async () => {
  const f = fixture({ hasRenewal: false });
  const input = { ...flexible({ startOn: "2026-01-01" }), origin: "legacy", memberId, action: "create" };
  await f.call(vp, { ...input, id });
  await f.call(vp, { ...input, id: otherId });
  await assert.rejects(f.call(lead, { id, action: "delete", revision: 1, note: "刪除" }), /僅限副主席/);
  await f.call(vp, { id, action: "delete", revision: 1, note: "誤建" });
  for (const query of ["", "?summary=1", "?summary=1&contextTask=RE-TEST"]) assert.deepEqual((await f.call(vp, null, query)).items.map(x => x.id), [otherId]);
  assert.deepEqual((await f.call(vp, null, "?meeting=1")).snapshot.items.map(x => x.id), [otherId]);
  assert.equal((await f.call(vp, null, "?deleted=1")).items[0].id, id);
  await assert.rejects(f.call(lead, null, "?deleted=1"), /僅限副主席/);
  await assert.rejects(f.call(lead, null, `?id=${id}`), /僅限副主席/);
  assert.equal(f.writes.at(-1).p_action, "resolve");
  assert.equal(f.events.at(-1).detail.operation, "delete");
  await assert.rejects(f.call(vp, { id, revision: 1, action: "restore", note: "過期版本" }), /重新整理/);
  await f.call(vp, { id, revision: 2, action: "restore", note: "復原" });
  assert.equal((await f.call(vp)).items.length, 2);
  assert.equal(f.writes.at(-1).p_action, "reopen");
  await f.call(vp, { ...input, id, action: "amend", revision: 3, startOn: "2026-02-01", note: "修正起算" });
  assert.equal(f.events.at(-1).previous_data.startOn, "2026-01-01");
  assert.equal(f.rows.get(id).data.startOn, "2026-02-01");
  assert.equal(f.rows.get(otherId).revision, 1);
});
