import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../case-archive.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../assets/js/case-archive.js", import.meta.url), "utf8");

assert.match(html, /id="caseFacts"/);
assert.match(html, /id="downloadWord"/);
assert.match(html, /id="feedbackList"/);
assert.match(html, /id="voteList"/);
assert.match(html, /id="downloadVoteResult"/);
assert.match(html, /id="advisorFacts"/);
assert.match(html, /id="activityLog"/);
assert.match(html, /id="departureInsightsSection"/);
assert.match(html, /vote-result-image\.js\?v=1/);
assert.match(html, /case-archive\.js\?v=5/);
assert.match(source, /\["vp", "admin"\]\.includes\(session\?\.role\)/, "結案資料只能由副主席與 Admin 查閱");
assert.match(source, /files\.getCaseFile/, "結案頁必須能讀取保存的 Word");
assert.match(source, /domain\.requiresDecisionWorkflow\(task\)/, "非投票案件也必須有結案摘要");
assert.match(source, /domain\.isClosed\(task, state\)/, "尚未結案案件不得進入結案資料頁");
assert.match(source, /#decisionSection"\)\.hidden = true/, "記錄型案件不得顯示委員回饋與投票區");
assert.match(source, /task\.type === "departure"/, "離會訪談須顯示營運改善紀錄");
assert.match(source, /draft\.committeeSummary/);
assert.match(source, /draft\.internalNotes/);
assert.match(source, /FulianVoteResultImage\.download/, "結案頁必須能下載投票結果圖");
assert.match(source, /fact\("結案確認人", task\.completedBy\)/, "結案頁必須顯示原結案確認人");
assert.match(source, /task\.assignmentHistory/, "結案頁必須顯示指派異動歷程");

console.log("case archive tests passed");
