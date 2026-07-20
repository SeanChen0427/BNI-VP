// 六項計分、燈號與行業別開放警示。
// 規則版本：AGENTS.md 2026-07-07 確認版（2026-01–06 期官方資料 46/46 驗證）。
// 修改任何門檻前必須依「驗證優先於信任」紀律取得官方對照資料。

const EPS = 1e-9;

// 實際在會週數 = 出席+缺席+遲到+病假+代理人（上限報表總週數）。
// 週數 <= 0 屬資料異常：改用報表總週數並標記待查。
export function memberWeeks(m, totalWeeks) {
  const raw = m.present + m.absent + m.late + m.medical + m.substitute;
  if (raw <= 0) return { weeks: totalWeeks, anomaly: true };
  return { weeks: Math.min(raw, totalWeeks), anomaly: false };
}

export function equivalentAbsence(m) {
  return m.absent + Math.floor(m.late / 3);
}

function absenceScore(eqAbs) {
  if (eqAbs <= 0) return 20;
  if (eqAbs === 1) return 15;
  if (eqAbs === 2) return 10;
  return 0;
}

function referralScore(perWeek) {
  if (perWeek + EPS >= 1.5) return 20;
  if (perWeek + EPS >= 1.2) return 15;
  if (perWeek + EPS >= 0.8) return 10;
  if (perWeek + EPS >= 0.6) return 5;
  return 0;
}

function visitorScore(count) {
  if (count >= 11) return 15; // 15 分門檻暫定 >= 11（僅確認 > 10），無 5 分段
  if (count >= 7) return 10;
  return 0;
}

function oneToOneScore(perWeek) {
  if (perWeek + EPS >= 2.0) return 15;
  if (perWeek + EPS >= 1.0) return 10;
  if (perWeek + EPS >= 0.5) return 5;
  return 0;
}

function educationScore(ceu) {
  if (ceu + EPS >= 6) return 15;
  if (ceu + EPS >= 4) return 10;
  if (ceu + EPS >= 2) return 5;
  return 0;
}

function tyfcbScore(amountYuan) {
  const wan = amountYuan / 10000; // PALMS 單位為元
  if (wan + EPS >= 200) return 15;
  if (wan + EPS >= 80) return 10;
  if (wan + EPS >= 40) return 5;
  return 0;
}

export function trafficLight(total) {
  if (total >= 70) return "green";
  if (total >= 50) return "yellow";
  if (total >= 30) return "red";
  return "black";
}

// 行業別開放：等效缺席 >= 4 或代理人 >= 8 為已開放；差 1 次為即將開放。
export function industryAlert(eqAbs, substitute) {
  if (eqAbs >= 4 || substitute >= 8) {
    return { level: "open", reasons: [eqAbs >= 4 ? `等效缺席 ${eqAbs} 次` : null, substitute >= 8 ? `代理人 ${substitute} 次` : null].filter(Boolean) };
  }
  if (eqAbs === 3 || substitute === 7) {
    return { level: "imminent", reasons: [eqAbs === 3 ? `等效缺席 ${eqAbs} 次（差 1 次開放）` : null, substitute === 7 ? `代理人 ${substitute} 次（差 1 次開放）` : null].filter(Boolean) };
  }
  return null;
}

export function scoreMember(m, totalWeeks) {
  const { weeks, anomaly } = memberWeeks(m, totalWeeks);
  const eqAbs = equivalentAbsence(m);
  const refGiven = m.refGivenInternal + m.refGivenExternal;
  const refPerWeek = refGiven / weeks;
  const otoPerWeek = m.oneToOne / weeks;
  const scores = {
    absence: absenceScore(eqAbs),
    referral: referralScore(refPerWeek),
    visitor: visitorScore(m.visitors),
    oneToOne: oneToOneScore(otoPerWeek),
    education: educationScore(m.ceu),
    tyfcb: tyfcbScore(m.tyfcb),
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return {
    name: m.name,
    weeks,
    weeksAnomaly: anomaly,
    equivalentAbsence: eqAbs,
    metrics: {
      refGiven,
      refGivenInternal: m.refGivenInternal,
      refGivenExternal: m.refGivenExternal,
      refPerWeek,
      refReceived: m.refReceivedInternal + m.refReceivedExternal,
      refReceivedPerWeek: (m.refReceivedInternal + m.refReceivedExternal) / weeks,
      otoPerWeek,
      visitors: m.visitors,
      ceu: m.ceu,
      tyfcb: m.tyfcb,
      substitute: m.substitute,
    },
    scores,
    total,
    light: trafficLight(total),
    industryAlert: industryAlert(eqAbs, m.substitute),
  };
}

// 報表總週數：取全員週數加總的最大值（資料驅動，避免以月曆天數推算的已廢止規則）。
export function reportTotalWeeks(members) {
  let max = 0;
  for (const m of members) {
    const raw = m.present + m.absent + m.late + m.medical + m.substitute;
    if (raw > max) max = raw;
  }
  return max;
}
