import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = read("assets/js/terminal-form.js");
const live = read("assets/js/terminal-form-live.js");
const html = read("terminal-form.html");

const captureIndex = live.indexOf("const preservedDraft=serialize()");
const replaceMembersIndex = live.indexOf("members=loaded");
const restoreIndex = live.indexOf("restore({...preservedDraft,member:currentTask.member,memberSearch:currentTask.member})");

assert.ok(captureIndex >= 0, "正式 PALMS 載入前必須先保存畫面上的既有答案");
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
assert.match(html, /terminal-form\.js\?v=9/);
assert.match(live, /fetch\("\/api\/analysis-snapshot"/);
assert.match(live, /正式分析快照缺少完整年度 PALMS，系統已停止顯示 0 值/);
assert.match(live, /正式分析快照缺少分會平均，系統已停止顯示 0 值/);
assert.doesNotMatch(live, /annualMetrics\|\|item\.metrics/, "年度 PALMS 缺失時不得靜默退回半年資料");
assert.match(html, /terminal-form-live\.js\?v=6/);

console.log("terminal form Word completeness tests passed");
