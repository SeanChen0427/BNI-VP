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
  const pageIndex = html.indexOf("assets/js/analysis-review.js?v=5");
  assert.ok(authIndex >= 0 && bridgeIndex > authIndex && pageIndex > bridgeIndex);
  assert.match(html, /assets\/css\/analysis-review\.css\?v=3/);
});

test("月度分析頁不把 HTML 錯誤頁當成 JSON 顯示", () => {
  assert.match(pageSource, /分析服務回應格式不正確，請重新整理後再試/);
  assert.match(pageSource, /const data = await readJson\(response\)/);
});

test("到期報告有而 PALMS 無時由副主席確認離會並重新分析", () => {
  assert.match(html, /id="departureResolution"/);
  assert.match(pageSource, /issue\.code === "expiry-only"/);
  assert.match(pageSource, /postDeparture\(\{ action: "register", source: "analysis-reconciliation", name, confirmName: name, confirmedAt/);
  assert.match(pageSource, /後續分析自動排除/);
  assert.match(pageSource, /await generateDraft\(\)/);
});

test("分析差異中的歷史離會者即使不在現任主檔也可建立離會紀錄", () => {
  assert.match(edgeSource, /async function verifiedHistoricalDepartureCandidate\(name: string\)/);
  assert.match(edgeSource, /body\.source === "analysis-reconciliation"/);
  assert.match(edgeSource, /people\?on_conflict=display_name/);
  assert.match(edgeSource, /members\?on_conflict=person_id/);
  assert.match(edgeSource, /status: "departed"/);
  assert.match(edgeSource, /仍存在於本期 PALMS，不可由名單差異流程登記離會/);
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

test("任何 blocking 對帳差異都不能產出、AI 審視或發佈草稿", () => {
  assert.match(edgeSource, /function assertAnalysisReconciled\(engine: any\)/);
  assert.match(edgeSource, /issue\?\.level === "blocking"/);
  assert.match(edgeSource, /if \(engine\?\.aborted \|\| blocking\.length\)/);
  assert.match(edgeSource, /if \(body\.action === "generate"\) \{[\s\S]*?assertAnalysisReconciled\(engine\)/);
  assert.match(edgeSource, /if \(body\.action === "ai-review"\) \{\s*assertAnalysisReconciled\(draft\.engine\)/);
  assert.match(edgeSource, /if \(body\.action === "publish"\) \{\s*assertAnalysisReconciled\(draft\.engine\)/);
});

test("成功重跑分析時會清除上一次的阻擋文字", async () => {
  const css = await readFile(new URL("../assets/css/analysis-review.css", import.meta.url), "utf8");
  assert.match(pageSource, /renderIssues\(\$\("#reconcileIssues"\), \[\]\);\s*renderDepartureResolution\(\[\]\);\s*try/);
  assert.match(pageSource, /textContent = "草稿已產出";\s*renderIssues\(\$\("#reconcileIssues"\), \[\]\)/);
  assert.match(css, /\.issues\[hidden\]\{display:none\}/);
});
