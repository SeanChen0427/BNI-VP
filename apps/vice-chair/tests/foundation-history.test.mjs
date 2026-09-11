import assert from "node:assert/strict";
import test from "node:test";
import history from "../assets/js/foundation-history.js";

const base = () => ({ kind: "flexible", metric: "ceu", cadence: "cumulative", target: 20, startOn: "2028-08-01", dueOn: "2029-08-02", nextCheckOn: "2028-08-01", leadName: "測試主責", leadId: "private-person-id", status: "tracking", title: "期間內累計培訓積分 20 分", criterion: "期間內累計培訓積分 20 分" });

test("改期歷程只列實際變動，結束日沿用畫面的含當日語意", () => {
  const before = base(), after = { ...before, startOn: "2028-06-01", dueOn: "2029-06-01", nextCheckOn: "2028-06-01", periodResults: {} };
  const snapshot = structuredClone({ before, after });
  assert.deepEqual(history.changes(before, after), [
    { label: "起算日", before: "2028/08/01", after: "2028/06/01" },
    { label: "地基結束日（含當日）", before: "2029/08/01", after: "2029/05/31" },
    { label: "下次追蹤日", before: "2028/08/01", after: "2028/06/01" },
  ]);
  const html = history.renderAmendment({ previous_data: before, next_data: after, detail: { scheduleChanged: true, resetPeriodCount: 0 } });
  assert.match(html, /查看變更明細（3 項）/);
  assert.doesNotMatch(html, /0 期|重新核對|private-person-id|periodResults|dueOn|tracking|<pre>|快照|測試主責/);
  assert.deepEqual({ before, after }, snapshot, "顯示歷程不得改寫保存的紀錄");
});

test("人工期限不減一天；文字清空、目標單位與人員調整可辨識且轉義 HTML", () => {
  const before = { ...base(), kind: "manual", companionNames: ["陪同乙", "陪同甲"], source: "原依據" };
  const after = { ...before, dueOn: "2029-05-31", leadName: "<img src=x onerror=alert(1)>", companionNames: ["陪同甲", "陪同乙"], source: "", target: 25.5 };
  const rows = history.changes(before, after);
  assert.equal(rows.find(row => row.label === "地基期限／下次續約日").after, "2029/05/31");
  assert.equal(rows.find(row => row.label === "議定依據與確認紀錄").after, "未填寫");
  assert.equal(rows.find(row => row.label === "目標").after, "25.5 分");
  assert.ok(!rows.some(row => row.label === "陪同追蹤人"));
  const html = history.renderAmendment({ previous_data: before, next_data: after });
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});

test("改期後原工作坊確認仍可閱讀；空紀錄不顯示技術差異", () => {
  const before = { ...base(), metric: "workshop", periodResults: { "2028-08-01": { status: "achieved", count: 2, attendedOn: "2028-08-15", confirmedBy: "測試確認人" } } };
  const html = history.renderAmendment({ previous_data: before, next_data: { ...before, periodResults: {} }, detail: { scheduleChanged: true, resetPeriodCount: 1 } });
  for (const text of ["1 期工作坊確認需重新核對", "原工作坊確認（2028/08/01 起）", "2 場", "2028/08/15", "測試確認人", "需依調整後期間重新確認"]) assert.ok(html.includes(text));
  assert.match(history.renderAmendment({ previous_data: null, next_data: base() }), /未保存完整/);
  assert.match(history.renderAmendment({ previous_data: base(), next_data: { ...base(), periodResults: {}, titleGenerated: true } }), /本次未變更追蹤設定/);
});
