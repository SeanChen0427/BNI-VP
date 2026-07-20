import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobileCss = readFileSync(
  new URL("../assets/css/mobile-polish.css", import.meta.url),
  "utf8"
);
const navCss = readFileSync(
  new URL("../assets/css/workspace-nav.css", import.meta.url),
  "utf8"
);
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const boardHtml = readFileSync(
  new URL("../case-board.html", import.meta.url),
  "utf8"
);
const workflowHtml = readFileSync(
  new URL("../case-workflow.html", import.meta.url),
  "utf8"
);
const midtermHtml = readFileSync(
  new URL("../midterm-form.html", import.meta.url),
  "utf8"
);

assert.match(
  mobileCss,
  /\.cases-panel \.case-row\{[\s\S]*?min-width:0;[\s\S]*?grid-template-columns:1fr;/,
  "手機首頁的優先待辦必須改為單欄案件卡，不能保留桌面表格寬度"
);
assert.match(
  mobileCss,
  /\.cases-panel \.case-row\.header\{\s*display:none;/,
  "手機首頁不應顯示桌面表格欄位標題"
);
assert.match(
  mobileCss,
  /\.flow-note b,[\s\S]*?white-space:nowrap;/,
  "手機案件流程提示不得被壓成逐字直排"
);
assert.match(
  mobileCss,
  /min-height:44px/,
  "手機主要操作必須保留至少 44px 的觸控高度"
);
assert.match(
  mobileCss,
  /\.performance-scroll\{[\s\S]*?width:100%;[\s\S]*?overflow-x:auto;/,
  "期中輔導的寬表格必須限制在表單卡內自行捲動，不能撐寬整頁"
);
assert.match(
  navCss,
  /\.workspace-menu-button\{width:44px;height:44px;flex-basis:44px\}/
);
assert.match(
  navCss,
  /\.workspace-back-button\{width:44px!important;height:44px!important/
);

for (const [name, html] of [
  ["工作總覽", indexHtml],
  ["案件中心", boardHtml],
  ["案件流程", workflowHtml],
  ["期中輔導", midtermHtml],
]) {
  assert.match(
    html,
    /mobile-polish\.css\?v=1/,
    `${name}必須載入手機版修正樣式`
  );
}

console.log("mobile layout tests passed");
