import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = [
  "attendance.html",
  "case-board.html",
  "case-workflow.html",
  "departure-form.html",
  "industry-change-form.html",
  "member-care.html",
  "message-templates.html",
  "midterm-form.html",
  "monthly-meeting.html",
  "new-member-form.html",
  "settings.html",
  "terminal-form.html",
  "useful-links.html",
];

for (const page of pages) {
  const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
  assert.ok(
    html.includes("assets/css/workspace-nav.css"),
    `${page} 缺少常駐導覽樣式`
  );
  assert.ok(
    html.includes("assets/js/workspace-nav.js"),
    `${page} 缺少常駐導覽程式`
  );
}

const navScript = await readFile(
  new URL("../assets/js/workspace-nav.js", import.meta.url),
  "utf8"
);
assert.ok(navScript.includes('aria-label", "開啟主選單'));
assert.ok(navScript.includes("workspace-back-label"));
assert.ok(navScript.includes("上一頁"));
assert.ok(navScript.includes("會員關懷儀表板"));
assert.ok(navScript.includes("會員委員會月會"));
assert.ok(navScript.includes("常用資源"));
assert.ok(navScript.includes("文稿範本"));
assert.ok(navScript.includes("common-resources"));

console.log("workspace-nav tests passed");
