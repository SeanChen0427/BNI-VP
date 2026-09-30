import assert from "node:assert/strict";
import test from "node:test";
import { resolveRenewalCaseCompletions } from "../../bni-analysis/engine/renewal-case-completions.mjs";
import { renewalRadar } from "../../bni-analysis/engine/diagnostics.mjs";

const member = { id: "member-a", name: "測試會員" };
const snapshot = { id: "v1", is_published: true, published_at: "2026-08-01T00:00:00Z", snapshot: { members: [{ name: member.name, expiryDate: "2026-11-01" }] } };
const closed = { id: "case-a", type: "renewal", member_id: member.id, stage: "closed", created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-25T16:01:00Z" };
const resolve = (cases = [closed], snapshots = [snapshot]) => resolveRenewalCaseCompletions({ cases, snapshots, members: [member], asOf: "2026-10-01" });

test("系統結案排除同次續約，不將中心區同步日冒充結案日", () => {
  const result = resolve();
  assert.equal(result.completions[0].source, "case-closed");
  assert.equal(result.completions[0].completedOn, "2026-09-26");
  assert.equal(result.completions[0].priorExpiryOn, "2026-11-01");
  const input = { activeScored: [{ name: member.name, scores: {}, metrics: {} }], annualByName: null, asOf: "2026-10-01", expiredUnrenewed: [], confirmedRenewals: result.completions };
  assert.deepEqual(renewalRadar({ ...input, expiryByName: new Map([[member.name, { expiryDate: "2026-11-01" }]]) }), []);
  assert.equal(renewalRadar({ ...input, asOf: "2027-10-01", expiryByName: new Map([[member.name, { expiryDate: "2027-11-01" }]]) }).length, 1);
});

test("投票中、已付款、已重開及其他類型案件均不排除續約雷達", () => {
  for (const c of [{ ...closed, stage: "vote" }, { ...closed, stage: "advisor" }, { ...closed, stage: "interview" }, { ...closed, type: "new" }]) assert.deepEqual(resolve([c]).completions, []);
});

test("案例固定使用建立前的歷史到期日，不隨新報表延長而移動", () => {
  const next = { ...snapshot, id: "v2", published_at: "2026-09-20T00:00:00Z", snapshot: { members: [{ name: member.name, expiryDate: "2027-11-01" }] } };
  assert.equal(resolve([closed], [next, snapshot]).completions[0].priorExpiryOn, "2026-11-01");
  assert.equal(resolve([{ ...closed, analysis_snapshot_id: "v1" }], [next, snapshot]).completions[0].sourceSnapshotId, "v1");
});

test("缺少週期證據或姓名不唯一時保留待核對，不以當前到期日猜測", () => {
  assert.equal(resolve([closed], []).unresolved.length, 1);
  const duplicate = { ...snapshot, snapshot: { members: [...snapshot.snapshot.members, ...snapshot.snapshot.members] } };
  assert.equal(resolve([closed], [duplicate]).completions.length, 0);
  assert.equal(resolve([{ ...closed, analysis_snapshot_id: "missing" }]).unresolved.length, 1);
});

test("未來完成日與尚未生效的快照不能提前結束雷達", () => {
  assert.equal(resolve([{ ...closed, completed_at: "2026-10-02T00:00:00Z" }]).completions.length, 0);
  const scheduled = { ...snapshot, snapshot: { ...snapshot.snapshot, analysisCycle: { effectiveOn: "2026-10-01" } } };
  assert.equal(resolve([closed], [scheduled]).completions.length, 0);
});
