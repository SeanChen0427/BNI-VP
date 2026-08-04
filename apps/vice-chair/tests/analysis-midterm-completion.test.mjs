import test from "node:test";
import assert from "node:assert/strict";
import { lifecycleLists } from "../../bni-analysis/engine/diagnostics.mjs";

const activeScored = [{ name: "測試會員", total: 70, light: "green", weeks: 22 }];
const tenureByName = new Map([
  ["測試會員", { cumulativeStart: "2026-02-01", recentStart: null }],
]);

test("入會 5 個月且未完成期中關懷時列入待關懷", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-07-31", { asOf: "2026-08-04" });
  assert.deepEqual(lifecycle.midterm.map((item) => item.name), ["測試會員"]);
  assert.deepEqual(lifecycle.completedMidterm, []);
});

test("同一入會週期已完成期中關懷時排除待關懷", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-07-31", {
    asOf: "2026-08-04",
    midtermCompletions: [{
      name: "測 試 會 員",
      completedAt: "2026-07-27T13:59:49.709956+00:00",
      sourceReference: "task-midterm-1",
    }],
  });
  assert.deepEqual(lifecycle.midterm, []);
  assert.deepEqual(lifecycle.completedMidterm, [{
    name: "測試會員",
    startDate: "2026-02-01",
    completedAt: "2026-07-27T13:59:49.709956+00:00",
    sourceReference: "task-midterm-1",
  }]);
});

test("舊會籍週期的完成紀錄不排除新週期", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-07-31", {
    asOf: "2026-08-04",
    midtermCompletions: [{ name: "測試會員", completedAt: "2025-07-27T13:59:49Z" }],
  });
  assert.deepEqual(lifecycle.midterm.map((item) => item.name), ["測試會員"]);
  assert.deepEqual(lifecycle.completedMidterm, []);
});

test("分析日之後才完成的紀錄不提前排除", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-07-31", {
    asOf: "2026-08-04",
    midtermCompletions: [{ name: "測試會員", completedAt: "2026-08-05T00:00:00Z" }],
  });
  assert.deepEqual(lifecycle.midterm.map((item) => item.name), ["測試會員"]);
  assert.deepEqual(lifecycle.completedMidterm, []);
});
