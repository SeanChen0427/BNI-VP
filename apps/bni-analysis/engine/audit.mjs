// 數據真實性審計（SKILL.md 模組六）：解析逐週審計報告並跑五個偵測族。
// 定位是提前關懷不是辦案；門檻為暫定（校準期），輸出一律附「校準期・非結論」標記。
// 判讀基準：data/reference/audit-2026-06-observations.md（一對一 slip 單向登錄屬正常）。
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseXmlSpreadsheet, toNumber } from "./xml-sheet.mjs";
import { normalizeName } from "./parse-reports.mjs";

export function parseAuditWeek(filePath) {
  const rows = parseXmlSpreadsheet(readFileSync(filePath, "utf8"));
  const title = String(rows[0]?.[0] || "");
  const wm = title.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const week = wm ? `${wm[3]}-${wm[2]}-${wm[1]}` : null;
  const headerIndex = rows.findIndex((r) => String(r[0] || "").trim() === "自");
  if (headerIndex < 0) throw new Error(`找不到審計報告表頭（自）：${filePath}`);
  const events = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const c = rows[i];
    const from = normalizeName(c[0]);
    if (!from) continue;
    events.push({
      week,
      from,
      to: normalizeName(c[1]),
      type: String(c[3] || "").trim(),
      inOut: String(c[5] || "").trim(),
      amount: toNumber(c[6]),
      ceu: toNumber(c[8]),
      detail: String(c[9] || "").trim(),
    });
  }
  return { week, events };
}

export function loadAuditMonth(dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".xls")).sort();
  const weeks = [];
  const events = [];
  for (const f of files) {
    const parsed = parseAuditWeek(path.join(dirPath, f));
    weeks.push(parsed.week);
    events.push(...parsed.events);
  }
  return { weeks, events };
}

const pairKey = (a, b) => [a, b].sort().join("｜");

// activeScored：本期現任已計分名單（提供 PALMS 半年量與交易價值）。
export function runAuditFamilies({ events, weeks, activeScored }) {
  const names = new Set(activeScored.map((s) => s.name));
  const byName = new Map(activeScored.map((s) => [s.name, s]));
  const observations = [];

  const oto = events.filter((e) => e.type.includes("一對一"));
  const refs = events.filter((e) => e.type.includes("引薦"));

  // 配對統計（一對一以參與雙方計，不分登錄方向——單向登錄屬正常）
  const otoByMember = new Map();
  const otoPairs = new Map();
  for (const e of oto) {
    for (const person of [e.from, e.to]) {
      if (!names.has(person)) continue;
      otoByMember.set(person, (otoByMember.get(person) || 0) + 1);
    }
    if (names.has(e.from) || names.has(e.to)) {
      const k = pairKey(e.from, e.to);
      otoPairs.set(k, (otoPairs.get(k) || 0) + 1);
    }
  }
  const refGivenBy = new Map();
  const refPairs = new Map(); // 有向 from→to
  for (const e of refs) {
    if (!names.has(e.from)) continue;
    refGivenBy.set(e.from, (refGivenBy.get(e.from) || 0) + 1);
    const k = `${e.from}→${e.to}`;
    refPairs.set(k, (refPairs.get(k) || 0) + 1);
  }

  const hit = (name, family, evidence) => {
    let obs = observations.find((o) => o.name === name);
    if (!obs) { obs = { name, families: [], evidence: [] }; observations.push(obs); }
    if (!obs.families.includes(family)) obs.families.push(family);
    obs.evidence.push(evidence);
  };

  // 族 B：集中度。一對一 Top1 佔比 >= 30% 且總數 >= 15；引薦給單一對象佔比 >= 40%（門檻暫定）。
  for (const [name, total] of otoByMember) {
    if (total < 15) continue;
    let top = { partner: null, count: 0 };
    for (const [k, count] of otoPairs) {
      if (!k.includes(name)) continue;
      if (count > top.count) top = { partner: k.split("｜").find((p) => p !== name), count };
    }
    if (top.count / total >= 0.3) {
      hit(name, "B", `月內一對一 ${total} 筆，與 ${top.partner} ${top.count} 筆（${Math.round((top.count / total) * 100)}%）`);
    }
  }
  for (const [name, total] of refGivenBy) {
    if (total < 5) continue; // 樣本太小不評
    let top = { to: null, count: 0 };
    for (const [k, count] of refPairs) {
      if (!k.startsWith(`${name}→`)) continue;
      if (count > top.count) top = { to: k.split("→")[1], count };
    }
    if (top.count / total >= 0.4) {
      hit(name, "B", `月內提供引薦 ${total} 筆，${top.count} 筆（${Math.round((top.count / total) * 100)}%）給同一對象 ${top.to}${names.has(top.to) ? "" : "（外部對象，難驗證）"}`);
    }
  }

  // 族 C：互惠對稱。互為一對一 Top1 且引薦筆數對稱（差 <= 20%）且雙方交易價值 = 0。
  const top1Of = (name) => {
    let top = { partner: null, count: 0 };
    for (const [k, count] of otoPairs) {
      if (!k.includes(name)) continue;
      if (count > top.count) top = { partner: k.split("｜").find((p) => p !== name), count };
    }
    return top;
  };
  const checkedPairs = new Set();
  for (const name of otoByMember.keys()) {
    const t1 = top1Of(name);
    if (!t1.partner || !names.has(t1.partner)) continue;
    const k = pairKey(name, t1.partner);
    if (checkedPairs.has(k)) continue;
    checkedPairs.add(k);
    const back = top1Of(t1.partner);
    if (back.partner !== name) continue;
    const ab = refPairs.get(`${name}→${t1.partner}`) || 0;
    const ba = refPairs.get(`${t1.partner}→${name}`) || 0;
    const symmetric = ab > 0 && ba > 0 && Math.abs(ab - ba) / Math.max(ab, ba) <= 0.2;
    const bothZeroTyfcb = (byName.get(name)?.metrics.tyfcb || 0) === 0 && (byName.get(t1.partner)?.metrics.tyfcb || 0) === 0;
    if (symmetric && bothZeroTyfcb) {
      hit(name, "C", `與 ${t1.partner} 互為一對一 Top1（${t1.count} 筆），引薦 ${ab}↔${ba} 對稱且雙方交易價值 0`);
      hit(t1.partner, "C", `與 ${name} 互為一對一 Top1，引薦 ${ba}↔${ab} 對稱且雙方交易價值 0`);
    }
  }

  // 族 D：產出驗證（借用 PALMS 半年量與交易價值：審計無 TYFCB 事件）。
  const otoVolumes = activeScored.map((s) => s.metrics.otoPerWeek * s.weeks).sort((a, b) => b - a);
  const refVolumes = activeScored.map((s) => s.metrics.refGiven).sort((a, b) => b - a);
  const p30 = (arr) => arr[Math.max(0, Math.floor(arr.length * 0.3) - 1)] ?? Infinity;
  const otoP30 = p30(otoVolumes);
  const refP30 = p30(refVolumes);
  for (const s of activeScored) {
    const otoTotal = Math.round(s.metrics.otoPerWeek * s.weeks);
    if (s.metrics.tyfcb === 0 && (otoTotal >= otoP30 || s.metrics.refGiven >= refP30) && (otoTotal > 0 || s.metrics.refGiven > 0)) {
      hit(s.name, "D", `半年一對一 ${otoTotal} 次／提供引薦 ${s.metrics.refGiven} 筆屬分會前 30%，但交易價值 0（PALMS）`);
    }
    const extShare = s.metrics.refGiven > 0 ? s.metrics.refGivenExternal / s.metrics.refGiven : 0;
    if (s.metrics.refGiven >= 10 && extShare >= 0.8 && s.metrics.tyfcb === 0) {
      hit(s.name, "D", `外部引薦佔比 ${Math.round(extShare * 100)}% 且零成交`);
    }
  }

  // 族 E：時間模式（週級解析度）。週均 > 5 持續（本月資料內 >= 4 週）；單月量佔半年量 >= 40%。
  const weeklyByMember = new Map();
  for (const e of oto) {
    for (const person of [e.from, e.to]) {
      if (!names.has(person)) continue;
      if (!weeklyByMember.has(person)) weeklyByMember.set(person, new Map());
      const wk = weeklyByMember.get(person);
      wk.set(e.week, (wk.get(e.week) || 0) + 1);
    }
  }
  for (const [name, wk] of weeklyByMember) {
    const over5 = [...wk.values()].filter((v) => v > 5).length;
    if (over5 >= 4) hit(name, "E", `一對一週均 > 5 筆達 ${over5} 週（本月共 ${weeks.length} 週）`);
    const monthTotal = otoByMember.get(name) || 0;
    const halfYear = Math.round((byName.get(name)?.metrics.otoPerWeek || 0) * (byName.get(name)?.weeks || 0));
    if (halfYear >= 15 && monthTotal / halfYear >= 0.4) {
      hit(name, "E", `單月一對一 ${monthTotal} 筆佔半年總量 ${halfYear} 筆的 ${Math.round((monthTotal / halfYear) * 100)}%`);
    }
  }

  for (const o of observations) {
    o.level = o.families.length >= 2 ? "red" : "yellow";
    o.calibration = "校準期・非結論";
  }
  observations.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));

  return {
    totals: {
      events: events.length,
      oneToOne: oto.length,
      referrals: refs.length,
      weeks: weeks.length,
      weeklyCounts: weeks.map((w) => ({ week: w, count: events.filter((e) => e.week === w).length })),
    },
    observations,
  };
}
