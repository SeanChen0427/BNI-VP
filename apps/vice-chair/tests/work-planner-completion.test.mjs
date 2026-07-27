import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../assets/js/work-planner.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /canComplete=domain\.canDirectComplete\(task\)/,
  "首頁完成按鈕必須先通過共用的直接完成規則"
);
assert.match(
  source,
  /if\(!domain\.canDirectComplete\(task\)\)\{toast\("此案件需完成訪談表與後續流程，不能直接結案"\);return\}/,
  "完成函式必須阻擋正式訪談案件直接結案"
);
assert.doesNotMatch(
  source,
  /tasks\.filter\(task=>!task\.completed\)/,
  "首頁進行中案件不得只依 task.completed 判斷"
);
assert.match(
  source,
  /#planType"\)\.disabled=Boolean\(task\)/,
  "編輯既有案件時必須鎖定案件類型"
);
assert.match(
  source,
  /#planMember"\)\.readOnly=Boolean\(task\)/,
  "編輯既有案件時必須鎖定會員"
);
assert.match(
  source,
  /member=existing\?\.member\|\|/,
  "保存既有案件時必須沿用原會員，不信任可修改的表單值"
);

console.log("work-planner completion tests passed");
