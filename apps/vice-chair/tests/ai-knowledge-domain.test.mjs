import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  queryTerms,
  splitKnowledgeDocument,
  selectKnowledge,
  sanitizeAiAnswer,
} = require("../core/ai-knowledge-domain.js");

const question = "321a是什麼怎麼執行";
const terms = queryTerms(question);
assert.ok(terms.includes("321a"), "應從中英數連寫問題抽出 321a");
assert.ok(terms.includes("定位"), "定義型問題應擴充定位意圖");
assert.ok(terms.includes("運作"), "執行型問題應擴充運作意圖");
assert.ok(terms.includes("階段"), "執行型問題應擴充階段意圖");

const document = await readFile(
  new URL("../docs/policies/321a-review.md", import.meta.url),
  "utf8"
);
const chunks = splitKnowledgeDocument(
  document,
  "docs/policies/321a-review.md"
);
const selected = selectKnowledge(question, chunks);
assert.ok(selected.length > 0, "321A 問題必須找到知識來源");
assert.ok(
  selected.some(chunk => chunk.title.includes("定位與使用界線")),
  "定義問題必須選到 321A 定位"
);
assert.ok(
  selected.some(chunk => chunk.title.includes("四階段運作")),
  "執行問題必須選到四階段運作"
);

const leaked = [
  '確認" -> Must use this exact phrase.',
  "",
  "*Drafting final text:*",
  "321A 是新會員評估框架。",
].join("\n");
assert.equal(sanitizeAiAnswer(leaked), "321A 是新會員評估框架。");

console.log("ai-knowledge-domain tests passed");
