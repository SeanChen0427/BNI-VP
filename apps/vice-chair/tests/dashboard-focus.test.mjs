import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("首頁移除重複或未接正式資料的工作卡", async () => {
  const html = await read("../index.html");

  assert.doesNotMatch(html, /本月工作節點|monthlyTimeline|plan-panel/);
  assert.doesNotMatch(html, /例會準備|meeting-list|date-chip/);
  assert.doesNotMatch(html, /案件階段摘要|stageWaitingCount|caseStages/);
  const announcementIndex = html.indexOf('class="panel announcement-board"');
  const memberStatusIndex = html.indexOf('id="status"');
  const metricsIndex = html.indexOf('class="metrics"');
  const priorityIndex = html.indexOf('id="cases"');
  const monthlyDataIndex = html.indexOf('id="monthlyDataUpdate"');
  const learningIndex = html.indexOf('class="panel learning-panel');
  assert.ok(announcementIndex >= 0 && memberStatusIndex > announcementIndex);
  assert.ok(metricsIndex > memberStatusIndex);
  assert.ok(priorityIndex >= 0 && monthlyDataIndex > priorityIndex);
  assert.ok(learningIndex > monthlyDataIndex);
  assert.match(html, /assets\/css\/dashboard\.css\?v=4/);
  assert.match(html, /assets\/js\/work-planner\.js\?v=13/);
});

test("案件中心只把正式訪談案件放進五階段管線", async () => {
  const board = await read("../assets/js/case-board.js");

  assert.match(
    board,
    /const pipeline = list\.filter\(\(\{ task \}\) => domain\.requiresInterviewForm\(task\)\)/
  );
  assert.match(
    board,
    /domain\.requiresInterviewForm\(item\.task\) && item\.stage === filter/
  );
  assert.match(
    board,
    /if \(!domain\.requiresInterviewForm\(task\)\) return task\.stage \|\| "待開始關懷";/
  );
});

test("會員狀態與副主席學習卡不再綁在同一個雙欄容器", async () => {
  const html = await read("../index.html");

  assert.doesNotMatch(html, /class="dashboard-grid"/);
});
