import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("離會人員紀錄預設只顯示最新五人並可展開完整歷史", () => {
  const page = read("apps/vice-chair/settings.html");
  const source = read("apps/vice-chair/assets/js/settings.js");

  assert.match(page, /id="toggleDepartureHistory"[^>]+aria-controls="departedList"/);
  assert.match(page, /assets\/js\/settings\.js\?v=7/);
  assert.match(source, /DEPARTURE_PREVIEW_LIMIT=5/);
  assert.match(source, /localeCompare\(String\(a\.confirmedAt/);
  assert.match(source, /departureHistoryExpanded\?departed:departed\.slice\(0,DEPARTURE_PREVIEW_LIMIT\)/);
  assert.match(source, /查看全部歷史紀錄/);
  assert.match(source, /收合歷史紀錄/);
  assert.match(source, /aria-expanded/);
});
