import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reconcile } from "../../bni-analysis/engine/reconcile.mjs";

const html = await readFile(new URL("../analysis-review.html", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../assets/js/analysis-review.js", import.meta.url), "utf8");
const edgeSource = await readFile(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");

test("月度分析頁先載入正式 Supabase API 橋接再執行頁面程式", () => {
  const authIndex = html.indexOf("assets/js/auth.js?v=7");
  const bridgeIndex = html.indexOf("assets/js/supabase-data.js?v=2");
  const pageIndex = html.indexOf("assets/js/analysis-review.js?v=3");
  assert.ok(authIndex >= 0 && bridgeIndex > authIndex && pageIndex > bridgeIndex);
});

test("月度分析頁不把 HTML 錯誤頁當成 JSON 顯示", () => {
  assert.match(pageSource, /分析服務回應格式不正確，請重新整理後再試/);
  assert.match(pageSource, /const data = await readJson\(response\)/);
});

test("到期報告有而 PALMS 無時由副主席確認離會並重新分析", () => {
  assert.match(html, /id="departureResolution"/);
  assert.match(pageSource, /issue\.code === "expiry-only"/);
  assert.match(pageSource, /postDeparture\(\{ action: "register", name, confirmName: name, confirmedAt/);
  assert.match(pageSource, /後續分析自動排除/);
  assert.match(pageSource, /await generateDraft\(\)/);
});

test("正式分析只接受本期半年、全年及審計報表", () => {
  assert.match(edgeSource, /latestByCategory\(imports, "halfYear", expectedHalf\)/);
  assert.match(edgeSource, /latestByCategory\(imports, "annual", expectedAnnual\)/);
  assert.match(edgeSource, /date >= expectedMonth\.start && date <= expectedMonth\.end/);
  assert.match(edgeSource, /每週審計報告預計/);
  assert.doesNotMatch(edgeSource, /latestByCategory\(imports, "halfYear"\) \|\|/);
});

test("已由副主席確認的離會者不再成為後續對帳差異", () => {
  const input = {
    palms: { period: { start: "2026-02-01", end: "2026-07-31" }, members: [{ name: "測試現任", present: 1, absent: 0, late: 0, medical: 0, substitute: 0 }] },
    expiry: { members: [{ name: "測試現任" }, { name: "測試離會" }] },
    tenure: { members: [{ name: "測試現任" }] },
  };
  const before = reconcile({ ...input, departed: [] });
  assert.equal(before.ok, false);
  assert.equal(before.blocking?.length || before.issues.filter((issue) => issue.level === "blocking").length, 1);
  assert.equal(before.issues.find((issue) => issue.code === "expiry-only")?.member, "測試離會");
  const after = reconcile({ ...input, departed: [{ name: "測試離會", confirmedAt: "2026-08-04" }] });
  assert.equal(after.ok, true);
  assert.equal(after.issues.some((issue) => issue.member === "測試離會"), false);
});
