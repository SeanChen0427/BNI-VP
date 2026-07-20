import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const completion=require("../services/interview-completion.js");
const now=new Date("2026-07-17T12:34:56.000Z");
const record=completion.completionRecord({
  caseId:"task 123",
  fileName:"訪談.docx",
  memberName:"測試會員",
  now
});

assert.equal(completion.feedbackUrl("task 123"),"case-workflow.html?case=task%20123");
assert.equal(record.caseId,"task 123");
assert.equal(record.fileName,"訪談.docx");
assert.equal(record.memberName,"測試會員");
assert.equal(record.completedAt,"2026-07-17T12:34:56.000Z");

console.log("interview-completion tests passed");
