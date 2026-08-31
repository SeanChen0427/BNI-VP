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

test("超過 7 個月但同一會籍週期仍有未完成任務時跨月延續", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-10-31", {
    asOf: "2026-10-31",
    midtermTasks: [{
      name: "測 試 會 員",
      status: "in_progress",
      createdAt: "2026-07-10T02:00:00Z",
      scheduledAt: "2026-07-15T02:00:00Z",
      sourceReference: "task-midterm-open",
    }],
  });
  assert.equal(lifecycle.midterm.length, 1);
  assert.equal(lifecycle.midterm[0].name, "測試會員");
  assert.equal(lifecycle.midterm[0].carriedForward, true);
  assert.equal(lifecycle.midterm[0].taskReference, "task-midterm-open");
});

test("仍在 5–7 個月窗口但任務來自前月時也標記跨月延續", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-08-31", {
    asOf: "2026-08-31",
    midtermTasks: [{
      name: "測試會員",
      status: "pending",
      createdAt: "2026-07-20T02:00:00Z",
      sourceReference: "task-midterm-prior-month",
    }],
  });
  assert.equal(lifecycle.midterm.length, 1);
  assert.equal(lifecycle.midterm[0].months, 6);
  assert.equal(lifecycle.midterm[0].carriedForward, true);
});

test("超過 7 個月且沒有未完成任務時不新增期中關懷", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-10-31", { asOf: "2026-10-31" });
  assert.deepEqual(lifecycle.midterm, []);
});

test("舊會籍週期的未完成任務不帶入復會新週期", () => {
  const rejoinedTenure = new Map([
    ["測試會員", { cumulativeStart: "2025-01-01", recentStart: "2026-08-01" }],
  ]);
  const lifecycle = lifecycleLists(activeScored, rejoinedTenure, "2026-10-31", {
    asOf: "2026-10-31",
    midtermTasks: [{
      name: "測試會員",
      status: "pending",
      createdAt: "2025-07-01T02:00:00Z",
      sourceReference: "old-cycle-task",
    }],
  });
  assert.deepEqual(lifecycle.midterm, []);
  assert.deepEqual(lifecycle.newMembers.map((item) => item.name), ["測試會員"]);
});

test("同一週期完成紀錄仍優先於未完成副本，避免重複關懷", () => {
  const lifecycle = lifecycleLists(activeScored, tenureByName, "2026-10-31", {
    asOf: "2026-10-31",
    midtermCompletions: [{ name: "測試會員", completedAt: "2026-08-05T00:00:00Z" }],
    midtermTasks: [{ name: "測試會員", status: "pending", createdAt: "2026-07-10T00:00:00Z" }],
  });
  assert.deepEqual(lifecycle.midterm, []);
  assert.equal(lifecycle.completedMidterm.length, 1);
});
