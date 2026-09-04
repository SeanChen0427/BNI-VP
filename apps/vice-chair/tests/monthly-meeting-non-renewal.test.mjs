import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), "utf8");

test("續約項目可記錄確認不續約且不要求工作排定", () => {
  const html = read("monthly-meeting.html");
  const script = read("assets/js/monthly-meeting.js");
  const styles = read("assets/css/monthly-meeting-care.css");

  assert.match(html, /確認不續約，可直接保留決議而不建立工作/);
  assert.match(html, /已完成／不續約/);
  assert.match(script, /data-field="disposition"/);
  assert.match(script, /value="non_renewal"/);
  assert.match(script, /item\.assignmentRequired=disposition!=="non_renewal"/);
  assert.match(script, /已記錄確認不續約，不需排定工作/);
  assert.match(script, /會議決議：確認不續約/);
  assert.match(styles, /data-disposition="non_renewal"/);
});

test("本機與 Supabase API 均在後端正規化不續約決議", () => {
  const preview = read("preview-server.mjs");
  const edge = fs.readFileSync(new URL("../../supabase/functions/app-api/index.ts", root), "utf8");

  assert.match(preview, /isValidCareDisposition/);
  assert.match(preview, /careItems\.map\(monthlyMeetingDomain\.normalizeCareItem\)/);
  assert.match(edge, /function isConfirmedMonthlyNonRenewal/);
  assert.match(edge, /function normalizeMonthlyCareItems/);
  assert.match(edge, /monthlyCareRequiresAssignment\(item\)/);
  assert.match(edge, /確認不續約只能用於續約項目/);
  assert.match(edge, /需要後續行動的續約及輔導項目/);
});

test("不續約決議不建立新工作，也不自動刪除已有案件紀錄", () => {
  const script = read("assets/js/monthly-meeting.js");

  assert.match(script, /if\(!requiresCareAssignment\(item\)\)/);
  assert.match(script, /if\(existing\)\{item\.taskId=existing\.id/);
  assert.match(script, /return"existing"/);
  assert.match(script, /已有工作仍保留/);
  assert.match(script, /避免誤刪訪談或案件紀錄/);
});

test("已結案的不續約決議可追加更正，且不會開啟或覆寫月會草稿", () => {
  const html = read("monthly-meeting.html");
  const script = read("assets/js/monthly-meeting.js");
  const preview = read("preview-server.mjs");
  const edge = fs.readFileSync(new URL("../../supabase/functions/app-api/index.ts", root), "utf8");

  assert.match(html, /id="renewalCorrectionDialog"/);
  assert.match(html, /原本的「確認不續約」、月會內容及其他草稿都不會被覆蓋/);
  assert.match(script, /action:"amend-renewal-decision"/);
  assert.match(script, /record\?\.status!=="final"/);
  assert.match(script, /原本的「確認不續約」決議仍會完整保留/);
  assert.match(script, /三之一、結案後續約決議更正/);
  assert.match(preview, /existing\.status!=="final"/);
  assert.match(preview, /不會修改月會草稿/);
  assert.match(edge, /meeting_month=eq\.\$\{meetingMonth\}-01&status=eq\.final/);
  assert.match(edge, /correctedAt: now/);
  assert.match(edge, /correctedBy: context\.identity/);
  assert.match(edge, /onlyCareIds: \[careItemId\], updateCareIds: \[careItemId\]/);
  assert.match(edge, /task\?\.status === "completed"/);
  assert.match(edge, /sequence <= 20/);
  assert.match(edge, /不能隨整份月會覆寫/);
});
