import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const domain = require("../core/message-template-domain.js");

test("四份原始公版固定存在且不含會員個資", () => {
  const result = domain.response(domain.defaults());
  assert.deepEqual(result.templates.map(item => item.id), [
    "new-member-assistance-group-opening",
    "group-usage-guide",
    "new-member-interview-confirmation",
    "renewal-interview-confirmation",
  ]);
  assert.match(result.templates[0].content, /我們將安排兩位會員委員/);
  assert.match(result.templates[1].content, /富聯分會-各群組使用說明/);
  assert.match(result.templates[2].content, /訪談內容無誤，已確認/);
  assert.match(result.templates[3].content, /會員期終輔導訪談表/);
  assert.doesNotMatch(JSON.stringify(result), /[A-Z][12]\d{8}/);
});

test("繳費後協助群公版可分別複製兩段，並套用當屆副主席資訊", () => {
  const template = domain.response(domain.defaults()).templates.find(item => item.id === "new-member-assistance-group-opening");
  const parts = domain.contentParts(template);
  assert.equal(parts.length, 2);
  assert.match(parts[0].content, /＠【新會員姓名】/);
  assert.match(parts[1].content, /預計全程約需 2 小時/);
  assert.equal(domain.joinContent(template, parts.map(part => part.content)), template.content);

  const personalized = domain.personalizeContent(parts[0].content, {
    vicePresidentName: "測試副主席",
    vicePresidentProfession: "測試行業",
  });
  assert.match(personalized, /富聯副主席測試行業的測試副主席/);
  assert.doesNotMatch(personalized, /【副主席(?:姓名|行業別)】/);
  assert.match(domain.personalizeContent(parts[0].content), /【副主席姓名】/);
  assert.throws(
    () => domain.saveTemplate(domain.defaults(), template.id, template.content.replace("【副主席姓名】", "寫死姓名")),
    /必須保留 【副主席姓名】/,
  );
  assert.throws(
    () => domain.saveTemplate(domain.defaults(), template.id, template.content.replace(domain.MESSAGE_SEPARATOR, "\n\n")),
    /分段結構不完整/,
  );
});

test("正式公版修改會保留前一版本與操作者", () => {
  const before = domain.defaults();
  const after = domain.saveTemplate(before, "renewal-interview-confirmation", "更新後文稿", {
    updatedAt: "2026-08-18T10:00:00.000Z",
    updatedBy: "admin:系統開發人員 Admin",
  });
  assert.equal(after.contents["renewal-interview-confirmation"], "更新後文稿");
  assert.match(after.history[0].previousContent, /會員期終輔導訪談表/);
  assert.equal(after.history[0].updatedBy, "admin:系統開發人員 Admin");
  assert.throws(() => domain.saveTemplate(before, "unknown", "文字"), /找不到指定/);
  assert.throws(() => domain.saveTemplate(before, "group-usage-guide", "  "), /不可空白/);
});

test("四份文稿獨立存在，不需要案件或投票資料", () => {
  const settings = domain.saveTemplate(domain.defaults(), "group-usage-guide", "群組新版文稿");
  const result = domain.response(settings);
  assert.equal(result.templates.find(item => item.id === "group-usage-guide").content, "群組新版文稿");
  assert.match(result.templates.find(item => item.id === "new-member-interview-confirmation").content, /新會員訪談表及申請表/);
  assert.match(result.templates.find(item => item.id === "renewal-interview-confirmation").content, /會員期終輔導訪談表及申請表/);
  assert.doesNotMatch(JSON.stringify(result), /caseId|vote|wordSaved/);
});
