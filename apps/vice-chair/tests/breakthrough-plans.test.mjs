import test from "node:test";
import assert from "node:assert/strict";
import { scoreMember } from "../../bni-analysis/engine/score.mjs";
import { yellowBreakthrough } from "../../bni-analysis/engine/diagnostics.mjs";
import { buildAnalysisFromParsed } from "../../bni-analysis/engine/analyze.mjs";
import { renderDashboard } from "../../bni-analysis/engine/render-dashboard.mjs";
import { parseBniDashboard } from "../bni-bridge.mjs";

const raw = (changes = {}) => ({ name: "測試會員", present: 26, absent: 0, late: 0, medical: 0, substitute: 0, refGivenInternal: 30, refGivenExternal: 0, refReceivedInternal: 10, refReceivedExternal: 0, oneToOne: 59, visitors: 1, tyfcb: 43900, ceu: 7, ...changes });

test("60分的引薦部分升級不能阻擋同項目補滿至70分", () => {
  for (const [referrals, expected] of [[30, 14], [31, 13]]) {
    const member = scoreMember(raw({ refGivenInternal: referrals }), 26);
    const plan = yellowBreakthrough(member);
    assert.equal(member.total, 60);
    assert.equal(plan.pathCoversGap, true);
    assert.deepEqual(plan.monthlyActions, { referral: expected, oneToOne: 8, education: 0 });
    assert.deepEqual(plan.alternatives, []);
    assert.equal(plan.attendanceReason, null);
    // Verify the suggested month against the real scoring module, including the carried window.
    const carried = (26 - Math.round(26 / 6)) / 26;
    const projected = scoreMember(raw({ refGivenInternal: referrals * carried + expected, oneToOne: 59 * carried + 8 }), 26);
    assert.ok(projected.total >= 70);
  }
});

test("需求量大仍列明確基本數量，不因超過12筆改推來賓或交易", () => {
  const plan = yellowBreakthrough(scoreMember(raw({ refGivenInternal: 0 }), 26));
  assert.equal(plan.highWorkload, true);
  assert.equal(plan.monthlyActions.referral, 39);
  assert.equal(plan.pathCoversGap, true);
  assert.deepEqual(plan.alternatives, []);
});

test("缺席導致三項補滿仍不足70才給替代項，並說明算式", () => {
  const member = scoreMember(raw({ present: 25, absent: 1, refGivenInternal: 39, oneToOne: 52, ceu: 4, tyfcb: 0 }), 26);
  const plan = yellowBreakthrough(member);
  assert.equal(plan.controllableCeiling, 65);
  assert.equal(plan.attendanceBlocksGreen, true);
  assert.match(plan.attendanceReason, /等效缺席 1 次.*15／20.*最高 65 分.*仍差 5 分/);
  assert.ok(plan.alternatives.length);
  assert.ok(plan.controllableCeiling + plan.alternatives.reduce((sum, item) => sum + item.pointsGain, 0) >= 70);
  const notBlocked = yellowBreakthrough(scoreMember(raw({ present: 25, absent: 1, refGivenInternal: 39, oneToOne: 52, ceu: 4, tyfcb: 400000 }), 26));
  assert.equal(notBlocked.controllableCeiling, 70);
  assert.deepEqual(notBlocked.alternatives, []);
});

test("審計結構洞察、明確補量與紅黑分布通過正式橋接呈現", () => {
  const m = raw();
  const period = { start: "2026-04-01", end: "2026-09-30" };
  const engine = buildAnalysisFromParsed({ palms: { members: [m], period }, expiry: { members: [{ name: m.name, expiryDate: "2027-01-01" }] }, tenure: { members: [{ name: m.name, cumulativeStart: "2025-01-01", recentStart: "2025-01-01" }] }, departed: [], asOf: "2026-10-01", sources: [] });
  engine.audit = { month: "2026-09", totals: { events: 20 }, observations: [{ name: m.name, families: ["B"], level: "yellow", evidence: ["提供引薦 10 筆，其中 8 筆（80%）給同一對象"] }] };
  const html = renderDashboard({ engine, version: 8, publishedAt: "2026-10-01T00:00:00Z" });
  const snapshot = parseBniDashboard(html);
  const structural = snapshot.sections.find(s => s.title === "結構性洞察");
  assert.ok(structural.cards.length > 0);
  assert.match(structural.cards[0].detail, /80%/);
  assert.match(structural.cards[0].action, /需求.*後續/);
  const row = snapshot.sections.find(s => s.title === "黃燈突圍計算").tables[0].rows[0];
  assert.match(row[2], /一對一 8 次.*引薦 14 筆.*培訓再補 0 分/);
  assert.doesNotMatch(html, /Mentor/);
  const blocked = yellowBreakthrough(scoreMember(raw({ present: 25, absent: 1, refGivenInternal: 39, oneToOne: 52, ceu: 4, tyfcb: 0 }), 26));
  engine.yellowBreakthroughs = [blocked];
  const blockedHtml = renderDashboard({ engine, version: 8 });
  const blockedRow = parseBniDashboard(blockedHtml).sections.find(s => s.title === "黃燈突圍計算").tables[0].rows[0][2];
  assert.match(blockedRow, /等效缺席 1 次.*最高 65 分.*仍差 5 分/);
  assert.ok(blockedHtml.includes(JSON.stringify(blocked.attendanceReason)), "下載卡也保存完整缺席原因");
  assert.ok(blockedHtml.includes("包含正常參與"));
  engine.distribution = { green: 0, yellow: 0, red: 0, black: 1 };
  const black = parseBniDashboard(renderDashboard({ engine, version: 8, publishedAt: "2026-10-01T00:00:00Z" }));
  assert.equal(black.summary.redCount, 0);
  assert.equal(black.summary.blackCount, 1);
});
