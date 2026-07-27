import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const forms = [
  { base: "assets/js/terminal-form.js", live: "assets/js/terminal-form-live.js", ready: "FulianTerminalFormReady", type: "renewal", form: "terminalForm" },
  { base: "assets/js/midterm-form.js", live: "assets/js/midterm-form-live.js", ready: "FulianMidtermFormReady", type: "midterm", form: "midtermForm" },
  { base: "assets/js/new-member-form.js", live: "assets/js/new-member-form-live.js", ready: "FulianNewMemberFormReady", type: "new", form: "newMemberForm" },
  { base: "assets/js/industry-change-form.js", live: "assets/js/industry-change-form-live.js", ready: "FulianIndustryChangeFormReady", type: "industry", form: "industryChangeForm" },
  { base: "assets/js/departure-form.js", live: "assets/js/departure-form-live.js", ready: "FulianDepartureFormReady", type: "departure", form: "departureForm" },
];

for (const item of forms) {
  const base = read(item.base);
  const live = read(item.live);
  assert.match(base, new RegExp(`window\\.${item.ready}=init\\(\\)`), `${item.base} 必須公開完成初始化的 Promise`);
  assert.match(live, new RegExp(`await Promise\\.all\\(\\[window\\.${item.ready},window\\.FulianTaskStore\\.ready\\]\\)`), `${item.live} 必須等基本表單完成後才帶入案件`);
  assert.match(live, new RegExp(`item\\.id===taskId&&item\\.type==="${item.type}"`), `${item.live} 必須同時核對案件 ID 與類型`);
  assert.match(live, new RegExp(`#${item.form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${item.live} 找不到案件時必須停止顯示表單`);
  assert.match(live, /FulianCaseStateStore\.reconcileDraft\(task|FulianCaseStateStore\.reconcileDraft\(currentTask/, `${item.live} 必須把案件身份校正回既有草稿`);
  assert.doesNotMatch(live, /task\?\.member\|\|(?:members|applicants)\[0\]\.name/, `${item.live} 不得找不到案件會員時靜默改用第一位會員`);
}

console.log("form task binding tests passed");
