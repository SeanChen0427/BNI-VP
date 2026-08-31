// 會員關懷儀表板產生器：由已發佈分析快照產出 index.html。
// 樣板依 SKILL.md「HTML 儀表板規範」與 Sean 2026-07-07 定版的視覺語言（極簡低飽和，勿改回品牌深藍）。
// 輸出必須維持 bni-bridge.mjs 的解析契約：
//   <div class="sub">現任 N 人…、stats 的 n/l 結構與關鍵字（綠燈率／本週續約截止／續約審查預警／審計觀察／紅燈會員／行業別開放警示）、
//   <section><h2> 區段、card 的 t/d/action 結構、黃燈突圍表 row[0]=姓名 row[2]=需求文字。

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DOT = { green: "g", yellow: "y", red: "r", black: "r" };
const ITEM_LABEL = { referral: "引薦", oneToOne: "一對一", education: "培訓", visitor: "來賓", tyfcb: "交易" };
const ITEM_UNIT = { referral: "筆", oneToOne: "次", education: "分" };

function dot(light) { return `<span class="dot ${DOT[light] || "r"}"></span>`; }

function pathChipText(option) {
  return `${ITEM_LABEL[option.item]} +${option.extraActions} ${ITEM_UNIT[option.item] || ""}`.trim();
}

function altChipText(alt) {
  const m = alt.condition.match(/^(.*?)（/);
  return `${m ? m[1] : alt.condition}（+${alt.pointsGain}）`;
}

function radarChips(entry) {
  if (!entry.annual) return `<span class="chip">全年資料待補</span>`;
  const chips = [];
  const v = entry.annual.visitors;
  const c = entry.annual.ceu;
  chips.push(v >= 4 ? `<span class="chip okc">來賓 ${v} ✓</span>` : `<span class="chip bad">來賓 ${v} ✗</span>`);
  chips.push(c >= 20 ? `<span class="chip okc">培訓 ${c} ✓</span>` : `<span class="chip bad">培訓 ${c} ✗</span>`);
  return chips.join("");
}

function radarAction(entry) {
  if (entry.kind === "expired-unrenewed") return "<b>已到期未續約，立即聯繫確認去留</b>";
  if (entry.kind === "overdue") return "<b>已過截止日，立即確認續約申請與繳費狀態</b>";
  if (entry.kind === "due-this-month") return "<b>本月完成續約申請與繳費</b>";
  if (entry.kind === "weak-early-warning") {
    const both = entry.weak.reasons.length >= 2;
    const training = entry.weak.reasons.some((r) => r.includes("培訓"));
    if (both) return "來賓與培訓雙缺，續約審查前優先補培訓（見效快）";
    return training ? "補培訓即可達標" : "聚焦邀賓";
  }
  return "一般時限提醒";
}

function memberIndex(engine) {
  return new Map(engine.members.map((m) => [m.name, m]));
}

export function renderDashboard({ engine, aiReview = null, version = null, publishedAt = null }) {
  const byName = memberIndex(engine);
  const period = engine.meta.period;
  const asOf = engine.meta.asOf;
  const actionMonth = Number(asOf.slice(5, 7));
  const active = engine.reconciliation.counts.active;
  const excluded = engine.reconciliation.excludedDeparted;
  const pendingOfficialData = Array.isArray(engine.reconciliation.pendingOfficialData)
    ? engine.reconciliation.pendingOfficialData : [];
  const pendingOfficialByName = new Map(pendingOfficialData.map((item) => [item.name, item]));
  const d = engine.distribution;
  const greenPct = Math.round((d.green / active) * 100);

  const radar = engine.renewalRadar;
  const dueNow = radar.filter((r) => ["expired-unrenewed", "overdue", "due-this-month"].includes(r.kind));
  const weakWarn = radar.filter((r) => r.kind === "weak-early-warning");
  // 注意力預算（SKILL.md 儀表板規範）：紅色全上；黃色僅上多訊號者（單一集中度 B 訊號常有無辜解釋，留在 AI 審視報告）
  const auditAll = engine.audit?.observations || [];
  const auditObs = auditAll.filter((o) => o.level === "red" || o.families.some((f) => f !== "B"));
  const openAlerts = engine.members.filter((m) => m.industryAlert);
  const midtermNames = new Set(engine.lifecycle.midterm.map((m) => m.name));
  const auditNames = new Set(auditObs.map((o) => o.name));

  // 續約雷達列（顯示依截止日排序；已到期／逾期最前）
  const radarSorted = [...radar].sort((a, b) => {
    const key = (x) => (x.kind === "expired-unrenewed" ? "0000-00-00" : x.deadline || "9999-99-99");
    return key(a).localeCompare(key(b));
  });
  const radarRows = radarSorted.map((entry) => {
    const member = byName.get(entry.name);
    const rowClass = ["expired-unrenewed", "overdue", "due-this-month"].includes(entry.kind) ? ' class="u-red"'
      : entry.kind === "weak-early-warning" ? ' class="u-amber"' : "";
    const days = entry.daysLeft === undefined || entry.daysLeft === null ? "—"
      : entry.daysLeft < 0 ? `已逾 ${-entry.daysLeft} 天` : `${entry.daysLeft} 天`;
    const daysClass = entry.kind === "overdue" || entry.kind === "due-this-month" || entry.kind === "expired-unrenewed" ? " red"
      : entry.kind === "weak-early-warning" ? " amber" : "";
    return `<tr${rowClass}><td class="name">${esc(entry.name)}</td><td>${member ? `${dot(member.light)}${member.total}` : "—"}</td><td>${esc(entry.deadline || "—")}</td><td class="days${daysClass}">${esc(days)}</td><td>${entry.weak ? radarChips(entry) + (entry.weak.estimated ? '<span class="chip">估算</span>' : "") : radarChips(entry)}</td><td>${radarAction(entry)}</td></tr>`;
  }).join("\n    ");

  // 審計觀察卡
  const auditCards = auditObs.map((o) => {
    const cardClass = o.level === "red" ? "red" : "amber";
    const crossChip = midtermNames.has(o.name) ? ' <span class="chip info">期中關懷合併談</span>' : "";
    const evidence = o.evidence.map((e) => esc(e)).join("；").replace(/(\d[\d,.]*\s*[筆次%位分])/g, "<b>$1</b>");
    return `<div class="card ${cardClass}"><div class="t">${esc(o.name)}${crossChip} <span class="chip">${o.families.join("+")}</span></div><div class="d">${evidence}</div><div class="action">關懷切入：了解互動的實質收穫，確認是真實成長還是為達標衝量（非指控）</div></div>`;
  }).join("\n    ");

  // 燈號關懷：紅燈卡
  const newMemberNames = new Map(engine.lifecycle.newMembers.map((m) => [m.name, m]));
  const redCards = engine.members.filter((m) => m.light === "red" || m.light === "black").map((m) => {
    const zeroItems = Object.entries(m.scores).filter(([, v]) => v === 0).map(([k]) => `${ITEM_LABEL[k] || "缺席"} 0 分`).join("・");
    const nm = newMemberNames.get(m.name);
    const officialPending = pendingOfficialByName.get(m.name);
    const chip = officialPending
      ? ' <span class="chip info">新會員・會齡待中心同步</span>'
      : nm ? ` <span class="chip">新會員・在會 ${m.weeks} 週</span>` : "";
    const detail = `${zeroItems ? `${zeroItems}｜` : ""}引薦 ${m.metrics.refPerWeek.toFixed(2)}/週・一對一 ${m.metrics.otoPerWeek.toFixed(2)}/週`;
    const action = officialPending
      ? "先採新會員寬容追蹤；不以登錄日推算會齡，待官方報告同步後再判定期中時點"
      : nm ? "指派 Mentor，追蹤融入而非究責分數" : "深度關懷面談：了解活躍度下滑原因";
    return `<div class="card red"><div class="t">${esc(m.name)}｜${m.total} 分 ${m.light === "red" ? "紅燈" : "黑燈"}${chip}</div><div class="d">${detail}</div><div class="action">${action}</div></div>`;
  }).join("\n    ");

  const pendingSyncSection = pendingOfficialData.length ? `<section>
  <div class="sec-h"><h2>中心資料待同步</h2><span class="badge gray">${pendingOfficialData.length} 位</span></div>
  <div class="sec-note">已由本期 PALMS 唯一對帳為正式會員，仍正常納入計分；較舊的中心區報告尚未收錄時不列為錯誤、不推算官方會齡或續約期限。</div>
  <div class="cards">
    ${pendingOfficialData.map((item) => {
      const labels = item.missing.map((field) => field === "tenure" ? "會齡" : field === "expiry" ? "到期日" : field).join("、");
      return `<div class="card"><div class="t">${esc(item.name)} <span class="chip info">${esc(labels)}待中心同步</span></div><div class="d">PALMS 已納入正式計分；官方${esc(labels)}暫不顯示。</div><div class="action">更新中心區報告後自動恢復正式判定，無須手動清除提醒</div></div>`;
    }).join("\n    ")}
  </div>
</section>` : "";

  // 黃燈突圍
  const cardsData = {};
  const breakthroughRows = engine.yellowBreakthroughs.map((b) => {
    const chips = [];
    const steps = [];
    let running = b.total;
    for (const option of b.cheapestPath) {
      running += option.pointsGain;
      if (option.extraActions === 0) {
        chips.push(`<span class="chip okc">${esc(ITEM_LABEL[option.item])}維持正常參與</span>→ ${running}`);
        steps.push(`${ITEM_LABEL[option.item]}維持正常參與即可（自然達標）`);
      } else {
        chips.push(`<span class="chip warn">${esc(pathChipText(option))}</span>→ ${running}`);
        steps.push(`${ITEM_LABEL[option.item]}再多 ${option.extraActions} ${ITEM_UNIT[option.item] || ""}`.trim());
      }
    }
    if (!b.pathCoversGap && b.alternatives.length) {
      for (const alt of b.alternatives.filter((a) => a.pointsGain > 0)) {
        chips.push(`<span class="chip info">${esc(altChipText(alt))}</span>`);
        steps.push(alt.condition);
      }
    }
    cardsData[b.name] = {
      score: b.total,
      steps: steps.length ? steps : ["維持正常參與（每週一對一 2 次、引薦 1.5 筆）"],
      result: b.pathCoversGap || b.alternatives.length ? "70 分・升綠" : `目標 ${b.total + 5}–70 分`,
      note: "缺席與培訓以現值計；滾出月份的變動會使分數自動調整（估算）",
    };
    const requirement = chips.length ? chips.join("；") : "維持正常參與即可";
    return `<tr><td class="name">${esc(b.name)}</td><td>${dot("yellow")}${b.total}</td><td>${requirement}</td><td><button class="dl" onclick="dlCard('${esc(b.name)}')">下載 PNG</button></td></tr>`;
  }).join("\n    ");

  // 結構性洞察
  const structuralItems = engine.structural.structuralZeroItems.map((k) => ITEM_LABEL[k] || k).join("與");
  const idleCards = engine.greenIdles.map((idle) => {
    const member = byName.get(idle.name);
    const parts = idle.types.map((t) => {
      if (t.type === "substitute-reliance") return t.evidence;
      if (t.type === "structural-zero") return `${t.items.map((i) => ITEM_LABEL[i] || i).join("・")} 0 分`;
      return t.evidence || "";
    }).filter(Boolean).join("；");
    return `<div class="card amber"><div class="t">${esc(idle.name)}｜綠燈空轉 ${member ? dot(member.light) + member.total : ""}</div><div class="d">${esc(parts)}</div><div class="action">關懷時確認參與品質，帳面健康不等於真實收穫</div></div>`;
  }).join("\n    ");

  // 期中關懷與新會員
  const midtermCards = engine.lifecycle.midterm.map((m) => {
    const member = byName.get(m.name);
    const auditChip = auditNames.has(m.name) ? ' <span class="chip warn">與審計觀察合併談</span>' : "";
    const rejoinChip = m.rejoin ? ' <span class="chip">復會會員</span>' : "";
    const carryChip = m.carriedForward ? ' <span class="chip warn">跨月延續・完成前持續關懷</span>' : "";
    const focus = m.rejoin ? "面談聚焦：這次回來想要的收穫是否有拿到（復會者再流失風險高）"
      : auditNames.has(m.name) ? "面談聚焦：一對一與引薦的實質收穫，確認是真實成長還是衝量"
      : member && member.light !== "green" ? "面談聚焦：弱項的參與障礙與需要的協助" : "面談聚焦：確認收穫感與續留意願";
    const tenureLabel = m.carriedForward ? `已進入第 <b>${m.months} 個月</b>・原期中關懷未完成` : `滿 <b>${m.months} 個月</b>`;
    const action = m.carriedForward ? `${focus}；沿用既有案件，不另開重複任務` : focus;
    return `<div class="card${auditNames.has(m.name) || m.carriedForward ? " amber" : ""}"><div class="t">${esc(m.name)} ${member ? dot(member.light) : ""}${m.total}${rejoinChip}${auditChip}${carryChip}</div><div class="d">${esc(m.startDate || "")} 入會・${tenureLabel}｜燈號${member && member.light === "green" ? "健康" : "待提升"}</div><div class="action">${action}</div></div>`;
  }).join("\n    ");
  const newCards = engine.lifecycle.newMembers.map((m) => {
    const member = byName.get(m.name);
    const healthy = member && member.light === "green";
    return `<div class="card${healthy ? "" : " red"}"><div class="t">${esc(m.name)} ${member ? dot(member.light) : ""}${m.total} <span class="chip${healthy ? " okc" : ""}">${healthy ? "適應良好" : "新會員"}</span></div><div class="d">${esc(m.startDate || "")} 入會・在會 <b>${m.weeks} 週</b>｜引薦 ${member ? member.metrics.refPerWeek.toFixed(2) : "—"}/週・一對一 ${member ? member.metrics.otoPerWeek.toFixed(2) : "—"}/週（新會員偏低屬正常）</div><div class="action">${healthy ? "維持觀察即可" : "指派 Mentor，兩週後檢查一對一是否啟動"}</div></div>`;
  }).join("\n    ");

  const aiSection = aiReview ? `
<section>
  <div class="sec-h"><h2>本月 AI 審視報告</h2><span class="badge gray">${esc(aiReview.provider)}・${esc(aiReview.model)}</span><span class="badge green">副主席已確認發佈</span></div>
  <details><summary style="cursor:pointer;font-size:13px;color:var(--muted);padding:6px 0">展開完整審視報告（產出於 ${esc(new Date(aiReview.generatedAt).toISOString().slice(0, 10))}）</summary>
  <div class="banner" style="white-space:pre-wrap;margin-top:10px;font-size:13.5px">${esc(aiReview.text)}</div></details>
</section>` : "";

  const sourceLines = engine.meta.sources.map((s) => `${s.path.split("/").pop()}（${s.sha256}）`).join("｜");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>富聯分會 會員關懷儀表板｜${period.start.slice(0, 7)} – ${period.end.slice(0, 7)}</title>
<style>
:root{
  --bg:#f7f7f5; --card:#ffffff; --ink:#1a1d21; --muted:#6b7280; --line:#e7e5e0;
  --red:#c0392b; --red-bg:#fdf3f2; --amber:#b7791f; --amber-bg:#fdf8ee;
  --green:#2e7d54; --green-bg:#f0f7f2; --gray-bg:#f3f4f6; --blue:#2b6cb0; --blue-bg:#eff5fb;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;font-size:15px;padding:40px 20px}
.wrap{max-width:1040px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px}
h1{font-size:22px;font-weight:700;letter-spacing:.02em}
.meta{color:var(--muted);font-size:13px}
.sub{color:var(--muted);font-size:13px;margin-bottom:24px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:36px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat .n{font-size:26px;font-weight:700;letter-spacing:-.01em}
.stat .l{font-size:12px;color:var(--muted);margin-top:2px}
.stat.alert .n{color:var(--red)} .stat.watch .n{color:var(--amber)} .stat.ok .n{color:var(--green)}
section{margin-bottom:36px}
.sec-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.sec-h h2{font-size:15px;font-weight:700;letter-spacing:.06em}
.badge{font-size:12px;font-weight:600;padding:1px 9px;border-radius:99px}
.badge.red{background:var(--red-bg);color:var(--red)} .badge.amber{background:var(--amber-bg);color:var(--amber)}
.badge.gray{background:var(--gray-bg);color:var(--muted)} .badge.green{background:var(--green-bg);color:var(--green)}
.badge.blue{background:var(--blue-bg);color:var(--blue)}
.sec-note{font-size:12.5px;color:var(--muted);margin:-6px 0 12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:14px}
th{font-size:12px;color:var(--muted);font-weight:600;text-align:left;padding:9px 14px;border-bottom:1px solid var(--line);background:#fbfbfa;white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.u-red td{background:var(--red-bg)} tr.u-red td:first-child{box-shadow:inset 3px 0 0 var(--red)}
tr.u-amber td:first-child{box-shadow:inset 3px 0 0 var(--amber)}
.days{font-weight:700} .days.red{color:var(--red)} .days.amber{color:var(--amber)}
.name{font-weight:600;white-space:nowrap}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}
.dot.g{background:#3aa06d}.dot.y{background:#e0a63a}.dot.r{background:#d64541}
.chip{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;background:var(--gray-bg);color:#4b5563;margin:1px 3px 1px 0;white-space:nowrap}
.chip.warn{background:var(--amber-bg);color:var(--amber)}
.chip.bad{background:var(--red-bg);color:var(--red)}
.chip.okc{background:var(--green-bg);color:var(--green)}
.chip.info{background:var(--blue-bg);color:var(--blue)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:10px;padding:13px 16px}
.card.red{border-left-color:var(--red)} .card.amber{border-left-color:var(--amber)} .card.green{border-left-color:var(--green)}
.card .t{font-weight:600;margin-bottom:3px}
.card .d{font-size:13px;color:var(--muted)}
.card .d b{color:var(--ink);font-weight:600}
.action{font-size:12.5px;margin-top:7px;color:var(--ink)}
.action::before{content:"→ ";color:var(--muted)}
.banner{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;font-size:14px}
.banner b{font-weight:700}
.banner .d{color:var(--muted);font-size:13px;margin-top:3px}
.lightrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.dl{font-size:12px;font-weight:600;padding:4px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--green);cursor:pointer;white-space:nowrap}
.dl:hover{background:var(--green-bg);border-color:var(--green)}
footer{border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:12px;line-height:1.8}
@media print{body{background:#fff;padding:0}.stat,.card,table,.banner{break-inside:avoid}}
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>富聯分會 會員關懷儀表板</h1>
  <div class="meta">計分期間 ${period.start} – ${period.end}（${engine.totalWeeks} 週）｜產出 ${esc((publishedAt || engine.meta.generatedAt).slice(0, 10))}${version ? `｜快照第 ${version} 版` : ""}</div>
</header>
<div class="sub">現任 ${active} 人（已排除離會 ${excluded.length} 人）｜計分公式 46/46 官方驗證版｜依優先序排列，僅列需關注者</div>

<div class="stats">
  <div class="stat ok"><div class="n">${greenPct}%</div><div class="l">綠燈率 ${d.green}/${active}（目標 60%）</div></div>
  <div class="stat${dueNow.length ? " alert" : ""}"><div class="n">${dueNow.length}</div><div class="l">本週續約截止</div></div>
  <div class="stat${weakWarn.length ? " watch" : ""}"><div class="n">${weakWarn.length}</div><div class="l">續約審查預警</div></div>
  <div class="stat${auditObs.length ? " watch" : ""}"><div class="n">${auditObs.length}</div><div class="l">審計觀察（校準期）</div></div>
  <div class="stat${d.red + d.black ? " alert" : ""}"><div class="n">${d.red + d.black}</div><div class="l">紅燈會員</div></div>
  <div class="stat${openAlerts.length ? " alert" : ""}"><div class="n">${openAlerts.length}</div><div class="l">行業別開放警示</div></div>
</div>

${pendingSyncSection}

<section>
  <div class="sec-h"><h2>續約雷達</h2>${dueNow.length ? `<span class="badge red">${dueNow.length} 筆截止／逾期</span>` : ""}<span class="badge amber">${weakWarn.length} 筆審查預警</span></div>
  <div class="sec-note">規則：到期日前 2 個月的 15 號截止｜全年來賓 &lt; 4 或培訓 &lt; 20 者提前 2 個月預警${engine.meta.annualPeriod ? `（全年數據：${engine.meta.annualPeriod.start.slice(0, 7)} – ${engine.meta.annualPeriod.end.slice(0, 7)} 實測）` : ""}</div>
  <table>
    <tr><th>會員</th><th>燈號</th><th>續約截止</th><th>剩餘</th><th>全年審查條件（來賓 ≥4／培訓 ≥20）</th><th>行動</th></tr>
    ${radarRows || '<tr><td colspan="6">本期無續約雷達項目</td></tr>'}
  </table>
</section>

<section>
  <div class="sec-h"><h2>審計觀察</h2><span class="badge amber">${auditObs.length} 位</span><span class="badge gray">校準期・非結論</span></div>
  <div class="sec-note">來源：${engine.audit ? `${engine.audit.month} 逐週審計明細（${engine.audit.totals.events.toLocaleString()} 筆）` : "本期未提供審計資料"}。以下為關懷線索，不是指控——重點是確認他們有沒有真實收穫。門檻仍在校準期，單一訊號常有無辜解釋${auditAll.length > auditObs.length ? `；另有 ${auditAll.length - auditObs.length} 筆單一集中度訊號未上板，詳見 AI 審視報告` : ""}。</div>
  ${auditCards ? `<div class="cards">\n    ${auditCards}\n  </div>` : '<div class="banner">本期無審計觀察項目。</div>'}
</section>

<section>
  <div class="sec-h"><h2>燈號關懷</h2><span class="badge red">紅燈 ${d.red + d.black}</span><span class="badge gray">黃燈 ${d.yellow}</span></div>
  ${redCards ? `<div class="cards">\n    ${redCards}\n  </div>` : '<div class="banner">本期無紅燈或黑燈會員。</div>'}
</section>

<section>
  <div class="sec-h"><h2>黃燈突圍計算</h2><span class="badge gray">${engine.yellowBreakthroughs.length} 位</span><span class="badge gray">估算</span></div>
  <div class="sec-note">6 個月滾動窗估算。<b>假設 ${actionMonth} 月正常參與：每週一對一 2 次＋引薦 1.5 筆</b>。表列「還差多少」為正常參與之外需額外多做的量。來賓與交易預設不列入個人要求（分會層級處理），缺口不可控時列為替代補分路徑（藍色標示，門檻為窗口累計值）；缺席與培訓以現值計，滾出月份的變動會使分數自動調整。</div>
  <table>
    <tr><th>會員</th><th>目前</th><th>正常參與之外還差多少（最省路徑 → 70 綠燈）</th><th>提醒卡</th></tr>
    ${breakthroughRows || '<tr><td colspan="4">本期無黃燈會員</td></tr>'}
  </table>
</section>

<section>
  <div class="sec-h"><h2>結構性洞察</h2></div>
  <div class="banner" style="margin-bottom:12px">
    <b>${structuralItems ? `${structuralItems}為全分會系統性弱項，屬分會問題而非個人問題。` : "本期無全分會結構性零分項。"}</b>來賓 0 分 ${engine.structural.visitorZeroScore}/${active} 人・培訓 0 分 ${engine.structural.educationZeroScore}/${active} 人・交易 0 分 ${engine.structural.tyfcbZeroScore}/${active} 人。
    <div class="d">建議：以分會層級活動（邀賓日、培訓班表）處理，個人關懷聚焦在偏離分會平均的個案。</div>
  </div>
  ${idleCards ? `<div class="cards">\n    ${idleCards}\n  </div>` : ""}
</section>

<section>
  <div class="sec-h"><h2>期中關懷到點</h2><span class="badge gray">${engine.lifecycle.midterm.length} 位</span></div>
  <div class="sec-note">BNI 制度：新夥伴入會約 6 個月啟動正式關懷面談。</div>
  ${midtermCards ? `<div class="cards">\n    ${midtermCards}\n  </div>` : '<div class="banner">本期無到點的期中關懷對象。</div>'}
  <div class="sec-h" style="margin-top:20px"><h2>新會員追蹤</h2><span class="badge gray">${engine.lifecycle.newMembers.length} 位</span></div>
  ${newCards ? `<div class="cards">\n    ${newCards}\n  </div>` : '<div class="banner">本期無在會未滿 5 個月的新會員。</div>'}
</section>
${aiSection}
<footer>
  資料來源：${esc(sourceLines)}<br>
  計分規則：AGENTS.md（46/46 官方驗證版）｜離會排除：${excluded.map(esc).join("・") || "無"}｜本儀表板由分析引擎產出、AI 審視、副主席確認後發佈
</footer>

</div>

<script>
const CARDS = ${JSON.stringify(cardsData)};
const CARD_MONTH = ${actionMonth};
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function wrap(c,text,x,y,maxW,lh){
  let line="",yy=y;
  for(const ch of text){
    if(c.measureText(line+ch).width>maxW){c.fillText(line,x,yy);line=ch;yy+=lh;}
    else line+=ch;
  }
  if(line)c.fillText(line,x,yy);
  return yy+lh;
}
function dlCard(name){
  const d=CARDS[name];if(!d)return;
  const W=720,pad=56;
  const mc=document.createElement("canvas").getContext("2d");
  let H=252;
  mc.font="26px -apple-system,'PingFang TC',sans-serif";
  d.steps.forEach(t=>{H+=Math.max(1,Math.ceil(mc.measureText(t).width/(W-pad*2-56)))*38+18;});
  H+=104;
  if(d.note){mc.font="20px sans-serif";H+=Math.ceil(mc.measureText(d.note).width/(W-pad*2))*30+14;}
  H+=96;
  const cv=document.createElement("canvas");cv.width=W*2;cv.height=H*2;
  const c=cv.getContext("2d");c.scale(2,2);
  c.fillStyle="#ffffff";c.fillRect(0,0,W,H);
  c.fillStyle="#2e7d54";c.fillRect(0,0,W,8);
  c.textBaseline="alphabetic";
  c.fillStyle="#6b7280";c.font="600 17px -apple-system,'PingFang TC',sans-serif";
  c.fillText("富聯分會 FULIAN Chapter・會員關懷",pad,58);
  c.fillStyle="#1a1d21";c.font="800 38px -apple-system,'PingFang TC',sans-serif";
  c.fillText(CARD_MONTH+" 月升綠計畫",pad,106);
  c.font="800 34px -apple-system,'PingFang TC',sans-serif";
  c.fillText(name,pad,168);
  const nw=c.measureText(name).width;
  c.beginPath();c.arc(pad+nw+26,158,9,0,7);c.fillStyle="#e0a63a";c.fill();
  c.fillStyle="#6b7280";c.font="600 24px -apple-system,'PingFang TC',sans-serif";
  c.fillText("目前 "+d.score+" 分",pad+nw+44,168);
  c.strokeStyle="#e7e5e0";c.beginPath();c.moveTo(pad,196);c.lineTo(W-pad,196);c.stroke();
  c.fillStyle="#4b5563";c.font="22px -apple-system,'PingFang TC',sans-serif";
  c.fillText(CARD_MONTH+" 月正常參與（每週一對一 2 次、引薦 1.5 筆）之外，",pad,236);
  c.fillText("再完成：",pad,266);
  let y=316;
  d.steps.forEach((t,i)=>{
    c.beginPath();c.arc(pad+16,y-9,16,0,7);c.fillStyle="#f0f7f2";c.fill();
    c.fillStyle="#2e7d54";c.font="800 19px sans-serif";c.textAlign="center";
    c.fillText(String(i+1),pad+16,y-2);c.textAlign="left";
    c.fillStyle="#1a1d21";c.font="26px -apple-system,'PingFang TC',sans-serif";
    y=wrap(c,t,pad+56,y,W-pad*2-56,38)+18;
  });
  rr(c,pad,y-10,W-pad*2,64,12);c.fillStyle="#f0f7f2";c.fill();
  c.fillStyle="#2e7d54";c.font="800 26px -apple-system,'PingFang TC',sans-serif";
  c.fillText("完成後下期預估：",pad+24,y+31);
  const lw=c.measureText("完成後下期預估：").width;
  c.beginPath();c.arc(pad+34+lw,y+23,9,0,7);c.fill();
  c.fillText(d.result,pad+52+lw,y+31);
  y+=88;
  if(d.note){c.fillStyle="#6b7280";c.font="20px -apple-system,'PingFang TC',sans-serif";y=wrap(c,d.note,pad,y,W-pad*2,30)+8;}
  c.fillStyle="#9ca3af";c.font="17px -apple-system,'PingFang TC',sans-serif";
  c.fillText("富聯分會 會員委員會（估算）",pad,H-40);
  const a=document.createElement("a");
  a.download="升綠計畫_"+name+"_"+CARD_MONTH+"月.png";
  a.href=cv.toDataURL("image/png");a.click();
}
document.querySelectorAll("button.dl").forEach(button=>button.textContent="下載");
</script>
</body>
</html>
`;
}
