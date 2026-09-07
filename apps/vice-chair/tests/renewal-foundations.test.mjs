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
