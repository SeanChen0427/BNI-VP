import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = read("assets/js/terminal-form.js");
const live = read("assets/js/terminal-form-live.js");
const html = read("terminal-form.html");

const captureIndex = live.indexOf("const persistedDraft=JSON.parse(localStorage.getItem(window.FulianTerminalFormStoreKey)");
const replaceMembersIndex = live.indexOf("members=loaded");
const restoreIndex = live.indexOf("restore({...preservedDraft,member:currentTask.member,memberSearch:currentTask.member})");

assert.ok(captureIndex >= 0, "正式 PALMS 載入前必須先保存已同步草稿與畫面上的既有答案");
assert.ok(
  captureIndex < replaceMembersIndex && replaceMembersIndex < restoreIndex,
  "重建第 3～10 題後必須把既有答案重新填回畫面"
);
assert.doesNotMatch(
  live,
  /selectMember\(currentTask\.member\)/,
  "正式資料載入不得只重建會員題目而遺失既有答案"
);
assert.match(
  live,
  /restore\(\{\.\.\.preservedDraft,member:currentTask\.member,memberSearch:currentTask\.member\}\)/,
  "案件會員姓名不得被正式資料載入前的占位草稿覆蓋"
);

assert.match(form, /function completionMissingFields\(\)/);
assert.match(form, /\.\.\.metricDefs\.map\(item => \[`\$\{item\.id\}Answer`/);
assert.match(form, /\.\.\.experienceDefs\.map\(\(\[no,id\]\) => \[`\$\{id\}Answer`/);
for (const id of ["chapterNotes", "summary", "interviewerOpinion"]) {
  assert.match(form, new RegExp(`\\["${id}",`), `${id} 必須列入正式產檔前檢查`);
}
for (const name of ["receivedBenefit", "oneToOneBenefit", "workshopWilling"]) {
  assert.match(form, new RegExp(`\\["${name}",`), `${name} 必須完成選擇後才能產檔`);
}
for (const id of ["mspUnderstood", "policyUnderstood"]) {
  assert.match(form, new RegExp(`\\["${id}",`), `${id} 必須確認後才能產檔`);
}

const validationIndex = form.indexOf("const missing=completionMissingFields()");
const completionIndex = form.indexOf("terminalCompletion.begin()");
assert.ok(
  validationIndex >= 0 && validationIndex < completionIndex,
  "必須在標記完成與產生 Word 前阻擋缺漏欄位"
);
assert.match(form, /if\(missing\.length\)\{/);
assert.match(form, /const key=`radio:\$\{el\.name\}`; if\(data\[key\]!==undefined\)el\.checked=data\[key\]===el\.value/,
  "舊草稿沒有單選答案時必須保留系統依數據自動預選");
assert.match(form, /renewalPalmsPeriod\(\{renewalCount:/);
assert.match(form, /fetch\(`\/api\/renewal-data\?\$\{query\}`/);
assert.match(form, /currentMember\.metricsReady\|\|!snapshotMatches\(renewalMetricsSnapshot\)/);
assert.match(form, /renewalRuleVersion=2/);
assert.match(form, /trustedRenewal=data\.renewalRuleVersion===2/,
  "舊版草稿被誤預設為第一次續約的選擇不得沿用");
assert.match(form, /snapshotMatches\(renewalMetricsSnapshot\)[\s\S]*?renderMetricQuestions\(\);restoreFields\(persisted\);bindInputs\(\)/,
  "重新開啟已保存的 PALMS 快照後不得遺失訪談答案");
assert.match(html, /<option value="">請選擇<\/option>/,
  "續約次數不得再默認成第一次");
assert.match(html, /terminal-form\.js\?v=11/);
assert.match(live, /fetch\("\/api\/analysis-snapshot"/);
assert.match(live, /正式分析快照缺少完整續約資料，系統已停止顯示 0 值/);
assert.match(live, /正式分析快照缺少分會平均，系統已停止顯示 0 值/);
assert.doesNotMatch(live, /annualMetrics\|\|item\.metrics/, "年度 PALMS 缺失時不得靜默退回半年資料");
assert.match(live, /activationStatus==="pending-official-sync"/);
assert.match(live, /會齡待中心同步，官方日期更新後即可開啟續約表單/);
assert.match(html, /terminal-form-live\.js\?v=8/);

console.log("terminal form Word completeness tests passed");
