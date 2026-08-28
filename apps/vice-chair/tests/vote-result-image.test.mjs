import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const image = require("../assets/js/vote-result-image.js");
const root = new URL("../../..", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("投票結果圖資料只包含彙總票數，不包含投票者名單或逐人票向", () => {
  const report = image.createReport({
    state: {
      voterSnapshot: ["測試副主席", "測試委員甲", "測試委員乙", "測試委員丙", "測試委員丁"],
      votedVoters: ["測試副主席", "測試委員甲", "測試委員乙"],
      votes: { "測試副主席": "approve" },
      voteTally: { total: 3, approve: 2, reject: 1 },
    },
    caseType: "renewal",
    applicant: "測試申請者",
    profession: "測試專業",
    deadlineAt: "2026-08-28T18:00:00+08:00",
    approveLabel: "同意續約",
    rejectLabel: "不同意續約",
    generatedAt: "2026-08-28T17:00:00+08:00",
  });

  assert.equal(report.title, "續約投票結果");
  assert.equal(report.total, 3);
  assert.equal(report.approve, 2);
  assert.equal(report.reject, 1);
  assert.equal(report.quorum, 3);
  assert.equal(report.status, "pass");
  assert.equal(report.approvePercent, "66.7%");
  assert.doesNotMatch(JSON.stringify(report), /測試副主席|測試委員甲|測試委員乙|votedVoters|voterSnapshot|votes/);
  assert.match(image.filenameFor(report), /^續約投票結果-測試申請者-20260828\.png$/);
});

test("進行中及結案頁都有 PNG 下載，副主席可看具名票向", () => {
  const workflowHtml = read("apps/vice-chair/case-workflow.html");
  const workflowSource = read("apps/vice-chair/assets/js/case-workflow.js");
  const archiveHtml = read("apps/vice-chair/case-archive.html");

  assert.match(workflowHtml, /id="downloadVoteResult"/);
  assert.match(workflowHtml, /id="namedVoteDetails"/);
  assert.match(workflowHtml, /圖面只含票數統計，不含具名票向/);
  assert.match(workflowSource, /canViewNamedVotes/);
  assert.match(workflowSource, /state\.votes\?\.\[name\]/);
  assert.match(workflowSource, /FulianVoteResultImage\.download/);
  assert.match(archiveHtml, /id="downloadVoteResult"/);
  assert.match(archiveHtml, /具名票向（僅副主席可查閱）/);
});

test("後端只向副主席與 Admin 回傳完整逐人票向", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  assert.match(edge, /const visibleVotes = leadershipRole\s*\? fullVotes/);
  assert.match(edge, /\{ \[String\(viewerName \|\| ""\)\.trim\(\)\]: viewerVote \}/);
  assert.match(edge, /votedVoters: recusedApplicant \? \[\] : votedVoters/);
  assert.match(edge, /voteTally: recusedApplicant/);
});
