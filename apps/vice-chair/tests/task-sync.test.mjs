import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("所有排程頁面都先載入 Supabase task store", () => {
  const pages = [
    "apps/vice-chair/index.html",
    "apps/vice-chair/case-board.html",
    "apps/vice-chair/member-care.html",
    "apps/vice-chair/monthly-meeting.html",
    "apps/vice-chair/case-workflow.html",
    "apps/vice-chair/case-archive.html",
    "apps/vice-chair/terminal-form.html",
    "apps/vice-chair/new-member-form.html",
    "apps/vice-chair/industry-change-form.html",
    "apps/vice-chair/midterm-form.html",
    "apps/vice-chair/departure-form.html"
  ];
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /assets\/js\/task-store\.js\?v=1/, `${page} 未載入 task-store`);
  }
});

test("task store 支援舊排程搬移、差異同步與刪除同步", () => {
  const source = read("apps/vice-chair/assets/js/task-store.js");
  assert.match(source, /fulian-task-supabase-migration-v1/);
  assert.match(source, /changedTasks/);
  assert.match(source, /deletedIds/);
  assert.match(source, /fetch\("\/api\/tasks"/);
});

test("Edge API 保護管理與委員完成權限", () => {
  const source = read("supabase/functions/app-api/index.ts");
  assert.match(source, /path === "\/api\/tasks"/);
  assert.match(source, /會員委員只能完成自己主責的一般關懷/);
  assert.match(source, /row\.lead_person_id !== context\.personId/);
  assert.match(source, /task_private_details/);
});
