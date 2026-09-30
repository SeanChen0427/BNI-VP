// 六大診斷模組中的規則層（SKILL.md 模組一～五）＋續約雷達＋期中關懷／新會員判定＋黃燈突圍。
// 引擎只產出數據與規則命中；敘事、無辜解釋與關懷方向由 AI 審視層補充，發佈前由副主席確認。
// 所有推估值一律標記 estimated: true（紀律 5：估算必須標明估算）。

const MS_DAY = 24 * 60 * 60 * 1000;

function utcDate(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : null;
}

export function monthsBetween(startISO, endISO) {
  const s = utcDate(startISO);
  const e = utcDate(endISO);
  if (!s || !e) return NaN;
  let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  if (e.getUTCDate() < s.getUTCDate()) months -= 1;
  return months;
}

// 續約截止日 = 到期日往前 2 個月的 15 號。
export function renewalDeadline(expiryISO) {
  const d = utcDate(expiryISO);
  if (!d) return "";
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 15));
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-15`;
}

function daysBetween(fromISO, toISO) {
  const from=utcDate(fromISO),to=utcDate(toISO);
  return from&&to?Math.round((to-from)/MS_DAY):NaN;
}

// 會齡與身份判定。復會會員（最近開始日期晚於累計開始日期）以最近開始日期判定期中／新會員。
// 開始日期晚於報表結束日屬資料異常 → 標記並視為無法判定。
export function memberTenure(tenureEntry, reportEnd) {
  if (!tenureEntry) return { months: null, anomaly: "會齡報告缺此人" };
  const basis = tenureEntry.recentStart && tenureEntry.recentStart > tenureEntry.cumulativeStart
    ? { date: tenureEntry.recentStart, rejoin: true }
    : { date: tenureEntry.cumulativeStart, rejoin: false };
  if (basis.date > reportEnd) return { months: null, anomaly: `開始日期 ${basis.date} 晚於報表結束日`, rejoin: basis.rejoin };
  return { months: monthsBetween(basis.date, reportEnd), startDate: basis.date, rejoin: basis.rejoin, cumulativeStart: tenureEntry.cumulativeStart };
}

// 模組二～四：互動三角、引薦含金量、一對一效率。scored 為 score.mjs 輸出。
export function behaviorDiagnostics(scored, tenureMonths, { officialTenurePending = false } = {}) {
  const m = scored.metrics;
  const findings = [];
  const isNewUnder3 = tenureMonths !== null && tenureMonths < 3;
  const lenient = officialTenurePending
    ? "已由 PALMS 升格正式會員，官方會齡待中心同步；先採新會員寬容追蹤，不推算會齡或期中關懷時點"
    : isNewUnder3 ? "在會未滿 3 個月，數據偏低屬正常（寬容備註，不作一般告警）" : null;

  // 模組二：互動三角
  const g = m.refPerWeek;
  const r = m.refReceivedPerWeek;
  const o = m.otoPerWeek;
  if (g >= 1.5 && r < g * 0.5) {
    findings.push({ module: "triangle", pattern: "A", evidence: `提供 ${g.toFixed(2)}/週、收到 ${r.toFixed(2)}/週`, meaning: "付出多但夥伴不知如何回饋" });
  } else if (r >= 1.0 && g < r * 0.5) {
    findings.push({ module: "triangle", pattern: "B", evidence: `收到 ${r.toFixed(2)}/週、提供 ${g.toFixed(2)}/週`, meaning: "收多給少，關係經營單向" });
  } else if (o >= 2.0 && g < 1.0 && r < 1.0) {
    findings.push({ module: "triangle", pattern: "C", evidence: `一對一 ${o.toFixed(2)}/週、提供 ${g.toFixed(2)}/週、收到 ${r.toFixed(2)}/週`, meaning: "一對一未轉化為引薦" });
  } else if (g < 0.75 && r < 0.75 && o < 0.75) {
    findings.push({ module: "triangle", pattern: "D", evidence: `提供 ${g.toFixed(2)}／收到 ${r.toFixed(2)}／一對一 ${o.toFixed(2)}（每週）`, meaning: tenureMonths !== null && tenureMonths >= 12 ? "老會員全面低參與，需深度對話" : "未融入系統，需 導師 帶動" });
  }

  // 模組三：引薦含金量（提供引薦 = 0 不計算，歸入互動三角）
  if (m.refGiven > 0) {
    if (m.tyfcb === 0) {
      findings.push({ module: "referral-quality", pattern: "no-close", evidence: `提供引薦 ${m.refGiven} 筆、交易 0 元`, meaning: "引薦未成交（品質或成交週期問題）" });
    } else {
      const avg = m.tyfcb / m.refGiven;
      if (avg < 5000) findings.push({ module: "referral-quality", pattern: "consumer", evidence: `平均 ${Math.round(avg).toLocaleString()} 元/筆（交易 ${m.tyfcb.toLocaleString()} 元 ÷ ${m.refGiven} 筆）`, meaning: "消費型引薦，對接層級不足" });
      else if (avg < 10000) findings.push({ module: "referral-quality", pattern: "low", evidence: `平均 ${Math.round(avg).toLocaleString()} 元/筆`, meaning: "有引薦意識但對接層級待提升" });
    }
  }

  // 模組四：一對一效率比（一對一 = 0 直接標記）
  if (m.otoPerWeek === 0 && scored.metrics.refGiven + m.refReceived > 0) {
    findings.push({ module: "oto-efficiency", pattern: "none", evidence: "一對一 0 次", meaning: "無一對一" });
  } else if (m.refReceived >= 0 && scored.metrics.otoPerWeek > 0) {
    const oto = scored.weeks * m.otoPerWeek;
    const eff = m.refReceived / oto;
    if (eff < 0.3) findings.push({ module: "oto-efficiency", pattern: "severe", evidence: `效率比 ${eff.toFixed(2)}（收到 ${m.refReceived} 筆 ÷ 一對一 ${Math.round(oto)} 次，基準 0.7）`, meaning: "一對一幾乎未轉化為引薦" });
    else if (eff < 0.7) findings.push({ module: "oto-efficiency", pattern: "low", evidence: `效率比 ${eff.toFixed(2)}（基準 0.7）`, meaning: "一對一轉化率不足" });
  }

  return { findings, lenientNote: lenient };
}

// 模組五：綠燈空轉。structuralItems = 全分會結構性零分項（>= 50% 會員命中），
// 依儀表板規範屬系統問題，不列入個人空轉判定（否則半數會員都中，違反注意力預算）。
export function greenIdle(scored, structuralItems = []) {
  if (scored.light !== "green") return null;
  const excluded = new Set(structuralItems);
  const types = [];
  const zeroItems = Object.entries(scored.scores).filter(([k, v]) => v === 0 && !excluded.has(k)).map(([k]) => k);
  if (zeroItems.length > 0) types.push({ type: "structural-zero", items: zeroItems });
  if (scored.scores.absence === 20 && scored.metrics.substitute >= 4) {
    types.push({ type: "substitute-reliance", evidence: `無等效缺席但代理人 ${scored.metrics.substitute} 次` });
  }
  const full = { absence: 20, referral: 20, visitor: 15, oneToOne: 15, education: 15, tyfcb: 15 };
  const hasFull = Object.entries(scored.scores).some(([k, v]) => v === full[k]);
  const weakCount = Object.entries(scored.scores).filter(([k, v]) => v <= 5 && !excluded.has(k)).length;
  if (hasFull && weakCount >= 2) types.push({ type: "single-item-carry", evidence: `有滿分項但結構性弱項之外仍有 ${weakCount} 項 ≤ 5 分` });
  return types.length > 0 ? { name: scored.name, total: scored.total, types } : null;
}

// 續約雷達。asOf = 分析基準日（YYYY-MM-DD）。annualByName 可為 null（改用半年 ×2 估算）。
export function renewalRadar({ activeScored, expiryByName, annualByName, asOf, expiredUnrenewed, confirmedRenewals = [], confirmedNonRenewals = [] }) {
  const items = [];
  const asOfMonth = asOf.slice(0, 7);
  const confirmedCycles = new Set([...confirmedRenewals, ...confirmedNonRenewals].map((item) => `${item.name}\u0000${item.priorExpiryOn}`));
  for (const s of activeScored) {
    const e = expiryByName.get(s.name);
    if (!e || !e.expiryDate) continue;
    if (confirmedCycles.has(`${s.name}\u0000${e.expiryDate}`)) continue;
    const deadline = renewalDeadline(e.expiryDate);
    const daysLeft = daysBetween(asOf, deadline);
    const entry = { name: s.name, expiryDate: e.expiryDate, deadline, daysLeft, autoRenewal: e.autoRenewal };
    const annual = annualByName ? annualByName.get(s.name) || null : null;
    entry.annual = annual;
    if (deadline.slice(0, 7) === asOfMonth && daysLeft >= 0) {
      items.push({ ...entry, kind: "due-this-month" });
    } else if (daysLeft < 0 && asOf <= e.expiryDate) {
      items.push({ ...entry, kind: "overdue" });
    } else if (daysLeft > 0 && daysLeft <= 75) {
      // 預警窗口：截止日前 2 個月起；弱項者標預警，其餘列一般時限提醒
      const weak = weakForRenewal(s, annualByName);
      if (weak) items.push({ ...entry, kind: "weak-early-warning", weak });
      else items.push({ ...entry, kind: "upcoming" });
    }
  }
  for (const name of expiredUnrenewed) {
    if (confirmedCycles.has(`${name}\u0000${expiryByName.get(name)?.expiryDate}`)) continue;
    items.push({ name, kind: "expired-unrenewed" });
  }
  const order = { "expired-unrenewed": 0, overdue: 1, "due-this-month": 2, upcoming: 3, "weak-early-warning": 4 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  return items;
}

// 續約審查弱項：全年來賓 < 4 或全年培訓 < 20；無年度資料時以半年 ×2 估算（來賓 < 2 或培訓 < 10），標記估算。
function weakForRenewal(scored, annualByName) {
  const annual = annualByName ? annualByName.get(scored.name) : null;
  if (annual) {
    const reasons = [];
    if (annual.visitors < 4) reasons.push(`全年來賓 ${annual.visitors} 位（門檻 4）`);
    if (annual.ceu < 20) reasons.push(`全年培訓 ${annual.ceu} 分（門檻 20）`);
    return reasons.length > 0 ? { reasons, estimated: false } : null;
  }
  const reasons = [];
  if (scored.metrics.visitors < 2) reasons.push(`半年來賓 ${scored.metrics.visitors} 位（×2 估算未達全年 4）`);
  if (scored.metrics.ceu < 10) reasons.push(`半年培訓 ${scored.metrics.ceu} 分（×2 估算未達全年 20）`);
  return reasons.length > 0 ? { reasons, estimated: true } : null;
}

// 黃燈突圍：全部為估算。引擎產出缺口數據，敘事由 AI 審視層補充。
export function yellowBreakthrough(scored, { monthWeeks = 4 } = {}) {
  if (scored.light !== "yellow") return null;
  const gapToGreen = 70 - scored.total;
  const rolledOut = Math.round(scored.weeks / 6); // 滾出月份週數（按 6 個月均分估算）
  const carriedWeeks = scored.weeks - rolledOut;
  const windowWeeks = carriedWeeks + monthWeeks;
  const m = scored.metrics;
  const carry = (total) => (total * carriedWeeks) / scored.weeks;
  const options = [];

  const refTiers = [[1.5, 20], [1.2, 15], [0.8, 10], [0.6, 5]];
  for (const [th, pts] of refTiers) {
    const gain = pts - scored.scores.referral;
    if (gain <= 0) break;
    const needed = th * windowWeeks - carry(m.refGiven) - 1.5 * monthWeeks;
    options.push({ item: "referral", tierScore: pts, pointsGain: gain, extraActions: Math.max(0, Math.ceil(needed)), unit: "筆引薦（正常參與 1.5/週 之外）", estimated: true });
  }
  const otoTiers = [[2.0, 15], [1.0, 10], [0.5, 5]];
  for (const [th, pts] of otoTiers) {
    const gain = pts - scored.scores.oneToOne;
    if (gain <= 0) break;
    const otoTotal = m.otoPerWeek * scored.weeks;
    const needed = th * windowWeeks - carry(otoTotal) - 2 * monthWeeks;
    options.push({ item: "oneToOne", tierScore: pts, pointsGain: gain, extraActions: Math.max(0, Math.ceil(needed)), unit: "次一對一（正常參與 2/週 之外）", estimated: true });
  }
  const eduTiers = [[6, 15], [4, 10], [2, 5]];
  for (const [th, pts] of eduTiers) {
    const gain = pts - scored.scores.education;
    if (gain <= 0) break;
    options.push({ item: "education", tierScore: pts, pointsGain: gain, extraActions: Math.max(0, th - m.ceu), unit: "培訓分（現值計，滾出月份會使分數自動變動）", estimated: true });
  }

  // Enumerate complete combinations. A cheap partial referral tier must not
  // prevent selecting a higher tier in that same item (Sean 2026-10-01).
  const groups = ["referral", "oneToOne", "education"].map(item => [null, ...options.filter(o => o.item === item)]);
  const combinations = [];
  for (const referral of groups[0]) for (const oneToOne of groups[1]) for (const education of groups[2]) {
    const path = [referral, oneToOne, education].filter(Boolean);
    combinations.push({ path, gain: path.reduce((sum, o) => sum + o.pointsGain, 0), cost: path.reduce((sum, o) => sum + o.extraActions, 0) });
  }
  const covering = combinations.filter(p => p.gain >= gapToGreen).sort((a, b) => a.cost - b.cost || a.gain - b.gain || a.path.length - b.path.length);
  const selected = covering[0] || combinations.sort((a, b) => b.gain - a.gain || a.cost - b.cost)[0];
  const path = selected.path;
  const additionalActions = Object.fromEntries(["referral", "oneToOne", "education"].map(item => [item, path.find(o => o.item === item)?.extraActions || 0]));
  const monthlyActions = { referral: Math.ceil(1.5 * monthWeeks) + additionalActions.referral, oneToOne: 2 * monthWeeks + additionalActions.oneToOne, education: additionalActions.education };
  const controllableCeiling = scored.scores.absence + scored.scores.visitor + scored.scores.tyfcb + 20 + 15 + 15;
  const attendanceBlocksGreen = scored.scores.absence < 20 && controllableCeiling < 70;
  const alternatives = [];
  if (attendanceBlocksGreen) {
    const visitors = [{ target: m.visitors, gain: 0 }, ...[[7, 10], [11, 15]].filter(([, points]) => points > scored.scores.visitor).map(([target, points]) => ({ target, gain: points - scored.scores.visitor }))];
    const transactions = [{ target: m.tyfcb, gain: 0 }, ...[[400000, 5], [800000, 10], [2000000, 15]].filter(([, points]) => points > scored.scores.tyfcb).map(([target, points]) => ({ target, gain: points - scored.scores.tyfcb }))];
    const plans = visitors.flatMap(v => transactions.map(t => ({ v, t, gain: v.gain + t.gain, count: Number(v.gain > 0) + Number(t.gain > 0) })))
      .filter(p => controllableCeiling + p.gain >= 70)
      .sort((a, b) => a.count - b.count || a.t.target - b.t.target || a.v.target - b.v.target);
    const alternative = plans[0];
    if (alternative?.v.gain) alternatives.push({ item: "visitor", condition: "窗口累計來賓 " + alternative.v.target + " 位（目前 " + m.visitors + "，還需 " + Math.max(0, alternative.v.target - m.visitors) + " 位）", pointsGain: alternative.v.gain, note: "僅因缺席失分，三項補滿仍未達70分；與列出的其他替代項合併" });
    if (alternative?.t.gain) alternatives.push({ item: "tyfcb", condition: "窗口累計交易 " + alternative.t.target / 10000 + " 萬（目前 " + (m.tyfcb / 10000).toFixed(1) + " 萬，還需 " + Math.max(0, alternative.t.target - m.tyfcb).toLocaleString() + " 元）", pointsGain: alternative.t.gain, note: "僅因缺席失分，三項補滿仍未達70分；與列出的其他替代項合併" });
  }
  return {
    name: scored.name, total: scored.total, gapToGreen,
    windowNote: `估算：6 個月滾動窗，滾出約 ${rolledOut} 週、本月以 ${monthWeeks} 週計`,
    options, cheapestPath: path, pathCoversGap: selected.gain >= gapToGreen,
    monthlyActions, additionalActions, controllableCeiling, attendanceBlocksGreen,
    attendanceReason: attendanceBlocksGreen
      ? `等效缺席 ${scored.equivalentAbsence} 次，出席項得 ${scored.scores.absence}／20 分；引薦 20＋一對一 15＋培訓 15 分全拿滿，再加目前來賓 ${scored.scores.visitor}＋交易 ${scored.scores.tyfcb} 分，最高 ${controllableCeiling} 分，距綠燈仍差 ${70 - controllableCeiling} 分。缺席紀錄滾出半年計分期間後須重新估算。`
      : null,
    highWorkload: additionalActions.referral > 12 || additionalActions.oneToOne > 12,
    projectedScore: scored.total + selected.gain,
    alternatives, estimated: true,
  };
}

function normalizedMemberName(value = "") {
  return String(value).replace(/\s+/g, "").trim();
}

function dateOnly(value = "") {
  const result = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : "";
}

// 期中關懷（入會 5–7 個月）與新會員追蹤（未滿 5 個月）。
// 同一入會／復會週期已完成的正式期中任務不再列為待關懷；舊週期紀錄不能排除新週期。
// 一旦同週期已有未完成的正式期中任務，即使超過 7 個月也要跨月延續，直到完成為止。
export function lifecycleLists(activeScored, tenureByName, reportEnd, {
  midtermCompletions = [],
  midtermTasks = [],
  asOf = reportEnd,
} = {}) {
  const midterm = [];
  const newMembers = [];
  const completedMidterm = [];
  for (const s of activeScored) {
    const t = memberTenure(tenureByName.get(s.name), reportEnd);
    if (t.months === null) continue;
    const matchingCompletion = midtermCompletions
      .filter((item) => {
        const completedOn = dateOnly(item.completedAt);
        return normalizedMemberName(item.name) === normalizedMemberName(s.name)
          && completedOn >= t.startDate
          && completedOn <= asOf;
      })
      .sort((left, right) => dateOnly(right.completedAt).localeCompare(dateOnly(left.completedAt)))[0];
    const matchingTask = midtermTasks
      .filter((item) => {
        const taskOn = dateOnly(item.createdAt || item.scheduledAt || item.dueAt);
        const status = String(item.status || "pending");
        return normalizedMemberName(item.name) === normalizedMemberName(s.name)
          && ["pending", "in_progress"].includes(status)
          && taskOn >= t.startDate
          && taskOn <= asOf;
      })
      .sort((left, right) => dateOnly(right.createdAt || right.scheduledAt || right.dueAt)
        .localeCompare(dateOnly(left.createdAt || left.scheduledAt || left.dueAt)))[0];
    const inStandardWindow = t.months >= 5 && t.months <= 7;
    const matchingTaskDate = dateOnly(matchingTask?.createdAt || matchingTask?.scheduledAt || matchingTask?.dueAt);
    const carriedForward = Boolean(matchingTask && (matchingTaskDate < `${reportEnd.slice(0, 7)}-01` || !inStandardWindow));
    if (inStandardWindow || matchingTask) {
      if (matchingCompletion) {
        completedMidterm.push({
          name: s.name,
          startDate: t.startDate,
          completedAt: matchingCompletion.completedAt,
          sourceReference: matchingCompletion.sourceReference || "",
        });
        continue;
      }
      midterm.push({
        name: s.name,
        startDate: t.startDate,
        months: t.months,
        rejoin: t.rejoin,
        total: s.total,
        light: s.light,
        carriedForward,
        taskReference: matchingTask?.sourceReference || matchingTask?.id || "",
        taskStatus: matchingTask?.status || "",
        scheduledAt: matchingTask?.scheduledAt || matchingTask?.dueAt || "",
      });
    }
    else if (t.months < 5) newMembers.push({ name: s.name, startDate: t.startDate, months: t.months, weeks: s.weeks, total: s.total, light: s.light });
  }
  return { midterm, newMembers, completedMidterm };
}
