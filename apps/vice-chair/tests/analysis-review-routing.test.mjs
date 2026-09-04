import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reconcile } from "../../bni-analysis/engine/reconcile.mjs";
import { buildAnalysisFromParsed } from "../../bni-analysis/engine/analyze.mjs";

const html = await readFile(new URL("../analysis-review.html", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../assets/js/analysis-review.js", import.meta.url), "utf8");
const edgeSource = await readFile(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../../bni-analysis/engine/render-dashboard.mjs", import.meta.url), "utf8");

test("月度分析頁先載入正式 Supabase API 橋接再執行頁面程式", () => {
  const calendarIndex = html.indexOf("core/calendar-domain.js?v=4");
  const authIndex = html.indexOf("assets/js/auth.js?v=8");
  const bridgeIndex = html.indexOf("assets/js/supabase-data.js?v=3");
  const pageIndex = html.indexOf("assets/js/analysis-review.js?v=11");
  assert.ok(calendarIndex >= 0 && authIndex > calendarIndex && bridgeIndex > authIndex && pageIndex > bridgeIndex);
  assert.match(html, /assets\/css\/analysis-review\.css\?v=6/);
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

test("正式分析只接受本期半年、全年、單月及審計報表", () => {
  assert.match(edgeSource, /latestByCategory\(imports, "halfYear", expectedHalf\)/);
  assert.match(edgeSource, /latestByCategory\(imports, "annual", expectedAnnual\)/);
  assert.match(edgeSource, /latestByCategory\(imports, "monthly", expectedMonth\)/);
  assert.match(edgeSource, /if \(!monthlyRow\) missing\.push\(`單月 PALMS/);
  assert.match(edgeSource, /date >= expectedMonth\.start && date <= expectedMonth\.end/);
  assert.match(edgeSource, /每週審計報告預計/);
  assert.doesNotMatch(edgeSource, /latestByCategory\(imports, "halfYear"\) \|\|/);
});

test("月末只開放下期預備，目前正式期仍到每月 1 日才切換", () => {
  assert.match(edgeSource, /function analysisCycle\(\)/);
  assert.match(edgeSource, /function operationalReportWindows\(requestedReportMonth = ""\)/);
  assert.match(edgeSource, /const allowed = \[cycle\.active, cycle\.preparation\]\.filter\(Boolean\)/);
  assert.match(edgeSource, /: cycle\.active;/);
  assert.match(edgeSource, /activePublished\(\)[\s\S]*?period_end=lte\.\$\{activePeriodEnd\}/);
  assert.doesNotMatch(edgeSource, /today === currentMonthEnd \? currentMonth/);
});

test("分析與上傳明確傳遞報表月份，預備快照不會搶走目前儀表板", () => {
  assert.match(html, /id="analysisReportMonth"/);
  assert.match(pageSource, /monthlyAnalysisCycle\(localDay\(\)\)/);
  assert.match(pageSource, /action: "generate", reportMonth: \$\("#analysisReportMonth"\)\.value/);
  assert.match(pageSource, /預備草稿｜\$\{cycle\.effectiveOn\} 才生效，目前儀表板不變/);
  assert.match(edgeSource, /loadEngineSources\(String\(body\.reportMonth \|\| ""\)\.trim\(\)\)/);
  assert.match(edgeSource, /const requestedReportMonth = String\(body\.reportMonth \|\| ""\)\.trim\(\)/);
  assert.match(edgeSource, /snapshot\.analysisCycle = \{ reportMonth, meetingMonth, effectiveOn, status: scheduled \? "scheduled" : "active" \}/);
});

test("正式分析載入同會籍週期的未完成期中任務供跨月延續", () => {
  assert.match(edgeSource, /category=eq\.midterm&status=in\.\(pending,in_progress,completed\)/);
  assert.match(edgeSource, /const midtermTasks = \(midtermRows \|\| \[\]\)\.filter/);
  assert.match(edgeSource, /midtermCompletions,\s*midtermTasks,\s*officialSyncPending,\s*sources/);
});

test("正式快照提供續約表單完整年度資料並可安全修復舊快照", () => {
  assert.match(edgeSource, /enrichPublishedMemberData/);
  assert.match(edgeSource, /hasCompletePublishedMemberData/);
  assert.match(edgeSource, /parseBniDashboard/);
  assert.match(edgeSource, /async function analysisSnapshotApi\(request: Request, context: Context\)/);
  assert.match(edgeSource, /loadPublishedFormSources\(published\.period_start, published\.period_end\)/);
  assert.match(edgeSource, /if \(\["admin", "vp"\]\.includes\(context\.role\)\)/);
  assert.match(edgeSource, /snapshot\.memberData = publishedMemberData\.memberData/);
  assert.match(edgeSource, /path === "\/api\/analysis-snapshot"/);
  assert.match(edgeSource, /正式報表已在分析草稿產生後更新，請重新產出草稿再發佈/);
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

test("PALMS 已升格但中心舊報告未收錄時改為待同步而非反覆報錯", () => {
  const input = {
    palms: { period: { start: "2026-03-01", end: "2026-08-31" }, members: [{ name: "新會員", present: 3, absent: 0, late: 0, medical: 0, substitute: 0 }] },
    expiry: { members: [] },
    tenure: { members: [] },
    departed: [],
  };
  const before = reconcile(input);
  assert.equal(before.expiredUnrenewed.includes("新會員"), true);
  assert.equal(before.issues.some((issue) => issue.code === "tenure-missing"), true);

  const after = reconcile({
    ...input,
    officialSyncPending: [{ name: "新 會員", promotedAt: "2026-08-31T06:34:03Z", fields: ["expiry", "tenure"] }],
  });
  assert.deepEqual(after.expiredUnrenewed, []);
  assert.deepEqual(after.issues, []);
  assert.deepEqual(after.pendingOfficialData[0].missing, ["expiry", "tenure"]);
  assert.equal(after.pendingOfficialData[0].status, "pending-official-sync");

  const explicitExpired = reconcile({
    ...input,
    expiry: { members: [{ name: "新會員", section: "expired", status: "逾期", expiryDate: "2026-08-01" }] },
    officialSyncPending: [{ name: "新會員", fields: ["expiry", "tenure"] }],
  });
  assert.equal(explicitExpired.expiredUnrenewed.includes("新會員"), true, "官方明列逾期不得被待同步規則靜音");
});

test("待同步會員照 PALMS 計分但不猜續約、會齡或期中時點", () => {
  const engine = buildAnalysisFromParsed({
    palms: {
      period: { start: "2026-03-01", end: "2026-08-31" },
      members: [{
        name: "新會員", present: 3, absent: 0, late: 0, medical: 0, substitute: 0,
        refGivenInternal: 0, refGivenExternal: 0, refReceivedInternal: 0, refReceivedExternal: 0,
        visitors: 0, oneToOne: 0, tyfcb: 0, ceu: 0,
      }],
    },
    expiry: { members: [] },
    tenure: { members: [] },
    departed: [],
    officialSyncPending: [{ name: "新會員", fields: ["expiry", "tenure"] }],
    asOf: "2026-08-31",
  });
  assert.equal(engine.aborted, undefined);
  assert.equal(engine.members.length, 1, "PALMS 實績仍須正常計分");
  assert.deepEqual(engine.renewalRadar, [], "不得猜測續約期限");
  assert.deepEqual(engine.lifecycle.midterm, [], "不得猜測期中關懷時點");
  assert.deepEqual(engine.lifecycle.newMembers, [], "不得把登錄日充當官方會齡");
  assert.match(engine.behavior[0].lenientNote, /新會員寬容追蹤/);
});

test("正式後端只在中心來源早於 PALMS 升格時標記待同步", () => {
  assert.match(edgeSource, /provisional_members\?status=eq\.promoted&select=display_name,promoted_at/);
  assert.match(edgeSource, /Date\.parse\(String\(expiry\.imported_at/);
  assert.match(edgeSource, /Date\.parse\(String\(tenure\.imported_at/);
  assert.match(edgeSource, /officialSyncPending,/);
  assert.match(pageSource, /中心資料待同步/);
  assert.match(dashboardSource, /不列為錯誤、不推算官方會齡或續約期限/);
});

test("任何 blocking 對帳差異都不能產出、AI 審視或發佈草稿", () => {
  assert.match(edgeSource, /function assertAnalysisReconciled\(engine: any\)/);
  assert.match(edgeSource, /issue\?\.level === "blocking"/);
  assert.match(edgeSource, /if \(engine\?\.aborted \|\| blocking\.length\)/);
  assert.match(edgeSource, /if \(body\.action === "generate"\) \{[\s\S]*?assertAnalysisReconciled\(engine\)/);
  assert.match(edgeSource, /if \(body\.action === "ai-review"\) \{\s*assertAnalysisReconciled\(draft\.engine\)/);
  assert.match(edgeSource, /if \(body\.action === "codex-review"\) \{\s*assertAnalysisReconciled\(draft\.engine\)/);
  assert.match(edgeSource, /if \(body\.action === "publish"\) \{\s*assertAnalysisReconciled\(draft\.engine\)/);
});

test("正式發佈後舊草稿保留稽核但不會重新浮上", () => {
  assert.match(edgeSource, /analysis_version=like\.draft-%25&generated_at=lte\./);
  assert.match(edgeSource, /analysis_version: `superseded-\$\{Date\.now\(\)\}`/);
  assert.match(edgeSource, /新發佈後才產生的草稿不受影響/);
});

test("Codex 細部審視必須使用六區關懷報告並保留副主席確認門檻", () => {
  assert.match(html, /id="codexReviewText"/);
  assert.match(html, /id="codexReviewButton"/);
  assert.match(pageSource, /post\(\{ action: "codex-review", text \}\)/);
  assert.match(edgeSource, /const sectionCount = \(text\.match\(\/\^##\\s\+\/gm\) \|\| \[\]\)\.length/);
  assert.match(edgeSource, /sectionCount !== 6/);
  assert.match(edgeSource, /provider: "codex"/);
  assert.match(edgeSource, /BNI 分析 Skill・人工深度審視/);
  assert.match(edgeSource, /本報告為草稿\[\\s\\S\]\*副主席確認/);
});

test("成功重跑分析時會清除上一次的阻擋文字", async () => {
  const css = await readFile(new URL("../assets/css/analysis-review.css", import.meta.url), "utf8");
  assert.match(pageSource, /renderIssues\(\$\("#reconcileIssues"\), \[\]\);\s*renderDepartureResolution\(\[\]\);\s*try/);
  assert.match(pageSource, /textContent = "草稿已產出";\s*renderIssues\(\$\("#reconcileIssues"\), \[\]\)/);
  assert.match(css, /\.issues\[hidden\]\{display:none\}/);
});

test("Gemini 流量壅塞只在 Edge 總時間預算內自動重試", () => {
  assert.match(edgeSource, /function temporaryGeminiFailure\(response: Response, payload: any\)/);
  assert.match(edgeSource, /response\.status === 429/);
  assert.match(edgeSource, /response\.status === 503/);
  assert.match(edgeSource, /GEMINI_EDGE_TOTAL_BUDGET_MS = 110_000/);
  assert.match(edgeSource, /GEMINI_FLASH_ATTEMPT_TIMEOUT_MS = 32_000/);
  assert.match(edgeSource, /GEMINI_PRO_ATTEMPT_TIMEOUT_MS = 100_000/);
  assert.match(edgeSource, /for \(let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt \+= 1\)/);
  assert.match(edgeSource, /new AbortController\(\)/);
  assert.match(edgeSource, /clearTimeout\(timer\)/);
  assert.match(edgeSource, /remainingAfterDelay < GEMINI_MIN_ATTEMPT_MS/);
  assert.match(edgeSource, /系統已在 Supabase 強制終止前主動取消/);
});

test("Gemini AI 審視可由使用者選擇後端白名單模型", () => {
  assert.match(html, /id="geminiModelSelect"/);
  assert.match(html, /gemini-3\.6-flash/);
  assert.match(html, /gemini-3\.5-flash-lite/);
  assert.match(pageSource, /provider === "gemini" \? \$\("#geminiModelSelect"\)\.value : undefined/);
  assert.match(edgeSource, /const GEMINI_REVIEW_MODELS = new Set/);
  assert.match(edgeSource, /if \(!GEMINI_REVIEW_MODELS\.has\(model\)\)/);
  assert.match(edgeSource, /const model = reviewModel\(provider, body\.model\)/);
  assert.match(edgeSource, /selectedModel\}:generateContent/);
});
