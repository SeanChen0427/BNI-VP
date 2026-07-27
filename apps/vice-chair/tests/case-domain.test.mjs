import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const domain = require("../core/case-domain.js");

const task = { id: "case-1", type: "renewal", completed: false };

assert.equal(domain.workflowStorageKey("case-1"), "fulian-case-workflow-v2-case-1");
assert.equal(
  domain.draftStorageKey(task),
  "fulian-terminal-counseling-draft-v3-case-1"
);
assert.equal(domain.stageOf(task, null, false), domain.STAGES.WAITING);
assert.equal(domain.stageOf(task, null, true), domain.STAGES.INTERVIEW);
assert.equal(
  domain.stageOf(task, { feedbackNotified: true }, false),
  domain.STAGES.FEEDBACK
);
assert.equal(
  domain.stageOf({ ...task, type: "new" }, { wordSaved: true }, false),
  domain.STAGES.FEEDBACK
);
assert.equal(
  domain.stageOf({ ...task, type: "industry" }, { wordSaved: true }, false),
  domain.STAGES.FEEDBACK
);
assert.equal(
  domain.stageOf(task, { votingOpen: true }, false),
  domain.STAGES.VOTE
);
assert.equal(
  domain.stageOf(task, { leadersSent: true }, false),
  domain.STAGES.ADVISOR
);
assert.equal(
  domain.stageOf({ ...task, completed: true }, null, false),
  domain.STAGES.WAITING
);
assert.equal(domain.requiresInterviewForm(task), true);
assert.equal(domain.requiresDecisionWorkflow(task), true);
assert.equal(domain.requiresDecisionWorkflow({ type: "new" }), true);
assert.equal(domain.requiresDecisionWorkflow({ type: "industry" }), true);
assert.equal(domain.requiresDecisionWorkflow({ type: "midterm" }), false);
assert.equal(domain.requiresDecisionWorkflow({ type: "departure" }), false);
assert.equal(domain.canDirectComplete(task), false);
assert.equal(domain.isClosed({ ...task, completed: true }, null), false);
assert.equal(
  domain.stageOf({ ...task, completed: true }, { closed: true }, false),
  domain.STAGES.CLOSED
);
assert.equal(
  domain.stageOf(
    { ...task, type: "midterm" },
    { wordSaved: true },
    false
  ),
  domain.STAGES.CLOSED
);
assert.equal(
  domain.stageOf(
    { ...task, type: "departure" },
    { wordSaved: true },
    false
  ),
  domain.STAGES.CLOSED
);

const generalCareTask = {
  id: "care-1",
  type: "special",
  completed: true,
};
assert.equal(domain.requiresInterviewForm(generalCareTask), false);
assert.equal(domain.canDirectComplete(generalCareTask), true);
assert.equal(domain.isClosed(generalCareTask, null), true);
assert.equal(
  domain.stageOf(generalCareTask, null, false),
  domain.STAGES.CLOSED
);

const committee = ["副主席甲", "委員乙", "委員丙"];
assert.deepEqual(domain.eligibleMembers(committee, "一般會員"), committee);
assert.deepEqual(domain.eligibleMembers(committee, "委員乙"), [
  "副主席甲",
  "委員丙",
]);
assert.equal(domain.majorityThreshold(7), 4);
assert.equal(domain.majorityThreshold(6), 4);
assert.deepEqual(domain.voteDeadlineStatus("", 0), {
  valid: false,
  expired: false,
  timestamp: null,
});
assert.equal(
  domain.voteDeadlineStatus("2026-07-20T18:00", "2026-07-20T17:59").expired,
  false
);
assert.equal(
  domain.voteDeadlineStatus("2026-07-20T18:00", "2026-07-20T18:00").expired,
  true
);
assert.deepEqual(
  domain.annualRenewalMetrics({
    annualMetrics: { education: 21, visitors: 7 },
  }),
  { education: 21, visitors: 7 }
);
assert.equal(domain.annualRenewalMetrics({ metrics: { education: 12 } }), null);
assert.deepEqual(
  domain.feedbackParticipation(
    { member: "一般會員" },
    { feedback: { "委員乙": "已完成回饋" } },
    "委員乙",
    committee
  ),
  { eligible: true, submitted: true, status: "submitted" }
);
assert.deepEqual(
  domain.feedbackParticipation(
    { member: "一般會員" },
    { feedback: {} },
    "委員乙",
    committee
  ),
  { eligible: true, submitted: false, status: "pending" }
);
assert.deepEqual(
  domain.feedbackParticipation(
    { member: "委員乙" },
    { feedback: {} },
    "委員乙",
    committee
  ),
  { eligible: false, submitted: false, status: "recused" }
);

const generatedTasks = [];
for (let index = 0; index < 20; index += 1) {
  generatedTasks.push({
    id: domain.createTaskId(generatedTasks, {
      now: () => 1784300000000,
      randomUUID: () => "fixed-random-value",
    }),
  });
}
assert.equal(new Set(generatedTasks.map(item => item.id)).size, 20);
assert.ok(
  generatedTasks.every(item =>
    item.id.startsWith("task-1784300000000-fixedrandomvalue-")
  )
);

const assignedTask = {
  id: "task-1",
  type: "renewal",
  member: "申請者",
  lead: "測試委員甲",
  companions: ["測試委員乙"],
  completed: false,
};
const activeCommittee = ["測試副主席", "測試委員甲", "測試委員乙"];

assert.deepEqual(
  domain.pendingActions(assignedTask, {}, {
    userName: "測試委員甲",
    committee: activeCommittee,
  }),
  ["assigned"]
);
assert.deepEqual(
  domain.pendingActions(assignedTask, {
    wordSaved: true,
    feedback: {},
  }, {
    userName: "測試委員甲",
    committee: activeCommittee,
  }),
  ["feedback"]
);
assert.deepEqual(
  domain.pendingActions(assignedTask, {
    wordSaved: true,
    feedback: {"測試委員甲": "已完成回饋"},
    votingOpen: true,
    voteNoticeSent: true,
    voterSnapshot: activeCommittee,
    votes: {},
  }, {
    userName: "測試委員甲",
    committee: activeCommittee,
  }),
  ["vote"]
);
assert.deepEqual(
  domain.pendingActions(assignedTask, {
    wordSaved: true,
    feedback: {},
    votingOpen: true,
    voteNoticeSent: true,
    voterSnapshot: activeCommittee,
    votes: {},
  }, {
    userName: "測試委員甲",
    committee: activeCommittee,
  }),
  ["feedback", "vote"]
);
assert.deepEqual(
  domain.pendingActions({...assignedTask, member: "測試委員甲"}, {
    wordSaved: true,
    feedback: {},
    votingOpen: true,
    voteNoticeSent: true,
    voterSnapshot: ["測試副主席", "測試委員乙"],
    votes: {},
  }, {
    userName: "測試委員甲",
    committee: activeCommittee,
  }),
  []
);
assert.deepEqual(
  domain.pendingActions(
    { ...assignedTask, type: "midterm" },
    { wordSaved: true, feedback: {} },
    { userName: "測試委員甲", committee: activeCommittee }
  ),
  []
);

const linkedTasks = [
  { id: "wrong-id", type: "midterm", member: "會員乙", completed: false },
  { id: "right-id", type: "midterm", member: "會員甲", completed: false },
];
assert.equal(
  domain.sameTaskIdentity(linkedTasks[1], { taskType: "midterm", member: "會員甲" }),
  true
);
assert.equal(
  domain.sameTaskIdentity(linkedTasks[0], { taskType: "midterm", member: "會員甲" }),
  false
);
assert.equal(
  domain.linkedCareTask(linkedTasks, {
    taskId: "wrong-id",
    taskType: "midterm",
    member: "會員甲",
  })?.id,
  "right-id",
  "錯誤 taskId 不得蓋過會員與類型的一致性核對"
);

console.log("case-domain tests passed");
