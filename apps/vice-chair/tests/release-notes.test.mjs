import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), "utf8");
const index = read("index.html");
const settings = read("settings.html");
const releaseScript = read("assets/js/release-notes.js");
const notificationScript = read("assets/js/notification-center.js");

test("首頁版本入口與工作提醒鈴鐺彼此獨立", () => {
  assert.match(index, /id="releaseNotesTrigger"/);
  assert.match(index, /id="notificationBell"/);
  assert.match(index, /id="releaseNotesDialog"/);
  assert.doesNotMatch(notificationScript, /releaseNotes|系統版本更新/);
});

test("使用者版更新歷史放在設定頁且不顯示技術 CHANGELOG", () => {
  assert.match(settings, /id="releaseNotes"/);
  assert.match(settings, /系統版本與更新/);
  assert.match(settings, /id="releaseNotesHistory"/);
  assert.doesNotMatch(settings, /CHANGELOG\.md/);
});

test("閱讀狀態依角色與姓名隔離，重要更新才自動顯示", () => {
  assert.match(releaseScript, /fulian-release-notes-read-v1-\$\{session\.role\}-\$\{session\.name\}/);
  assert.match(releaseScript, /latest\.level === "important" && !isLatestRead\(\)/);
  assert.match(releaseScript, /localStorage\.setItem\(readKey, latest\.version\)/);
});

test("目前版本明確聲明訪談重試邊界與歷史資料保護", () => {
  assert.match(releaseScript, /version: "1\.0\.6"/);
  assert.match(releaseScript, /依正式案件編號完成結案/);
  assert.match(releaseScript, /不會建立重複案件/);
  assert.match(releaseScript, /保留既有訪談內容、Word、分工、排程及已完成資料/);
});
