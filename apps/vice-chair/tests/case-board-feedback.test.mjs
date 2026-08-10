import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boardSource = readFileSync(
  new URL("../assets/js/case-board.js", import.meta.url),
  "utf8"
);
const workflowSource = readFileSync(
  new URL("../assets/js/case-workflow.js", import.meta.url),
  "utf8"
);
const workflowHtml = readFileSync(
  new URL("../case-workflow.html", import.meta.url),
  "utf8"
);
const workflowCss = readFileSync(
  new URL("../assets/css/case-workflow.css", import.meta.url),
  "utf8"
);

assert.match(
  boardSource,
  /domain\.feedbackParticipation\(/,
  "案件中心必須使用共用規則判斷登入者的回饋狀態"
);
assert.match(boardSource, /"你已回饋"/);
assert.match(boardSource, /"待你回饋"/);
assert.match(boardSource, /填寫我的回饋/);
assert.match(boardSource, /處理委員回饋/);
assert.match(boardSource, /處理委員投票/);
assert.match(boardSource, /進入委員投票/);
assert.match(boardSource, /處理董顧確認/);
assert.doesNotMatch(
  boardSource,
  /查看案件流程/,
  "進行中案件不得顯示重複的查看案件流程按鈕"
);
assert.match(
  boardSource,
  /\["feedback", "vote", "advisor"\]\.includes\(stage\)/,
  "只有進入回饋、投票或董顧階段的案件才顯示決議流程入口"
);
assert.match(
  boardSource,
  /stage !== "advisor" \|\| canManageDecision/,
  "董顧確認入口只提供副主席"
);
assert.match(
  boardSource,
  /midterm: \{[^}]+flow: false/,
  "期中輔導完成 Word 後不得進入案件回饋流程"
);
assert.match(
  boardSource,
  /departure: \{[^}]+flow: false/,
  "離會訪談完成 Word 後不得進入案件回饋流程"
);
assert.match(boardSource, /industry: \{[^}]+flow: true/);
assert.match(workflowSource, /midterm:\{label:"期中輔導"/);
assert.match(workflowSource, /departure:\{label:"離會訪談"/);
assert.match(
  workflowSource,
  /taskBoundFields=new Set\(\["caseType","applicant","profession"\]\)/,
  "工作案件的正式類型、會員與專業別必須受同一組身份保護"
);
assert.match(
  workflowSource,
  /sourceTask&&taskBoundFields\.has\(id\)/,
  "舊流程草稿不得覆蓋工作案件的正式身份"
);
assert.match(workflowHtml, /<option value="midterm">期中輔導<\/option>/);
assert.match(workflowHtml, /<option value="departure">離會訪談<\/option>/);
assert.match(
  workflowHtml,
  /class="card vp-only-section" id="resultSection"/,
  "三長群與董事顧問確認只能顯示於副主席介面"
);
assert.match(
  workflowHtml,
  /class="card close-card vp-only-section" id="closeSection"/,
  "結案存檔只能顯示於副主席介面"
);
assert.match(
  workflowHtml,
  /<aside class="side-column vp-only-section">/,
  "案件狀態與歷程側欄只能顯示於副主席介面"
);
assert.doesNotMatch(
  workflowHtml,
  /sticky-card/,
  "案件狀態不得在捲動時黏著畫面"
);
assert.doesNotMatch(
  workflowCss,
  /\.sticky-card\{position:sticky/,
  "案件狀態不得透過 CSS 跟隨頁面捲動"
);
assert.match(workflowHtml, /case-workflow\.css\?v=2/);
assert.match(workflowSource, /\$\$\("\.vp-only-section"\)/);
assert.match(workflowSource, /classList\.toggle\("committee-view",!allowed\)/);
assert.match(
  workflowSource,
  /#copyLeaders"\)\.addEventListener\("click",async\(\)=>\{if\(!isVp\(\)\)return;/,
  "委員不得由畫面外觸發三長群文案操作"
);
assert.match(
  boardSource,
  /case-archive\.html\?case=/,
  "所有已結案案件都必須提供統一的結案資料入口"
);
assert.match(
  boardSource,
  /stage === "closed" && canViewArchive/,
  "結案資料入口只提供副主席"
);
assert.match(
  boardSource,
  /stage === "closed" \? "案件流程已完成" : task\.stage/,
  "結案清單不得再顯示訪談排定時保存的舊階段文字"
);
assert.match(
  boardSource,
  /stage === "closed" \? "原排定時間"/,
  "結案清單的日期必須標示為原排定時間"
);
assert.match(
  readFileSync(new URL("../case-board.html", import.meta.url), "utf8"),
  /assets\/js\/case-board\.js\?v=11/,
  "案件中心必須載入階段式決議入口的新版程式"
);

console.log("case-board feedback tests passed");
