// 官方公告回歸測試：引擎計分必須與 data/reference/official-scores-2026-06.md 逐人逐項完全吻合（46/46）。
// 任何一項不吻合即以非零碼結束——「不吻合先解決差異再往下」。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parsePalms, normalizeName } from "./parse-reports.mjs";
import { scoreMember, reportTotalWeeks } from "./score.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseOfficialTable(filePath) {
  const rows = [];
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const cells = m.slice(2).map((s) => s.trim());
    rows.push({
      name: normalizeName(cells[0]),
      weeks: Number(cells[1]),
      absence: Number(cells[2]) + Number(cells[3]), // 官方表缺席欄＋遲到欄合為缺席項得分
      referral: Number(cells[4]),
      visitor: Number(cells[5]),
      oneToOne: Number(cells[6]),
      education: Number(cells[7]),
      tyfcb: Number(cells[8]),
      total: Number(cells[9]),
    });
  }
  return rows;
}

const palms = parsePalms(path.join(ROOT, "data/baseline/palms.xls"));
const official = parseOfficialTable(path.join(ROOT, "data/reference/official-scores-2026-06.md"));
const totalWeeks = reportTotalWeeks(palms.members);

console.log(`報表期間：${palms.period.start} ~ ${palms.period.end}｜PALMS 人數：${palms.members.length}｜官方名單：${official.length}｜報表總週數：${totalWeeks}`);

const computedByName = new Map(palms.members.map((m) => [m.name, scoreMember(m, totalWeeks)]));
const failures = [];
let matched = 0;

for (const o of official) {
  const c = computedByName.get(o.name);
  if (!c) {
    failures.push(`${o.name}：官方名單有此人但 PALMS 解析結果中找不到`);
    continue;
  }
  const checks = [
    ["週數", c.weeks, o.weeks],
    ["缺席", c.scores.absence, o.absence],
    ["提供引薦", c.scores.referral, o.referral],
    ["來賓", c.scores.visitor, o.visitor],
    ["一對一", c.scores.oneToOne, o.oneToOne],
    ["分會教育", c.scores.education, o.education],
    ["交易價值", c.scores.tyfcb, o.tyfcb],
    ["總分", c.total, o.total],
  ];
  const diffs = checks.filter(([, got, want]) => got !== want);
  if (diffs.length === 0) {
    matched += 1;
  } else {
    failures.push(`${o.name}：${diffs.map(([label, got, want]) => `${label} 引擎 ${got}／官方 ${want}`).join("、")}`);
  }
}

for (const m of palms.members) {
  if (!official.some((o) => o.name === m.name)) {
    failures.push(`${m.name}：PALMS 有此人但官方名單中找不到`);
  }
}

console.log(`逐項完全吻合：${matched}/${official.length}`);
if (failures.length > 0) {
  console.error("不吻合清單：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("回歸測試通過：引擎輸出與官方公告逐人逐項完全一致。");
