// Exact PALMS period accounting for explicitly agreed renewal conditions.
// Does not alter scoring, diagnosis thresholds or membership status.
import "../../vice-chair/core/calendar-domain.js";
const calendar = globalThis.FulianCalendarDomain;
const normalizedName = value => String(value || "").replace(/\s+/gu, "");

export function foundationCoverage({ start, end, reports }) {
  if (calendar.dateInput(start) !== start || calendar.dateInput(end) !== end || start > end) throw new Error("地基核對期間無效");
  // Latest import wins only within the same exact period. Overlapping reports are never added together.
  const newest = new Map();
  for (const report of [...reports].sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")))) {
    if (report.start < start || report.end > end || report.start > report.end) continue;
    const key = `${report.start}/${report.end}`;
    if (!newest.has(key)) newest.set(key, report);
  }
  const memo = new Map();
  function walk(cursor) {
    if (cursor > end) return [];
    if (memo.has(cursor)) return memo.get(cursor);
    let best = [];
    for (const report of newest.values()) {
      if (report.start !== cursor) continue;
      const chain = [report, ...walk(calendar.shiftDayKey(report.end, 1))];
      if (!best.length || chain.at(-1).end > best.at(-1).end || (chain.at(-1).end === best.at(-1).end && chain.length < best.length)) best = chain;
    }
    memo.set(cursor, best);
    return best;
  }
  const selected = walk(start);
  return { selected, complete: selected.at(-1)?.end === end, coveredThrough: selected.at(-1)?.end || null };
}

export function foundationVisitorCount({ memberName, start, end, reports }) {
  return foundationMetricCount({ memberName, start, end, reports, metric: "visitors" });
}

export function foundationMetricCount({ memberName, start, end, reports, metric }) {
  if (!["visitors", "ceu"].includes(metric)) throw new Error("不支援的 PALMS 地基指標");
  const unit = metric === "ceu" ? "分" : "位";
  const coverage = foundationCoverage({ start, end, reports });
  const result = { current: null, periodStart: start, periodEnd: coverage.coveredThrough, requestedEnd: end, sources: [], reason: "缺少連續且符合起算日的 PALMS，不能以 0 或其他期間代替" };
  if (!coverage.complete) return result;
  let count = 0;
  for (const source of coverage.selected) {
    const report = source.parsed;
    if (!report || report.period.start !== source.start || report.period.end !== source.end) return { ...result, reason: "報表內容期間與匯入索引不符，待重新核對" };
    const members = report.members.filter(row => normalizedName(row.name) === normalizedName(memberName));
    if (members.length !== 1) return { ...result, reason: "會員姓名無法唯一對帳，待補正正式資料" };
    const amount = members[0][metric];
    if (!Number.isFinite(amount) || amount < 0 || (metric === "visitors" && !Number.isInteger(amount)) || (metric === "ceu" && members[0].ceuRecorded === false)) return { ...result, reason: `${metric === "ceu" ? "培訓積分" : "來賓人數"}無效或未提供，待補正正式資料` };
    count += amount;
    result.sources.push({ id: source.id, start: source.start, end: source.end, [metric]: amount });
  }
  count = Math.round(count * 100) / 100;
  return { ...result, metric, current: count, reason: "", formula: result.sources.map(source => `${source.start}～${source.end}：${source[metric]}`).join(" + ") + ` = ${count} ${unit}` };
}
