import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { projectCurrentRoster } from "../../bni-analysis/engine/current-roster.mjs";
import { averageMetrics } from "../bni-bridge.mjs";

const section = (title, rows = [], cards = []) => ({ title, tables: rows.length ? [{ headers: ["會員"], rows }] : [], cards, badges: [], note: "" });
const card = name => ({ title: `${name}｜關懷`, detail: "既有證據", action: "關懷" });
function fixture() {
  return { members: [
    { name: "測試甲", light: "綠燈", score: 80, metrics: { absence: 1 }, annualMetrics: { education: 20 } },
    { name: "測試乙", light: "黃燈", score: 55, metrics: { absence: 2 } },
    { name: "測試丙", light: "黑燈", score: 10, metrics: { absence: 5 } },
  ], memberData: { count: 3 }, report: { subheading: "現任 3 人" }, summary: { totalMembers: 3, greenCount: 1, yellowCount: 1, blackCount: 1 },
  stats: [{ label: "綠燈率 1/3", value: 33 }, { label: "紅／黑燈會員", value: 1 }],
  sections: [section("續約雷達", [["測試乙", "", "", "", "", "本月完成續約申請與繳費"], ["測試甲", "", "", "", "", "補培訓即可達標"]]),
    section("黃燈突圍計算", [["測試乙", "55", "培訓"]]), section("燈號關懷", [], [card("測試丙")]),
    section("審計觀察", [], [card("測試乙"), card("測試甲")]), section("期中關懷到點", [], [card("測試乙")])],
    officialDataPending: [{ name: "測試乙" }], analysisReview: { text: "舊母體分析" } };
}

test("離會即移出現役名錄、統計、續約、關懷與選單資料，原快照及剩餘個人計分不變", () => {
  const original = fixture(), before = structuredClone(original);
  const output = projectCurrentRoster(original, [{ name: "測試甲", memberId: "a" }, { name: "測試丙", memberId: "c" }]);
  assert.deepEqual(original, before);
  assert.equal(output.summary.totalMembers, 2);
  assert.equal(output.memberData.count, 2);
  assert.equal(output.summary.greenRate, 50);
  assert.equal(output.summary.yellowCount, 0);
  assert.equal(output.summary.blackCount, 1);
  assert.equal(output.summary.renewalDue, 0);
  assert.equal(output.summary.renewalWarnings, 1);
  assert.equal(output.summary.auditObservations, 1);
  assert.ok(!JSON.stringify(output.sections).includes("測試乙"));
  assert.equal(output.members[0].memberId, "a");
  for (const member of output.members) {
    const source = original.members.find(item => item.name === member.name);
    assert.equal(member.score, source.score);
    assert.equal(member.light, source.light);
    assert.deepEqual(member.metrics, source.metrics);
  }
  assert.deepEqual(output.officialDataPending, []);
  // Undo derives from the original published snapshot, never from a permanently filtered copy.
  assert.equal(projectCurrentRoster(original, original.members).members.length, 3);
});

test("空名單不產生 NaN，未知現任會員或重複姓名停止對帳，不靜默漏人", () => {
  assert.equal(projectCurrentRoster(fixture(), []).summary.greenRate, 0);
  assert.throws(() => projectCurrentRoster(fixture(), [{ name: "未入快照" }]), /對帳失敗/);
  assert.throws(() => projectCurrentRoster(fixture(), [{ name: "測試甲" }, { name: "測試 甲" }]), /重複/);
});

const source = readFileSync(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");
function extract(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf("\nasync function ", start + 1);
  return stripTypeScriptTypes(source.slice(start, end));
}

test("正式快照 API 每次讀最新會籍、同步人數與平均，不覆寫已發布历史", async () => {
  const published = fixture(), before = structuredClone(published);
  let roster = published.members.map((m, index) => ({ id: String(index), people: { display_name: m.name, status: "active" } }));
  const queries = [];
  const context = { projectCurrentRoster, averageMetrics, hasCompletePublishedMemberData: () => true,
    activePublished: async () => ({ snapshot: published }),
    db: async (query, options) => { assert.equal(options, undefined); queries.push(query); return roster; } };
  vm.createContext(context);
  vm.runInContext(extract("withCurrentRoster") + extract("analysisSnapshotApi"), context);
  const request = { method: "GET" };
  assert.equal((await context.analysisSnapshotApi(request, { role: "vp" })).members.length, 3);
  roster = roster.filter(r => r.people.display_name !== "測試乙");
  const current = await context.analysisSnapshotApi(request, { role: "committee" });
  assert.equal(current.members.length, 2);
  assert.equal(current.summary.totalMembers, 2);
  assert.equal(current.memberData.averages.education, 10);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(q => q.includes("status=eq.active")));
  assert.deepEqual(published, before);
});

test("舊分頁不能替離會會員新增一般案件，但離會訪談仍可送出並綁定原會員", async () => {
  const writes = [];
  const context = { cleanTaskInput: input => input, TASK_SOURCE: "test", db: async (q, options) => { writes.push({ q, data: JSON.parse(options.body) }); } };
  vm.createContext(context);
  vm.runInContext(extract("saveLeadershipTask"), context);
  const directory = { people: [{ display_name: "測試乙", status: "departed" }],
    memberById: new Map([["departed-id", { id: "departed-id", name: "測試乙", status: "departed" }]]),
    activeMemberByName: new Map(), departureMemberByName: new Map([["測試乙", "departed-id"]]),
    personByName: new Map([["測試委員", "lead-id"]]) };
  const task = { id: "test-task", member: "測試乙", memberRecordId: "departed-id", lead: "測試委員", companions: [], completed: false };
  for (const type of ["renewal", "midterm", "industry", "special", "new"]) {
    await assert.rejects(context.saveLeadershipTask({ ...task, type }, { name: "管理者" }, directory), /不是現任會員|已離會/);
  }
  assert.equal(writes.length, 0);
  await context.saveLeadershipTask({ ...task, type: "departure" }, { name: "管理者" }, directory);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.p_member, "departed-id");
});
