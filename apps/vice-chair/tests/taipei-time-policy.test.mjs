import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {taipeiDay} from "../../bni-analysis/engine/time.mjs";

const read=relative=>readFile(new URL(relative,import.meta.url),"utf8");

test("分析日以台北午夜切換，不受執行主機時區影響",()=>{
  assert.equal(taipeiDay("2026-09-30T15:59:59.999Z"),"2026-09-30");
  assert.equal(taipeiDay("2026-09-30T16:00:00.000Z"),"2026-10-01");
});

test("資料庫任期與指派權限統一使用台北業務日期",async()=>{
  const migration=await read("../../../supabase/migrations/20260904170000_standardize_taipei_business_date.sql");
  assert.match(migration,/create or replace function private\.taipei_today\(\)/);
  assert.match(migration,/now\(\) at time zone 'Asia\/Taipei'/);
  assert.doesNotMatch(migration,/\bcurrent_date\b/i);
  for(const name of ["is_active_committee_person","is_case_assigned","is_task_assigned"]){
    assert.match(migration,new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?private\\.taipei_today\\(\\)`));
  }
});

test("分析與本機預覽的預設作業日都取台北日期",async()=>{
  const [analysis,preview]=await Promise.all([
    read("../../bni-analysis/engine/analyze.mjs"),
    read("../preview-server.mjs")
  ]);
  assert.equal((analysis.match(/asOf = taipeiDay\(\)/g)||[]).length,2);
  assert.match(preview,/const \[year,month\]=taipeiDay\(\)\.split/);
});

test("使用台北日期工具的頁面都先載入共用日曆核心",async()=>{
  const pages={
    "../index.html":"assets/js/work-planner.js?v=12",
    "../member-care.html":"assets/js/member-care.js?v=8",
    "../case-workflow.html":"assets/js/case-workflow.js?v=31",
    "../analysis-review.html":"assets/js/analysis-review.js?v=11",
    "../terminal-form.html":"assets/js/terminal-form.js?v=11",
    "../monthly-meeting.html":"assets/js/monthly-meeting.js?v=17",
    "../attendance.html":"assets/js/attendance.js?v=12",
    "../case-board.html":"assets/js/case-board.js?v=15",
    "../new-member-form.html":"assets/js/new-member-form.js?v=9",
    "../industry-change-form.html":"assets/js/industry-change-form.js?v=8",
    "../departure-form.html":"assets/js/departure-form.js?v=6",
    "../settings.html":"assets/js/settings.js?v=19",
    "../midterm-form.html":"assets/js/midterm-form.js?v=8"
  };
  for(const [page,script] of Object.entries(pages)){
    const html=await read(page);
    const calendarIndex=html.indexOf("core/calendar-domain.js?v=4");
    const scriptIndex=html.indexOf(script);
    assert.ok(calendarIndex>=0&&scriptIndex>calendarIndex,`${page} 必須先載入台北日曆核心`);
  }
});

test("主要日期輸入頁不再用裝置時區偏移技巧產生預設值",async()=>{
  const scripts=[
    "../assets/js/work-planner.js",
    "../assets/js/case-creator.js",
    "../assets/js/case-workflow.js",
    "../assets/js/attendance.js",
    "../assets/js/monthly-meeting.js",
    "../assets/js/new-member-form.js",
    "../assets/js/industry-change-form.js",
    "../assets/js/departure-form.js",
    "../assets/js/midterm-form.js",
    "../assets/js/terminal-form.js"
  ];
  for(const script of scripts){
    const source=await read(script);
    assert.doesNotMatch(source,/getTimezoneOffset\(/,`${script} 不得依裝置時區修正日期`);
    assert.doesNotMatch(source,/new Date\(\)\.toISOString\(\)\.slice\(0,\s*(?:10|16)\)/,`${script} 不得以 UTC 日期冒充台北日期`);
  }
});
