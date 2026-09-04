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

test("最新版本說明委員任期收權，並保留台北時間、換屆與續約修正", () => {
  assert.match(releaseScript, /version: "1\.0\.25"/);
  assert.match(releaseScript, /一般登入工作階段仍可讀取現任名單，但不能再直接新增、修改或刪除委員任期/);
  assert.match(releaseScript, /由受保護的後端函式一次切換/);
  assert.match(releaseScript, /不增加日常按鈕/);
  assert.match(releaseScript, /不修改任何現任或歷史任期、案件、工作及交接紀錄/);
  assert.ok(releaseScript.indexOf('version: "1.0.25"') < releaseScript.indexOf('version: "1.0.24"'));
  assert.match(releaseScript, /version: "1\.0\.24"/);
  assert.match(releaseScript, /任期、權限、換屆、截止日、排程與每月切換統一使用台北日期/);
  assert.match(releaseScript, /精確時間仍安全保留為 UTC/);
  assert.match(releaseScript, /不改寫任何舊案件、任期、指派、投票、Word 或分析快照/);
  assert.ok(releaseScript.indexOf('version: "1.0.24"') < releaseScript.indexOf('version: "1.0.23"'));
  assert.match(releaseScript, /version: "1\.0\.23"/);
  assert.match(releaseScript, /完整輸入「委員會進度」/);
  assert.match(releaseScript, /Reply，不計入月訊息額度/);
  assert.match(releaseScript, /一般聊天、其他群組與部分關鍵字不會自動回覆/);
  assert.match(releaseScript, /version: "1\.0\.22"/);
  assert.match(releaseScript, /Admin/);
  assert.match(releaseScript, /提前排好/);
  assert.match(releaseScript, /原指派/);
  assert.match(releaseScript, /結案確認人/);
  assert.match(releaseScript, /換屆待指派/);
  assert.match(releaseScript, /version: "1\.0\.21"/);
  assert.match(releaseScript, /會中已確認不續約/);
  assert.match(releaseScript, /不需填追蹤委員或排定日期/);
  assert.match(releaseScript, /結案後會員改為續約/);
  assert.match(releaseScript, /不會解鎖或覆寫任何月會草稿/);
  assert.match(releaseScript, /version: "1\.0\.20"/);
  assert.match(releaseScript, /12 小時等待交流群新訊息/);
  assert.match(releaseScript, /不保存好友 LINE ID、群組聊天內容或 replyToken/);
  assert.match(releaseScript, /version: "1\.0\.19"/);
  assert.match(releaseScript, /8 月正式儀表板會繼續使用 7 月完整資料/);
  assert.match(releaseScript, /台北時間每月 1 日自動成為正式資料/);
});

test("目前版本明確聲明訪談重試邊界與歷史資料保護", () => {
  assert.match(releaseScript, /version: "1\.0\.6"/);
  assert.match(releaseScript, /依正式案件編號完成結案/);
  assert.match(releaseScript, /不會建立重複案件/);
  assert.match(releaseScript, /保留既有訪談內容、Word、分工、排程及已完成資料/);
});
