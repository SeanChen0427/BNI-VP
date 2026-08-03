import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../analysis-review.html", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../assets/js/analysis-review.js", import.meta.url), "utf8");
const edgeSource = await readFile(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");

test("月度分析頁先載入正式 Supabase API 橋接再執行頁面程式", () => {
  const authIndex = html.indexOf("assets/js/auth.js?v=7");
  const bridgeIndex = html.indexOf("assets/js/supabase-data.js?v=2");
  const pageIndex = html.indexOf("assets/js/analysis-review.js?v=2");
  assert.ok(authIndex >= 0 && bridgeIndex > authIndex && pageIndex > bridgeIndex);
});

test("月度分析頁不把 HTML 錯誤頁當成 JSON 顯示", () => {
  assert.match(pageSource, /分析服務回應格式不正確，請重新整理後再試/);
  assert.match(pageSource, /const data = await readJson\(response\)/);
});

test("正式分析只接受本期半年、全年及審計報表", () => {
  assert.match(edgeSource, /latestByCategory\(imports, "halfYear", expectedHalf\)/);
  assert.match(edgeSource, /latestByCategory\(imports, "annual", expectedAnnual\)/);
  assert.match(edgeSource, /date >= expectedMonth\.start && date <= expectedMonth\.end/);
  assert.match(edgeSource, /每週審計報告預計/);
  assert.doesNotMatch(edgeSource, /latestByCategory\(imports, "halfYear"\) \|\|/);
});
