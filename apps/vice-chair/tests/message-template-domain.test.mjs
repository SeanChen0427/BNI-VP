import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const domain = require("../core/message-template-domain.js");

test("三份原始公版固定存在且不含會員個資", () => {
  const result = domain.response(domain.defaults());
  assert.deepEqual(result.templates.map(item => item.id), [
    "group-usage-guide",
    "new-member-interview-confirmation",
    "renewal-interview-confirmation",
  ]);
  assert.match(result.templates[0].content, /富聯分會-各群組使用說明/);
  assert.match(result.templates[1].content, /訪談內容無誤，已確認/);
  assert.match(result.templates[2].content, /會員期終輔導訪談表/);
  assert.doesNotMatch(JSON.stringify(result), /[A-Z][12]\d{8}/);
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

test("三份文稿獨立存在，不需要案件或投票資料", () => {
  const settings = domain.saveTemplate(domain.defaults(), "group-usage-guide", "群組新版文稿");
  const result = domain.response(settings);
  assert.equal(result.templates[0].content, "群組新版文稿");
  assert.match(result.templates[1].content, /新會員訪談表及申請表/);
  assert.match(result.templates[2].content, /會員期終輔導訪談表及申請表/);
  assert.doesNotMatch(JSON.stringify(result), /caseId|vote|wordSaved/);
});
