import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../case-archive.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../assets/js/case-archive.js", import.meta.url), "utf8");

assert.match(html, /id="caseFacts"/);
assert.match(html, /id="downloadWord"/);
assert.match(html, /id="feedbackList"/);
assert.match(html, /id="voteList"/);
assert.match(html, /id="advisorFacts"/);
assert.match(html, /id="activityLog"/);
assert.match(source, /session\?\.role !== "vp"/, "結案資料只能由副主席查閱");
assert.match(source, /files\.getCaseFile/, "結案頁必須能讀取保存的 Word");
assert.match(source, /domain\.requiresDecisionWorkflow\(task\)/, "非投票案件也必須有結案摘要");
assert.match(source, /domain\.isClosed\(task, state\)/, "尚未結案案件不得進入結案資料頁");

console.log("case archive tests passed");
