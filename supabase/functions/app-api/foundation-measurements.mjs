import { foundationCoverage, foundationMetricCount } from "../../../apps/bni-analysis/engine/foundation-progress.mjs";
import { parsePalmsText } from "../../../apps/bni-analysis/engine/parse-reports.mjs";
import "../../../apps/vice-chair/core/renewal-foundation-domain.js";
const domain = globalThis.FulianRenewalFoundationDomain;
const calendar = globalThis.FulianCalendarDomain;

export function createFoundationMeasurements({ reportImports, reportCategory, downloadReport }) {
  return async function measure(items, now = new Date()) {
    const numeric = items.filter(item => ["visitors", "monthly_visitors"].includes(item.kind) || (item.kind === "flexible" && ["visitors", "ceu"].includes(item.metric)));
    if (!numeric.length) return items;
    const rows = (await reportImports()).filter(row => ["renewal", "annual", "halfYear", "monthly"].includes(reportCategory(row)));
    const today = calendar.dateInput(now), lastCompleteMonth = calendar.monthEndDate(calendar.shiftMonthKey(calendar.monthKey(now), -1));
    const reportRows = rows.map(row => ({ id: row.id, start: row.period_start, end: row.period_end, importedAt: row.imported_at, row }));
    const parsed = new Map();
    async function count(item, start, dueOn) {
      const latestPartial = reportRows.filter(row => row.start >= start && row.end <= today && row.end <= dueOn).map(row => row.end).sort().pop();
      const end = [dueOn, [lastCompleteMonth, latestPartial || ""].sort().pop()].sort()[0];
      if (!end || end < start) return { current: null, periodStart: start, periodEnd: null, reason: "本期尚無正式 PALMS 資料" };
      const plan = foundationCoverage({ start, end, reports: reportRows });
      if (!plan.complete) return { current: null, periodStart: start, periodEnd: plan.coveredThrough, reason: "起算日至資料截止日缺少連續 PALMS，請副主席補上相符期間" };
      try {
        const reports = await Promise.all(plan.selected.map(async selected => {
          if (!parsed.has(selected.id)) parsed.set(selected.id, downloadReport(selected.row).then(text => parsePalmsText(text, "續約地基 PALMS")));
          return { ...selected, parsed: await parsed.get(selected.id) };
        }));
        return foundationMetricCount({ memberName: item.memberName, start, end, reports, metric: item.metric === "ceu" ? "ceu" : "visitors" });
      } catch { return { current: null, periodStart: start, periodEnd: null, reason: "正式 PALMS 讀取或解析失敗，請副主席重新核對" }; }
    }
    return Promise.all(items.map(async item => {
      if (item.kind === "visitors" || (numeric.includes(item) && item.cadence === "cumulative")) return { ...item, measurement: await count(item, item.startOn, calendar.shiftDayKey(item.dueOn, -1)) };
      if (item.kind === "monthly_visitors" || (numeric.includes(item) && item.cadence === "recurring")) {
        const entries = await Promise.all(domain.cycles(item, now).map(async cycle => [cycle.key, await count(item, cycle.start, cycle.end)]));
        return { ...item, periodMeasurements: Object.fromEntries(entries) };
      }
      return item;
    }));
  };
}
