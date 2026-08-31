import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("文稿範本頁只供副主席與 Admin，且不會自行發送訊息", () => {
  const page = read("message-templates.html");
  const source = read("assets/js/message-templates.js");
  assert.match(page, /不會自行發送任何訊息/);
  assert.match(page, /身分證字號由會員本人回覆，系統不保存/);
  assert.match(source, /\["admin", "vp"\]\.includes/);
  assert.match(source, /navigator\.clipboard/);
  assert.doesNotMatch(source, /line\/v2\/bot\/message|pushMessage|\/api\/line/);
});

test("新會員繳費後協助群文稿分成兩段複製，並套用當屆副主席資料", () => {
  const domain = read("core/message-template-domain.js");
  const source = read("assets/js/message-templates.js");
  assert.match(domain, /new-member-assistance-group-opening/);
  assert.match(domain, /秘財建立主席、副主席、秘財與新會員的協助群/);
  assert.match(domain, /複製自我介紹/);
  assert.match(domain, /複製訪談邀約/);
  assert.match(source, /FulianAuth\.getConfig\(\)/);
  assert.match(source, /members\?status=eq\.active/);
  assert.match(source, /select=profession,people!inner\(display_name\)/);
  assert.match(source, /domain\.personalizeContent/);
});

test("文稿頁不讀取案件、投票或訪談 Word", () => {
  const page = read("message-templates.html");
  const source = read("assets/js/message-templates.js");
  assert.match(page, /系統不讀取案件/);
  assert.doesNotMatch(page, /task-store|case-state-store|case-files/);
  assert.doesNotMatch(source, /FulianCase|taskId|caseId|vote|wordSaved|case-workflow|case-archive/);
});

test("副主席只能複製，只有 Admin 可透過受保護 API 更新正式公版", () => {
  const source = read("assets/js/message-templates.js");
  const edge = read("../../supabase/functions/app-api/index.ts");
  assert.match(source, /const canEdit = session\?\.role === "admin"/);
  assert.match(source, /textarea maxlength=.*readonly/);
  assert.match(source, /\/api\/message-templates/);
  assert.match(source, /確認將「\$\{template\.title\}」目前文字儲存為所有裝置共用的正式公版/);
  assert.match(edge, /MESSAGE_TEMPLATE_SETTINGS_KEY = "common_message_templates"/);
  assert.match(edge, /async function messageTemplatesApi/);
  assert.match(edge, /leadership\(context\)/);
  assert.match(edge, /context\.role !== "admin"/);
  assert.match(edge, /只有系統開發人員 Admin 可以修改正式文稿範本/);
  assert.match(edge, /messageTemplateDomain\.saveTemplate/);
  assert.match(edge, /path === "\/api\/message-templates"/);
});
