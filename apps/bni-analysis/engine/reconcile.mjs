// 「先對帳，後分析」的程式化實作（AGENTS.md 六條核心紀律第 2 條）。
// 任一 blocking 異常存在時，上層不得產生分析草稿。
import { normalizeName } from "./parse-reports.mjs";

// palms: parsePalms 結果；expiry: parseExpiry 結果；tenure: parseTenure 結果；
// departed: parseDeparted 結果；officialSyncPending: 已由 PALMS 唯一對帳升格、
// 但較舊的中心區到期／會齡報告尚未收錄的會員。此清單只改變缺檔語意，
// 不得拿登錄日期代替官方會齡，也不得掩蓋報告已明列的逾期狀態。
export function reconcile({ palms, expiry, tenure, departed, officialSyncPending = [] }) {
  const issues = [];
  const departedNames = new Set(departed.map((d) => d.name));
  const pendingByName = new Map(officialSyncPending.map((item) => [
    normalizeName(item.name),
    { ...item, fields: new Set(Array.isArray(item.fields) ? item.fields : []) },
  ]));
  const pendingOfficialByName = new Map();
  const markPending = (name, field) => {
    const pending = pendingByName.get(normalizeName(name));
    if (!pending?.fields.has(field)) return false;
    const current = pendingOfficialByName.get(name) || {
      name,
      missing: [],
      promotedAt: pending.promotedAt || null,
      status: "pending-official-sync",
    };
    if (!current.missing.includes(field)) current.missing.push(field);
    pendingOfficialByName.set(name, current);
    return true;
  };

  if (!palms.period.start || !palms.period.end) {
    issues.push({ level: "blocking", code: "period-missing", message: "PALMS 報表期間解析失敗，無法確認資料期別" });
  }

  // 現任會員 = PALMS 名單扣除離會者
  const active = palms.members.filter((m) => !departedNames.has(m.name));
  const excludedDeparted = palms.members.filter((m) => departedNames.has(m.name)).map((m) => m.name);

  const expiryByName = new Map(expiry.members.map((m) => [m.name, m]));
  const tenureByName = new Map(tenure.members.map((m) => [m.name, m]));

  // 最高優先：已到期未續約。兩種形態：
  // (a) PALMS 有、到期報告完全缺席；(b) 到期報告將其列於「逾期會員」區段（2026-07 匯出實測）。
  const expiredUnrenewed = [];
  for (const m of active) {
    const e = expiryByName.get(m.name);
    if (!e) {
      if (markPending(m.name, "expiry")) continue;
      expiredUnrenewed.push(m.name);
      issues.push({
        level: "critical",
        code: "expired-unrenewed",
        member: m.name,
        message: `${m.name}：PALMS 名單存在但到期報告缺席，判定為已到期未續約（最高優先示警）`,
      });
    } else if (e.section === "expired" || e.status === "逾期") {
      expiredUnrenewed.push(m.name);
      issues.push({
        level: "critical",
        code: "expired-unrenewed",
        member: m.name,
        message: `${m.name}：到期報告列於逾期會員區段（到期日 ${e.expiryDate ?? "未知"}），已到期未續約（最高優先示警）`,
      });
    }
  }

  // 到期報告有、PALMS 沒有：可能是新入會（尚無出勤）或名單異常，必須逐一解釋
  const palmsNames = new Set(palms.members.map((m) => m.name));
  for (const e of expiry.members) {
    if (!palmsNames.has(e.name) && !departedNames.has(e.name)) {
      issues.push({
        level: "blocking",
        code: "expiry-only",
        member: e.name,
        message: `${e.name}：到期報告存在但 PALMS 名單找不到，請由副主席確認是否已離會；若是新入會或姓名不一致則先修正資料`,
      });
    }
  }

  // 會齡報告缺人：影響會齡顯示與期中關懷判斷，列警告
  for (const m of active) {
    if (!tenureByName.has(m.name)) {
      if (markPending(m.name, "tenure")) continue;
      issues.push({
        level: "warning",
        code: "tenure-missing",
        member: m.name,
        message: `${m.name}：會齡報告中找不到，會齡與期中關懷時點無法判定`,
      });
    }
  }

  // 週數異常（<= 0 改用報表總週數者）
  for (const m of active) {
    const raw = m.present + m.absent + m.late + m.medical + m.substitute;
    if (raw <= 0) {
      issues.push({ level: "warning", code: "weeks-anomaly", member: m.name, message: `${m.name}：出勤欄位加總為 0，週數異常待查` });
    }
  }

  const blocking = issues.filter((i) => i.level === "blocking");
  return {
    ok: blocking.length === 0,
    activeMembers: active,
    excludedDeparted,
    expiredUnrenewed,
    pendingOfficialData: [...pendingOfficialByName.values()],
    counts: { palms: palms.members.length, expiry: expiry.members.length, tenure: tenure.members.length, active: active.length },
    issues,
  };
}

export { normalizeName };
