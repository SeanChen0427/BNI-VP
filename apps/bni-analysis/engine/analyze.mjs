// 分析總指揮：先對帳，後分析。對帳含 blocking 異常時停止，不產生分析結果。
// 輸出版本化結構 fulian.analysis-engine.v1，供草稿審閱、AI 審視與橋接層使用。
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePalms, parseExpiry, parseTenure, parseDeparted } from "./parse-reports.mjs";
import { scoreMember, reportTotalWeeks } from "./score.mjs";
import { reconcile } from "./reconcile.mjs";
import { behaviorDiagnostics, greenIdle, renewalRadar, yellowBreakthrough, lifecycleLists, memberTenure } from "./diagnostics.mjs";
import { loadAuditMonth, runAuditFamilies } from "./audit.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fingerprint(filePath) {
  const buf = readFileSync(filePath);
  return {
    path: path.relative(ROOT, filePath),
    sha256: createHash("sha256").update(buf).digest("hex").slice(0, 12),
    modifiedAt: statSync(filePath).mtime.toISOString(),
  };
}

function latestAnnualPath() {
  const dir = path.join(ROOT, "data/archive");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^palms_.*_annual\.xls$/.test(f)).sort();
  return files.length > 0 ? path.join(dir, files[files.length - 1]) : null;
}

function latestAuditDir() {
  const dir = path.join(ROOT, "data/audit");
  if (!existsSync(dir)) return null;
  const months = readdirSync(dir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
  return months.length > 0 ? path.join(dir, months[months.length - 1]) : null;
}

export function buildAnalysis({ asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const paths = {
    palms: path.join(ROOT, "data/baseline/palms.xls"),
    expiry: path.join(ROOT, "data/baseline/membership-expiry.xls"),
    tenure: path.join(ROOT, "data/baseline/tenure.xls"),
    departed: path.join(ROOT, "data/departed-members.md"),
    annual: latestAnnualPath(),
    auditDir: latestAuditDir(),
  };

  const palms = parsePalms(paths.palms);
  const expiry = parseExpiry(paths.expiry);
  const tenure = parseTenure(paths.tenure);
  const departed = parseDeparted(paths.departed);
  const annual = paths.annual ? parsePalms(paths.annual) : null;
  const auditMonth = paths.auditDir ? loadAuditMonth(paths.auditDir) : null;
  const sources = [fingerprint(paths.palms), fingerprint(paths.expiry), fingerprint(paths.tenure), fingerprint(paths.departed)];
  if (paths.annual) sources.push(fingerprint(paths.annual));

  return buildAnalysisFromParsed({
    palms,
    expiry,
    tenure,
    departed,
    annual,
    auditMonth,
    auditMonthName: paths.auditDir ? path.basename(paths.auditDir) : null,
    asOf,
    sources,
  });
}

// 正式伺服器與本機 CLI 共用同一分析流程。Edge Function 只負責從 Private
// Storage 取回報表並解析；計分、診斷與對帳仍唯一存在於本檔及相鄰 engine 模組。
export function buildAnalysisFromParsed({
  palms,
  expiry,
  tenure,
  departed,
  annual = null,
  auditMonth = null,
  auditMonthName = null,
  renewalCompletions = [],
  midtermCompletions = [],
  midtermTasks = [],
  officialSyncPending = [],
  asOf = new Date().toISOString().slice(0, 10),
  sources = [],
} = {}) {
  // 先對帳：blocking 異常存在時直接回傳，不做任何分析。
  const reconciliation = reconcile({ palms, expiry, tenure, departed, officialSyncPending });
  const meta = {
    version: "fulian.analysis-engine.v1",
    generatedAt: new Date().toISOString(),
    asOf,
    period: palms.period,
    sources,
  };
  if (!reconciliation.ok) {
    return { meta, reconciliation, aborted: true, reason: "對帳未通過，依「先對帳後分析」原則停止輸出" };
  }

  const totalWeeks = reportTotalWeeks(palms.members);
  const tenureByName = new Map(tenure.members.map((m) => [m.name, m]));
  const expiryByName = new Map(expiry.members.map((m) => [m.name, m]));
  const pendingTenureNames = new Set(reconciliation.pendingOfficialData
    .filter((item) => item.missing.includes("tenure"))
    .map((item) => item.name));

  const activeScored = reconciliation.activeMembers.map((m) => scoreMember(m, totalWeeks));
  activeScored.sort((a, b) => b.total - a.total);

  // 燈號分布
  const distribution = { green: 0, yellow: 0, red: 0, black: 0 };
  for (const s of activeScored) distribution[s.light] += 1;

  // 分會結構性零分項（>= 50% 會員該項 0 分 = 系統問題，不逐人列入個人空轉）
  const zeroShare = (key) => activeScored.filter((s) => s.scores[key] === 0).length / activeScored.length;
  const structuralZeroItems = ["absence", "referral", "visitor", "oneToOne", "education", "tyfcb"].filter((k) => zeroShare(k) >= 0.5);

  // 行為診斷（模組二～四）＋綠燈空轉（模組五，結構性項目過濾後）
  const behavior = [];
  const greenIdles = [];
  for (const s of activeScored) {
    const t = memberTenure(tenureByName.get(s.name), palms.period.end);
    const officialTenurePending = pendingTenureNames.has(s.name);
    const diag = behaviorDiagnostics(s, t.months, { officialTenurePending });
    if (diag.findings.length > 0) behavior.push({
      name: s.name,
      light: s.light,
      total: s.total,
      tenureMonths: t.months,
      tenureStatus: officialTenurePending ? "pending-official-sync" : "official",
      lenientNote: diag.lenientNote,
      findings: diag.findings,
    });
    const idle = greenIdle(s, structuralZeroItems);
    if (idle) greenIdles.push(idle);
  }

  // 年度資料（續約審查弱項精算用）
  let annualByName = null;
  if (annual) {
    annualByName = new Map(annual.members.map((m) => [m.name, { visitors: m.visitors, ceu: m.ceu }]));
    meta.annualPeriod = annual.period;
  }

  const activeNames = new Set(activeScored.map((member) => member.name));
  const confirmedRenewals = renewalCompletions.filter((item) => {
    const expiry = expiryByName.get(item.name);
    return activeNames.has(item.name) && expiry?.expiryDate === item.priorExpiryOn;
  });
  const radar = renewalRadar({
    activeScored,
    expiryByName,
    annualByName,
    asOf,
    expiredUnrenewed: reconciliation.expiredUnrenewed,
    confirmedRenewals,
  });

  // 黃燈突圍
  const breakthroughs = activeScored.map((s) => yellowBreakthrough(s)).filter(Boolean);

  // 期中關懷與新會員
  const lifecycle = lifecycleLists(activeScored, tenureByName, palms.period.end, { midtermCompletions, midtermTasks, asOf });

  // 審計（有當月資料才跑）
  let audit = null;
  if (auditMonth) {
    audit = { month: auditMonthName, ...runAuditFamilies({ events: auditMonth.events, weeks: auditMonth.weeks, activeScored }) };
  }

  // 分會結構性訊號（個人問題 vs 分會系統問題的判讀基礎）
  const structural = {
    structuralZeroItems,
    visitorZeroScore: activeScored.filter((s) => s.scores.visitor === 0).length,
    educationZeroScore: activeScored.filter((s) => s.scores.education === 0).length,
    tyfcbZeroScore: activeScored.filter((s) => s.scores.tyfcb === 0).length,
    memberCount: activeScored.length,
  };

  return {
    meta,
    reconciliation: {
      ok: reconciliation.ok,
      counts: reconciliation.counts,
      excludedDeparted: reconciliation.excludedDeparted,
      expiredUnrenewed: reconciliation.expiredUnrenewed,
      pendingOfficialData: reconciliation.pendingOfficialData,
      issues: reconciliation.issues,
    },
    totalWeeks,
    distribution,
    members: activeScored,
    behavior,
    greenIdles,
    renewalRadar: radar,
    renewalConfirmations: confirmedRenewals,
    yellowBreakthroughs: breakthroughs,
    lifecycle,
    audit,
    structural,
  };
}

// CLI：node engine/analyze.mjs [--as-of YYYY-MM-DD] [--json 輸出路徑]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const asOfArg = process.argv.indexOf("--as-of");
  const asOf = asOfArg > -1 ? process.argv[asOfArg + 1] : undefined;
  const result = buildAnalysis(asOf ? { asOf } : {});
  const jsonArg = process.argv.indexOf("--json");
  if (jsonArg > -1) {
    const out = process.argv[jsonArg + 1];
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`已輸出：${out}`);
  }
  if (result.aborted) {
    console.error(`分析中止：${result.reason}`);
    for (const i of result.reconciliation.issues) console.error(`  [${i.level}] ${i.message}`);
    process.exit(1);
  }
  console.log(`期間 ${result.meta.period.start} ~ ${result.meta.period.end}｜現任 ${result.reconciliation.counts.active} 人｜週數 ${result.totalWeeks}`);
  console.log(`燈號分布：綠 ${result.distribution.green}／黃 ${result.distribution.yellow}／紅 ${result.distribution.red}／黑 ${result.distribution.black}`);
  console.log(`續約雷達 ${result.renewalRadar.length} 項｜行為診斷 ${result.behavior.length} 人｜綠燈空轉 ${result.greenIdles.length} 人｜黃燈突圍 ${result.yellowBreakthroughs.length} 人`);
  console.log(`期中關懷 ${result.lifecycle.midterm.length} 人｜新會員 ${result.lifecycle.newMembers.length} 人｜審計觀察 ${result.audit ? result.audit.observations.length : "無資料"} 人`);
}
