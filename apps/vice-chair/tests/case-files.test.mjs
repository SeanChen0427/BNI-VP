import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const caseFiles = require("../services/case-files.js");

const original = {
  feedback: { 委員甲: "既有回饋" },
  votes: {},
  log: [{ text: "舊紀錄", time: "稍早", done: true }],
};
const next = caseFiles.workflowAfterWord(
  original,
  "訪談.docx",
  "新會員訪談表單",
  "2026/7/16 12:00",
  "2026-07-16T04:00:00.000Z"
);

assert.equal(next.wordSaved, true);
assert.equal(next.wordReal, true);
assert.equal(next.wordName, "訪談.docx");
assert.equal(next.interviewCompletedAt, "2026-07-16T04:00:00.000Z");
assert.equal(next.feedback.委員甲, "既有回饋");
assert.equal(next.log[0].text, "訪談 Word 已由新會員訪談表單產生：訪談.docx");
assert.equal(original.wordSaved, undefined);

const completedWithoutDecision = caseFiles.workflowAfterWord(
  {},
  "期中.docx",
  "期中輔導表單",
  "2026/7/20 13:00",
  "2026-07-20T05:00:00.000Z",
  { closeWithoutDecision: true }
);
assert.equal(completedWithoutDecision.wordSaved, true);
assert.equal(completedWithoutDecision.closed, true);
assert.equal(
  typeof caseFiles.getCaseFile,
  "function",
  "結案資料頁必須能透過共用附件服務重新取得 Word"
);

console.log("case-files tests passed");
