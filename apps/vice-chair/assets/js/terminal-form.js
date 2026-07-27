const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const terminalTaskId = new URLSearchParams(location.search).get("task");
if(!terminalTaskId) location.replace("case-board.html?new=renewal");
const terminalCaseDomain = window.FulianCaseDomain;
const terminalCaseFiles = window.FulianCaseFiles;
const terminalCompletion = window.FulianInterviewCompletion.setup({formLabel:"終期輔導"});
const STORE_KEY = terminalTaskId ? terminalCaseDomain.draftStorageKey({id:terminalTaskId,type:"renewal"}) : "fulian-terminal-counseling-draft-v3";
const DEFAULT_CHAPTER_NOTES = `1. 3次遲到及早退轉為一次缺席
2. 紅燈有條件續約，灰燈不予續約
3. 續約須於續約到期日前2個月的當月15日前完成申請及繳費，逾期代表放棄續約權益。`;

let members = [
  {
    name: "正式資料載入中", profession: "", activation: "2026-01-01", score: 0,
    metrics: { givenIn: 0, givenOut: 0, receivedIn: 0, receivedOut: 0, amount: 0, visitors: 0, oneToOne: 0, late: 0, early: 0, substitutes: 0, education: 0 }
  }
];

let averages = { givenIn: 18, givenOut: 31, receivedIn: 15, receivedOut: 25, amount: 1650000, visitors: 3, oneToOne: 48, late: 1, substitutes: 3, education: 10 };
let currentMember = members[0];
let saveTimer;

const metricDefs = [
  {
    no: 3, id: "referralsGiven", title: (m) => `您過去在分會提供引薦次數：內部 ${m.givenIn} 單＋外部 ${m.givenOut} 單＝共 ${m.givenIn + m.givenOut} 單。`,
    chips: (m) => ratioChips(m.givenIn, m.givenOut, "內部引薦", "外部引薦") + referralAverageChip(averages.givenIn, averages.givenOut),
    hints: ["是否比較不容易辨認外部商機？", "是否不清楚其他會員的理想引薦？", "是否主要集中在會員間的消費型引薦？", "委員會能提供什麼協助？"],
    options: (m) => compareOptions("givenCompare", m.givenIn + m.givenOut, averages.givenIn + averages.givenOut,
      "若低於分會平均，什麼原因？我們能幫忙您什麼？", "若高於分會平均，可以分享一個成功的經驗？")
  },
  {
    no: 4, id: "referralsReceived", title: (m) => `您過去在分會收到引薦次數：內部 ${m.receivedIn} 單＋外部 ${m.receivedOut} 單＝共 ${m.receivedIn + m.receivedOut} 單。`,
    chips: (m) => ratioChips(m.receivedIn, m.receivedOut, "內部引薦", "外部引薦") + referralAverageChip(averages.receivedIn, averages.receivedOut),
    hints: ["收到的引薦是否符合目前主要服務？", "會員是否清楚他的理想引薦與引薦情境？", "引薦後的追蹤與回報是否順暢？"],
    options: (m) => compareOptions("receivedCompare", m.receivedIn + m.receivedOut, averages.receivedIn + averages.receivedOut,
      "若低於分會平均，什麼原因？我們能幫忙您什麼？", "若高於分會平均，可以分享一個成功的經驗？"),
    extra: { id: "receivedBenefit", text: "在過去的一年裡，您有從收到引薦中得到您要的引薦業務或人脈嗎？" }
  },
  {
    no: 5, id: "referralAmount", title: (m) => `您過去在分會給出的引薦金額：${money(m.amount)}。`,
    chips: (m) => `<span class="metric-chip">會員金額 <strong>${money(m.amount)}</strong></span><span class="metric-chip">分會平均 <strong>${money(averages.amount)}</strong></span>`,
    hints: ["引薦金額主要來自哪些合作情境？", "目前的引薦量是否有轉化為實際且有效的合作？", "是否有能被其他會員複製的成功方法？"],
    options: (m) => thresholdOptions("amountCompare", m.amount, 1000000, 4000000, "若低於100萬，什麼原因？我們能幫忙您什麼？", "若高於400萬，可以分享一個成功的經驗？")
  },
  {
    no: 6, id: "visitors", title: (m) => `您過去在分會邀請來賓人數：${m.visitors} 人。`,
    chips: (m) => `<span class="metric-chip">會員來賓 <strong>${m.visitors} 人</strong></span><span class="metric-chip">分會平均 <strong>${averages.visitors} 人</strong></span>`,
    hints: ["是否清楚什麼對象適合邀請參加例會？", "邀約時最常遇到的困難是什麼？", "是否需要協助整理邀請話術或名單？"],
    options: (m) => compareOptions("visitorCompare", m.visitors, averages.visitors, "若低於分會平均，什麼原因？我們能幫忙您什麼？", "若高於分會平均，可以分享一個成功的經驗？")
  },
  {
    no: 7, id: "oneToOne", title: (m) => `您過去在分會一對一次數：${m.oneToOne} 次。`,
    chips: (m) => `<span class="metric-chip">會員一對一 <strong>${m.oneToOne} 次</strong></span><span class="metric-chip">分會平均 <strong>${averages.oneToOne} 次</strong></span>`,
    hints: ["一對一是否有明確目標與後續行動？", "是否集中在少數熟悉會員？", "有沒有尚未深入認識的產業鏈夥伴？"],
    options: (m) => compareOptions("oneToOneCompare", m.oneToOne, averages.oneToOne, "若低於分會平均，什麼原因？我們能幫忙您什麼？", "若高於分會平均，可以分享一個成功的經驗？"),
    extra: { id: "oneToOneBenefit", text: "在過去的一年裡，您有從一對一會面得到您要的引薦業務或人脈嗎？" }
  },
  {
    no: 8, id: "attendance", title: (m) => `您過去在分會遲到 ${m.late} 次，您有早退嗎？${m.early} 次。`,
    chips: (m) => `<span class="metric-chip">遲到 <strong>${m.late} 次</strong></span><span class="metric-chip">早退 <strong>${m.early} 次</strong></span><span class="metric-chip">代理人 <strong>${m.substitutes} 次</strong></span><span class="metric-chip">分會平均 <strong>遲到 ${averages.late} 次・代理人 ${averages.substitutes} 次</strong></span>`,
    hints: ["遲到、早退或代理是否集中在特定時期？", "是否有工作、健康或家庭因素需要關懷？", "會員願意採取的第一個改變是什麼？"],
    plain: "在過去的一年裡，你經常遲到或早退的原因是？你願意做出改變嗎？你改變的第一步是什麼？"
  },
  {
    no: 9, id: "education", title: (m) => `您過去在分會教育培訓積分：${m.education} 分。`,
    chips: (m) => `<span class="metric-chip">會員培訓 <strong>${m.education} 分</strong></span><span class="metric-chip">分會平均 <strong>${averages.education} 分</strong></span>`,
    hints: ["目前最需要補強的是系統使用、簡報、引薦或領導能力？", "過去參加過哪些最有幫助的培訓？", "下一堂可以實際安排的培訓是什麼？"],
    options: (m) => singleLowOption("educationCompare", m.education < averages.education, "若低於分會平均，什麼原因？是否願意參加工作坊提升商務引薦品質？"),
    extra: { id: "workshopWilling", text: "是否願意參加工作坊提升商務引薦品質？", yes: "是", no: "否" }
  },
  {
    no: 10, id: "leadership", title: () => "在過去的一年裡，你曾擔任的領導職位是？",
    hints: ["曾承擔哪些正式或行政角色？", "哪一種職務最能發揮他的優勢？", "下一屆是否有意願承擔職務？"],
    plain: "是否願意擔任領導團隊幹部？您願意擔任的職務是什麼？"
  }
];

const experienceDefs = [
  [11, "chapterFeeling", "你在分會中感覺如何？", ["目前最有歸屬感的部分是什麼？", "是否有尚未被理解或支持的地方？"]],
  [12, "bniBenefit", "你認為 BNI 帶給你的效益是？", ["效益可能包含生意、人脈、學習、信任與個人成長。", "請優先記錄會員本人認為最重要的收穫。"]],
  [13, "midtermGoal", "過去半年中，您是否有完成期中輔導時設定的目標？", ["可先回顧期中輔導設定的具體目標。", "未完成時，聚焦原因與下一步，而非責備。"]],
  [14, "midtermSummary", "討論期中輔導的總結與建議？", ["對照期中紀錄、目前成果與尚未完成事項。"]],
  [15, "businessSatisfaction", "過去一年您對您獲得的生意滿意度有多少（1～10分），您覺得哪方面可以再提升？", ["分數之外，也要了解期待落差來自引薦量、品質、轉換或服務定位。"]],
  [16, "nextActions", "如果你成功續約，對於你生意的滿意度距離你的成功，你需要做什麼改變，採取不同的行動？", ["將答案整理成會員自己願意承諾的具體行動。"]],
  [19, "chapterSuggestion", "您對分會有什麼具體的建議（請重點陳述）？", ["請記錄可執行、可交付適當職長跟進的建議。"]]
];

function money(n) { return `${Math.round(n).toLocaleString("zh-TW")} 元`; }
function fileDateStamp(d = new Date()) { return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }
function safeFileName(text) { return text.replace(/[\\/:*?"<>|]/g, "-").trim(); }
async function saveWordToCase(blob,fileName){
  return terminalCaseFiles.saveGeneratedWord({
    caseId:terminalTaskId,
    blob,
    fileName,
    sourceLabel:"終期輔導表單",
    domain:terminalCaseDomain,
    storage:localStorage,
    indexedDb:indexedDB,
    FileClass:File
  });
}
function pct(a, b) { const t = a + b; return t ? Math.round(a / t * 100) : 0; }
function ratioChips(a, b, al, bl) { return `<span class="metric-chip">${al} <strong>${a} 單（${pct(a,b)}%）</strong></span><span class="metric-chip">${bl} <strong>${b} 單（${pct(b,a)}%）</strong></span>`; }
function referralAverageChip(a, b) { return `<span class="metric-chip">分會平均 <strong>內 ${a} 單＋外 ${b} 單＝共 ${a+b} 單</strong></span>`; }
function compareOptions(name, value, avg, lowText, highText) {
  const low = value < avg, high = value >= avg;
  return `<label class="official-option"><input type="radio" name="${name}" value="low" ${low ? "checked" : ""} data-save>${lowText}</label><label class="official-option"><input type="radio" name="${name}" value="high" ${high ? "checked" : ""} data-save>${highText}</label>`;
}
function thresholdOptions(name, value, low, high, lowText, highText) {
  return `<label class="official-option"><input type="checkbox" id="${name}Low" ${value <= low ? "checked" : ""} data-save>${lowText}</label><label class="official-option"><input type="checkbox" id="${name}High" ${value > high ? "checked" : ""} data-save>${highText}</label>`;
}
function singleLowOption(name, checked, text) { return `<label class="official-option"><input type="checkbox" id="${name}" ${checked ? "checked" : ""} data-save>${text}</label>`; }
function hintBox(items) { return `<div class="system-hint"><b>系統訪談提示・不輸出至 Word</b><ul>${items.map(x => `<li>${x}</li>`).join("")}</ul></div>`; }
function ynField(id, text, yes="有", no="沒有") { return `<div class="yn"><b>${text}</b><label><input type="radio" name="${id}" value="yes" data-save>${yes}</label><label><input type="radio" name="${id}" value="no" data-save>${no}</label></div>`; }

function renderMetricQuestions() {
  $("#metricQuestions").innerHTML = metricDefs.map(q => `<article class="question"><div class="question-head"><span>${q.no}.</span><h3>${q.title(currentMember.metrics)}</h3></div>${q.chips ? `<div class="metric-breakdown">${q.chips(currentMember.metrics)}</div>` : ""}${hintBox(q.hints)}${q.options ? `<div class="official-options">${q.options(currentMember.metrics)}</div>` : ""}${q.plain ? `<p>${q.plain}</p>` : ""}${q.extra ? ynField(q.extra.id, q.extra.text, q.extra.yes, q.extra.no) : ""}<label class="long-field">委員填寫內容<textarea id="${q.id}Answer" rows="4" data-save></textarea></label></article>`).join("");
}

function renderExperienceQuestions() {
  $("#experienceQuestions").innerHTML = experienceDefs.map(([no,id,title,hints]) => `<article class="question"><div class="question-head"><span>${no}.</span><h3>${title}</h3></div>${hintBox(hints)}${id === "businessSatisfaction" ? `<label>滿意度（1～10分）<input id="satisfactionScore" type="number" min="1" max="10" data-save></label>` : ""}<label class="long-field">委員填寫內容<textarea id="${id}Answer" rows="4" data-save></textarea></label></article>`).join("");
}

function monthLabel(d) { return `${d.getFullYear()} 年 ${d.getMonth()+1} 月`; }
function lastCompleteMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth()-1, 1); }
function monthsBack(end, count) { return new Date(end.getFullYear(), end.getMonth()-(count-1), 1); }
function periodLabel(start, end) { return `${monthLabel(start)}至${monthLabel(end)}`; }
function parseLocalDate(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d || 1); }
function trafficLight(score) { if(score >= 70) return ["綠燈","綠","#198754"]; if(score >= 50) return ["黃燈","黃","#d0a12d"]; if(score >= 30) return ["紅燈","紅","#c92b32"]; return ["黑燈","黑","#25282b"]; }

function refreshSnapshot() {
  const end = lastCompleteMonth();
  const trafficStart = monthsBack(end, 6);
  const first = $("#renewalCount").value === "1";
  const activation = parseLocalDate(currentMember.activation);
  const palmsStart = first ? new Date(activation.getFullYear(), activation.getMonth(), 1) : monthsBack(end, 12);
  const [light, badge, color] = trafficLight(currentMember.score);
  $("#score").textContent = currentMember.score; $("#light").textContent = light; $("#lightBadge").textContent = badge; $("#lightBadge").style.background = color;
  $("#trafficPeriod").textContent = `計算週期（6個月）：${periodLabel(trafficStart,end)}`;
  $("#palmsPeriod").textContent = periodLabel(palmsStart,end);
  const monthCount = (end.getFullYear()-palmsStart.getFullYear())*12 + end.getMonth()-palmsStart.getMonth()+1;
  $("#periodNote").textContent = first ? `第一次續約：依實際會籍抓取 ${monthCount} 個完整月份。` : "第二次續約起：抓取訪談前 12 個完整月份。";
  $("#averages").innerHTML = [
    ["平均提供引薦",`內 ${averages.givenIn}・外 ${averages.givenOut}`],["平均收到引薦",`內 ${averages.receivedIn}・外 ${averages.receivedOut}`],["平均引薦金額",money(averages.amount)],["平均來賓",`${averages.visitors} 人`],
    ["平均一對一",`${averages.oneToOne} 次`],["平均遲到",`${averages.late} 次`],["平均代理人",`${averages.substitutes} 次`],["平均教育培訓",`${averages.education} 分`]
  ].map(([k,v])=>`<div class="average"><small>${k}</small><strong>${v}</strong></div>`).join("");
  window.formPeriods = { trafficStart, end, palmsStart };
}

function selectMember(name, preserve=false) {
  const found = members.find(m => m.name === name) || members[0]; currentMember = found;
  $("#memberSearch").value = found.name; $("#profession").value = found.profession;
  if (!preserve) $("#memberSignature").value = found.name;
  refreshSnapshot(); renderMetricQuestions(); bindInputs();
}

function serialize() {
  const out = {};
  $$('[data-save]').forEach(el => {
    if (el.type === "radio") { if (el.checked) out[`radio:${el.name}`] = el.value; }
    else if (el.type === "checkbox") out[el.id] = el.checked;
    else out[el.id] = el.value;
  });
  out.member = currentMember.name; out.loginUser = $("#loginUser").value; return out;
}
function restore(data) {
  if (!data) return;
  if (data.loginUser) $("#loginUser").value = data.loginUser;
  selectMember(data.member || members[0].name, true);
  $$('[data-save]').forEach(el => {
    if (el.type === "radio") el.checked = data[`radio:${el.name}`] === el.value;
    else if (el.type === "checkbox" && data[el.id] !== undefined) el.checked = data[el.id];
    else if (data[el.id] !== undefined) el.value = data[el.id];
  });
  refreshSnapshot();
}
function saveDraft() {
  localStorage.setItem(STORE_KEY, JSON.stringify(serialize()));
  $("#saveState").textContent = "正在同步 Supabase…";
  window.FulianCaseStateStore.flush().then(() => {
    const t = new Date();
    $("#saveState").textContent = "草稿已保存至 Supabase";
    $("#saveTime").textContent = `最後同步 ${t.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
  }).catch(error => {
    $("#saveState").textContent = `同步失敗：${error.message}`;
  });
  updateProgress();
}
function bindInputs() {
  $$('[data-save]').forEach(el => { el.oninput = () => { $("#saveState").textContent = "儲存中…"; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 300); }; });
}
function updateProgress() {
  const fields = $$('textarea[data-save], input[data-save]:not([type="radio"]):not([type="checkbox"])');
  const filled = fields.filter(x => x.value.trim()).length;
  const p = Math.round(filled / Math.max(fields.length,1) * 100); $("#progressBar").style.width = `${p}%`; $("#progressText").textContent = `${p}%`;
}
function defaultDateTime() { const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function toast(msg) { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),2200); }
function radioValue(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ""; }
function mark(selected, value) { return selected === value ? "■" : "□"; }
function answer(id) { return $(id)?.value.trim() || ""; }

async function downloadWord() {
  if(typeof docx==="undefined"){toast("Word 元件尚未載入，請重新整理後再試");return}
  terminalCompletion.begin();
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageOrientation, ShadingType } = docx;
  const m = currentMember.metrics, fp = window.formPeriods;
  const font = "Arial Unicode MS", fontSpec = {ascii:font,hAnsi:font,eastAsia:font,cs:font};
  const run = (text, opts={}) => new TextRun({text, font:fontSpec, size: opts.size || 22, bold: !!opts.bold, color: opts.color});
  const para = (text="", opts={}) => new Paragraph({alignment:opts.align, spacing:{before:opts.before||0,after:opts.after===undefined?100:opts.after,line:320}, children:[run(text,opts)]});
  const answerPara = (id) => para(answer(`#${id}`) || "（未填寫）", {color:"333333",after:180});
  const boxLine = (name, low, high) => `${mark(radioValue(name),"low")} ${low}\n${mark(radioValue(name),"high")} ${high}`;
  const noBorders = {top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}};
  const cell = (label,value,width) => new TableCell({width:{size:width,type:WidthType.PERCENTAGE},margins:{top:100,bottom:100,left:120,right:120},children:[new Paragraph({children:[run(label,{bold:true}),run(value)]})]});
  const meta = new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:noBorders,rows:[
    new TableRow({children:[cell("會談日期：",new Date($("#meetingDate").value).toLocaleString("zh-TW"),50),cell("分會：","富聯",50)]}),
    new TableRow({children:[cell("會員姓名：",currentMember.name,50),cell("專業別：",currentMember.profession+"（需與續約申請表相符）",50)]}),
    new TableRow({children:[cell("輔導專員：",$("#counselor").value,50),cell("陪訪專員：",answer("#companionCounselor"),50)]})
  ]});
  const avgRows = [
    ["分會平均提供引薦數",`內：${averages.givenIn}　外：${averages.givenOut}`,"分會平均收到引薦數",`內：${averages.receivedIn}　外：${averages.receivedOut}`],
    ["分會平均引薦金額",money(averages.amount),"分會平均來賓人數",`${averages.visitors} 人`],
    ["分會平均一對一",`${averages.oneToOne} 次`,"分會平均遲到次數",`${averages.late} 次`],
    ["分會平均代理人次數",`${averages.substitutes} 次`,"分會平均教育培訓積分",`${averages.education} 分`]
  ];
  const avgTable = new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:avgRows.map(r=>new TableRow({children:r.map((x,i)=>new TableCell({width:{size:i%2?24:26,type:WidthType.PERCENTAGE},shading:i%2?undefined:{fill:"F4E8E8",type:ShadingType.CLEAR},margins:{top:90,bottom:90,left:100,right:100},children:[para(x,{bold:i%2===0,after:0})]}))}))});
  const children = [
    new Paragraph({alignment:AlignmentType.RIGHT,children:[run("V1.3　：20251114",{size:18})]}),
    new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:240},children:[run("363 會員留任計畫－終期輔導",{size:34,bold:true,color:"A91419"})]}),meta,
    para(`1. 個人紅綠燈 ${currentMember.score} 分 ${trafficLight(currentMember.score)[0]}。`,{bold:true,before:160}),
    para(`　 個人紅綠燈計算週期（6個月）${periodLabel(fp.trafficStart,fp.end)}`),
    para(`2. PALMS 表計算週期 ${periodLabel(fp.palmsStart,fp.end)}`,{bold:true}),avgTable,
    para("備註：PALMS表計算週期為第一年續約會員從啟動月份到續約時的PALMS表。第二年起會員續約，依據續約時往前推12個月的PALMS表。分會平均數值為分會總數／人數。",{size:19,color:"666666"}),
    para(`3. 您過去在分會提供引薦次數：內部 ${m.givenIn} 單＋外部 ${m.givenOut} 單＝共 ${m.givenIn+m.givenOut} 單。`,{bold:true}),
    para(boxLine("givenCompare","若低於分會平均，什麼原因？我們能幫忙您什麼？","若高於分會平均，可以分享一個成功的經驗？")),answerPara("referralsGivenAnswer"),
    para(`4. 您過去在分會收到引薦次數：內部 ${m.receivedIn} 單＋外部 ${m.receivedOut} 單＝共 ${m.receivedIn+m.receivedOut} 單。`,{bold:true}),
    para(boxLine("receivedCompare","若低於分會平均，什麼原因？我們能幫忙您什麼？","若高於分會平均，可以分享一個成功的經驗？")),answerPara("referralsReceivedAnswer"),
    para(`在過去的一年裡，您有從收到引薦中得到您要的引薦業務或人脈嗎？ ${mark(radioValue("receivedBenefit"),"yes")} 有　${mark(radioValue("receivedBenefit"),"no")} 沒有`),
    para(`5. 您過去在分會給出的引薦金額：${money(m.amount)}。`,{bold:true}),
    para(`${$("#amountCompareLow").checked?"■":"□"} 若低於100萬，什麼原因？我們能幫忙您什麼？\n${$("#amountCompareHigh").checked?"■":"□"} 若高於400萬，可以分享一個成功的經驗？`),answerPara("referralAmountAnswer"),
    para(`6. 您過去在分會邀請來賓人數：${m.visitors} 人。`,{bold:true}),
    para(boxLine("visitorCompare","若低於分會平均，什麼原因？我們能幫忙您什麼？","若高於分會平均，可以分享一個成功的經驗？")),answerPara("visitorsAnswer"),
    para(`7. 您過去在分會一對一次數：${m.oneToOne} 次。`,{bold:true}),
    para(boxLine("oneToOneCompare","若低於分會平均，什麼原因？我們能幫忙您什麼？","若高於分會平均，可以分享一個成功的經驗？")),answerPara("oneToOneAnswer"),
    para(`在過去的一年裡，您有從一對一會面得到您要的引薦業務或人脈嗎？ ${mark(radioValue("oneToOneBenefit"),"yes")} 有　${mark(radioValue("oneToOneBenefit"),"no")} 沒有`),
    para(`8. 您過去在分會遲到 ${m.late} 次，您有早退嗎？${m.early} 次。`,{bold:true}),para("在過去的一年裡，你經常遲到或早退的原因是？你願意做出改變嗎？你改變的第一步是什麼？"),answerPara("attendanceAnswer"),
    para(`9. 您過去在分會教育培訓積分：${m.education} 分。`,{bold:true}),para(`${$("#educationCompare").checked?"■":"□"} 若低於分會平均，什麼原因？是否願意參加工作坊提升商務引薦品質？ ${mark(radioValue("workshopWilling"),"yes")} 是　${mark(radioValue("workshopWilling"),"no")} 否`),answerPara("educationAnswer"),
    para("10. 在過去的一年裡，你曾擔任領導職位是？",{bold:true}),para("是否願意擔任領導團隊幹部？您願意擔任的職務是什麼？"),answerPara("leadershipAnswer")
  ];
  const officialById = Object.fromEntries(experienceDefs.map(([no,id,title])=>[id,[no,title]]));
  for(const id of ["chapterFeeling","bniBenefit","midtermGoal","midtermSummary","businessSatisfaction","nextActions"]){const [no,title]=officialById[id];children.push(para(`${no}. ${title}`,{bold:true}),answerPara(`${id}Answer`));if(id==="businessSatisfaction"&&answer("#satisfactionScore"))children.push(para(`滿意度：${answer("#satisfactionScore")} 分`));}
  children.push(
    para(`17. 本人同意於副主席公告續約完成後，兩個月內完成MSP（上）或（下）其中一堂培訓。${$("#mspUnderstood").checked?"■":"□"} 已了解`,{bold:true}),
    para(`培訓日期－MSP（上）：${answer("#mspUp")||"　　　　"}／MSP（下）：${answer("#mspDown")||"　　　　"}`),
    para(`簽名：${answer("#memberSignature")||"_____________________"}`),para("18. 分會相關地基備註說明：",{bold:true}),answerPara("chapterNotes"),
    para("19. 您對分會有什麼具體的建議（請重點陳述）？",{bold:true}),answerPara("chapterSuggestionAnswer"),
    para("20. 了解會員委員會有同意會員續約、謝絕會員續約或會員有條件續約的權力。（一旦會員委員會做出不予續約決定，分會董事顧問有權確保訪談流程無瑕疵，才能做此不予續約決定）。",{bold:true}),para(`${$("#policyUnderstood").checked?"■":"□"} 已了解`),
    para("審核會員貢獻的評估條件如下：",{bold:true}),para("(a) 未能帶來足夠數量的合格業務引薦和來賓\n(b) 未參加會議或經常遲到／早退\n(c) 未能展現出足夠的職業素養或始終準備不足\n(d) 拒絕擔任分會領導職位\n(e) 未能遵守某項政策、方針或道德規範"),
    para("訪談人總結和建議",{bold:true,size:26,color:"A91419",before:200}),answerPara("summary"),
    para(`會員（親簽）：${answer("#memberSignature")||"_____________________"}`),para(`訪談人：${$("#interviewer").value}`),para(`陪訪專員：${answer("#companionCounselor")}`),para("意見：",{bold:true}),answerPara("interviewerOpinion")
  );
  const wordDocument = new Document({styles:{default:{document:{run:{font:fontSpec,size:22},paragraph:{spacing:{line:320}}}}},sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:720,right:720,bottom:720,left:720}}},children}]});
  const blob = await Packer.toBlob(wordDocument),fileName=`363留員計畫-終期輔導-${safeFileName(currentMember.name)}-${fileDateStamp()}.docx`;
  try{
    await saveWordToCase(blob,fileName);
    terminalCompletion.success({blob,fileName,caseId:terminalTaskId,memberName:currentMember.name});
    toast("訪談已完成，案件待發送委員回饋");
  }catch(error){
    console.error("案件 Word 保存失敗",error);
    terminalCompletion.failure({blob,fileName,error});
    toast("Word 已產生，但案件尚未完成保存");
  }
}

async function init() {
  await window.FulianCaseStateStore.ready;
  $("#memberList").innerHTML = members.map(m=>`<option value="${m.name}">${m.profession}</option>`).join("");
  $("#sectionNav").innerHTML = [["basic","基本資料"],["snapshot","數據快照"],["palms","PALMS 貢獻"],["experience","會員經驗"],["agreement","制度與總結"]].map(([id,t])=>`<a href="#${id}">${t}</a>`).join("");
  renderExperienceQuestions();
  $("#meetingDate").value = defaultDateTime();
  $("#chapterNotes").value = DEFAULT_CHAPTER_NOTES;
  $("#counselor").value = $("#loginUser").value; $("#interviewer").value = $("#loginUser").value;
  selectMember(members[0].name);
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); restore(saved);
  $("#memberSearch").addEventListener("change", e=>{selectMember(e.target.value);saveDraft();});
  $("#renewalCount").addEventListener("change", refreshSnapshot);
  $("#loginUser").addEventListener("change",()=>{$("#counselor").value=$("#loginUser").value;$("#interviewer").value=$("#loginUser").value;saveDraft();});
  $("#resetDraft").onclick=()=>{if(confirm("要清除這份尚未完成的終期輔導草稿嗎？已保存的案件附件與完成紀錄不會被刪除。")){localStorage.removeItem(STORE_KEY);location.reload();}};
  $("#downloadWord").onclick=downloadWord;
  bindInputs(); updateProgress();
}
window.FulianTerminalFormReady=init();
