// Operational projection only. Never write this over the published historical snapshot.
// Scores and PALMS metrics are retained verbatim; only the population and its counts change.
const nameKey = value => String(value || "").replace(/\s+/g, "");

export function projectCurrentRoster(published, roster) {
  if (!Array.isArray(published?.members) || !Array.isArray(roster)) throw new Error("缺少會員快照或現任名單");
  const current = new Map(roster.map(member => [nameKey(member.name), member]));
  if (current.has("") || current.size !== roster.length) throw new Error("現任會員名單姓名缺漏或重複");
  const sourceNames = new Set(published.members.map(member => nameKey(member.name)));
  const missing = [...current.keys()].filter(name => !sourceNames.has(name));
  if (missing.length) throw new Error(`現任會員與分析快照對帳失敗：缺少 ${missing.join("、")}，請更新分析`);
  const result = structuredClone(published);
  const excluded = published.members.filter(member => !current.has(nameKey(member.name))).map(member => nameKey(member.name));
  result.members = result.members.filter(member => current.has(nameKey(member.name))).map(member => {
    const live = current.get(nameKey(member.name));
    return { ...member, ...(live.memberId ? { memberId: live.memberId } : {}), ...(live.profession !== undefined ? { profession: live.profession } : {}) };
  });
  result.roster = { scope: "current-active", count: roster.length, publishedCount: published.members.length, excludedCount: excluded.length };
  result.memberData = { ...result.memberData, count: roster.length };
  if (!excluded.length) return result;

  const excludedPatterns = excluded.map(name => new RegExp(`(?<![\\p{L}])${[...name].map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*")}(?![\\p{L}])`, "u"));
  const mentionsExcluded = value => excludedPatterns.some(pattern => pattern.test(String(value || "")));
  const counts = { green: 0, yellow: 0, red: 0, black: 0 };
  for (const member of result.members) {
    const light = ({ "綠": "green", "黃": "yellow", "紅": "red", "黑": "black", "綠燈": "green", "黃燈": "yellow", "紅燈": "red", "黑燈": "black" })[member.light] || member.light;
    if (!(light in counts)) throw new Error("現任會員燈號資料不完整");
    counts[light]++;
  }
  const greenRate = roster.length ? Math.round(counts.green / roster.length * 100) : 0;
  Object.assign(result.summary, { totalMembers: roster.length, greenRate, greenRateDisplay: `${greenRate}%`,
    ...Object.fromEntries(Object.entries(counts).map(([light, count]) => [`${light}Count`, count])) });
  result.report.subheading = `現任 ${roster.length} 人｜名單依目前會籍同步；分數沿用已發布報表`;
  result.sections = (result.sections || []).map(section => {
    section.tables = (section.tables || []).map(table => ({ ...table, rows: table.rows.filter(row => !mentionsExcluded(row[0])) }));
    section.cards = (section.cards || []).filter(card => !mentionsExcluded(`${card.title} ${card.detail} ${card.action}`));
    if (section.title.includes("續約雷達")) {
      const rows = section.tables.flatMap(table => table.rows);
      // These action labels are the renderer's published classification, not a new date/score rule.
      const due = rows.filter(row => /立即聯繫確認去留|立即確認續約申請與繳費|本月完成續約申請與繳費/.test(row[5] || "")).length;
      const warnings = rows.filter(row => /續約審查前優先補培訓|補培訓即可達標|聚焦邀賓/.test(row[5] || "")).length;
      result.summary.renewalDue = due;
      result.summary.renewalWarnings = warnings;
      section.badges = [`${due} 筆截止／逾期`, `${warnings} 筆審查預警`];
    } else if (section.title.includes("燈號關懷")) {
      section.badges = [`紅燈 ${counts.red}`, `黑燈 ${counts.black}`, `黃燈 ${counts.yellow}`];
    } else if (section.title.includes("黃燈突圍")) {
      section.badges = [`${section.tables.reduce((n, table) => n + table.rows.length, 0)} 位`, "估算"];
    } else if (section.title.includes("審計觀察")) {
      result.summary.auditObservations = section.cards.length;
      section.badges = [`${section.cards.length} 位`, "校準期・非結論"];
      section.note = "以下保留現任會員的已發布審計觀察；證據與報表期間不變，並非即時紀錄。";
    } else if (section.title.includes("期中關懷") || section.title.includes("中心資料待同步")) {
      section.badges = [`${section.cards.length} 位`];
    } else if (section.title.includes("結構性洞察")) {
      section.note = "以下為報表發布時的整體觀察，文中母體與數據屬歷史報表；目前人數以頁首現任會員為準。";
    }
    return section;
  });
  result.officialDataPending = (result.officialDataPending || []).filter(member => current.has(nameKey(member.name)));
  result.stats = (result.stats || []).map(stat => {
    let value;
    if (stat.label.includes("綠燈率")) return { ...stat, label: `綠燈率 ${counts.green}/${roster.length}（目標 60%）`, value: greenRate, displayValue: `${greenRate}%` };
    if (stat.label.includes("本週續約截止")) value = result.summary.renewalDue;
    else if (stat.label.includes("續約審查預警")) value = result.summary.renewalWarnings;
    else if (stat.label.includes("審計觀察")) value = result.summary.auditObservations;
    else if (/紅.*燈會員/.test(stat.label)) value = counts.red + counts.black;
    return value === undefined ? stat : { ...stat, value, displayValue: String(value) };
  });
  // AI prose is historical, not a safe source for new assignments after the population changes.
  result.analysisReview = null;
  result.sections = result.sections.filter(section => !section.title.includes("AI 審視報告"));
  return result;
}
