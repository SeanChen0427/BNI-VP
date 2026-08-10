import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");

test("續約數據只能使用完全相同期間的 PALMS",()=>{
  assert.match(edge,/function validFullMonthPeriod\(start: string, end: string\)/);
  assert.match(edge,/row\.period_start === period\.start && row\.period_end === period\.end/);
  assert.match(edge,/reportForExactPeriod\(rows, period\)/);
  assert.match(edge,/不會改用其他期間資料/);
  assert.doesNotMatch(edge,/reportForExactPeriod\(rows, period\)\s*\|\|/);
});

test("續約專用 PALMS 上傳只允許副主席或 Admin，並核對報表期間",()=>{
  const start=edge.indexOf("async function renewalDataApi");
  const end=edge.indexOf("function meetingToApi",start);
  const source=edge.slice(start,end);
  assert.match(source,/leadership\(context\)/);
  assert.match(source,/report\.period\.start !== periodStart \|\| report\.period\.end !== periodEnd/);
  assert.match(source,/metadata: \{ category: "renewal"/);
  assert.match(source,/type: "renewal"/);
});

test("續約分會平均與會員數據來自同一份報表",()=>{
  assert.match(edge,/member: \{ name: memberName, metrics: normalizedPalmsMetrics\(member\) \}/);
  assert.match(edge,/averages: averagePalmsMetrics\(members\)/);
  assert.match(edge,/memberCount: members\.length/);
});
