// 三種 BNI Connect 報表的結構化解析。欄位索引依 AGENTS.md 2026-07-07 校正版。
import { readFileSync } from "node:fs";
import { parseXmlSpreadsheet, toNumber, extractPeriod } from "./xml-sheet.mjs";

const SUMMARY_NAMES = new Set(["來賓", "BNI", "總數"]);

export function normalizeName(name) {
  return String(name || "").replace(/\s+/g, "");
}

// 檔案一：PALMS 報告。表頭以「首欄含『姓』的列」動態定位。
export function parsePalms(filePath) {
  const rows = parseXmlSpreadsheet(readFileSync(filePath, "utf8"));
  const headerIndex = rows.findIndex((r) => String(r[0] || "").includes("姓"));
  if (headerIndex < 0) throw new Error(`找不到 PALMS 表頭列：${filePath}`);
  const period = extractPeriod(rows, headerIndex);
  const members = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const c = rows[i];
    const surname = String(c[0] || "").trim();
    if (!surname || SUMMARY_NAMES.has(surname)) continue;
    members.push({
      name: normalizeName(surname + (c[1] || "")),
      surname,
      givenName: String(c[1] || "").trim(),
      present: toNumber(c[3]),
      absent: toNumber(c[4]),
      late: toNumber(c[5]),
      medical: toNumber(c[6]),
      substitute: toNumber(c[8]),
      refGivenInternal: toNumber(c[10]),
      refGivenExternal: toNumber(c[11]),
      refReceivedInternal: toNumber(c[13]),
      refReceivedExternal: toNumber(c[14]),
      visitors: toNumber(c[15]),
      oneToOne: toNumber(c[17]),
      tyfcb: toNumber(c[18]),
      ceu: toNumber(c[19]),
    });
  }
  if (members.length === 0) throw new Error(`PALMS 解析不到任何會員資料列：${filePath}`);
  return { period, members, headerIndex, rowCount: rows.length };
}

// 檔案二：會員到期日報告。
// 2026-07-19 實測：單一檔案含多個區段（現任主表／新會員／逾期會員），各區段表頭與欄位位置不同，
// 必須依各區段表頭標籤動態對應欄位，不可寫死索引。
// 逾期會員可能出現在「逾期會員」區段（2026-07 匯出實測含黃庭安、馬鼎鈞），
// 也可能完全不出現（規格原記載情況）；與 PALMS 的交叉比對仍必須保留。
const EXPIRY_LABELS = {
  name: "會員姓名",
  occupation: "職業",
  roleType: "類型",
  status: "會員狀態",
  expiryDate: "到期日期",
  autoRenewal: "AutoRenewal Enabled",
  startDate: "開始日期",
};

export function parseExpiry(filePath) {
  const rows = parseXmlSpreadsheet(readFileSync(filePath, "utf8"));
  const members = [];
  let colMap = null; // 目前區段的欄位對應 { field: colIndex }
  let section = "current";
  for (const row of rows) {
    const cells = row.map((c) => String(c || "").trim());
    const firstNonEmpty = cells.find((c) => c !== "") || "";
    if (firstNonEmpty === "新會員") { section = "new"; colMap = null; continue; }
    if (firstNonEmpty === "逾期會員") { section = "expired"; colMap = null; continue; }
    // 表頭列：含「會員姓名」標籤 → 依標籤建立本區段欄位對應
    if (cells.includes(EXPIRY_LABELS.name)) {
      colMap = {};
      for (const [field, label] of Object.entries(EXPIRY_LABELS)) {
        const idx = cells.findIndex((c) => c === label || c === `${label}:`);
        if (idx >= 0) colMap[field] = idx;
      }
      continue;
    }
    if (!colMap || colMap.name === undefined) continue;
    const name = normalizeName(cells[colMap.name]);
    if (!name || name === EXPIRY_LABELS.name) continue;
    const pick = (field) => (colMap[field] !== undefined ? cells[colMap[field]] : "");
    const dateOf = (raw) => {
      const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    members.push({
      name,
      section,
      occupation: pick("occupation"),
      roleType: pick("roleType"),
      status: pick("status"),
      expiryDate: dateOf(pick("expiryDate")),
      autoRenewal: pick("autoRenewal"),
      startDate: dateOf(pick("startDate")),
    });
  }
  if (members.length === 0) throw new Error(`到期日報告解析不到任何資料列：${filePath}`);
  return { members };
}

// 檔案三：會齡報告。只使用累計開始日期（index 6）；復會判斷另需最近開始日期（index 10，僅供身份判斷）。
export function parseTenure(filePath) {
  const rows = parseXmlSpreadsheet(readFileSync(filePath, "utf8"));
  const members = [];
  for (const c of rows) {
    const startRaw = String(c[6] || "").trim();
    const m = startRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    const name = normalizeName(String(c[1] || "") + String(c[3] || ""));
    if (!name) continue;
    const recentRaw = String(c[10] || "").trim();
    const recent = recentRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    members.push({ name, cumulativeStart: m[1], recentStart: recent ? recent[1] : null });
  }
  if (members.length === 0) throw new Error(`會齡報告解析不到任何資料列：${filePath}`);
  return { members };
}

// 離會名單：data/departed-members.md 的表格列。
export function parseDeparted(filePath) {
  const text = readFileSync(filePath, "utf8");
  const names = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (m && m[1] !== "姓名") names.push({ name: normalizeName(m[1]), confirmedAt: m[2] });
  }
  return names;
}
