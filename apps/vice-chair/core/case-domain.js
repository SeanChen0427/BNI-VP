(function exposeCaseDomain(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FulianCaseDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createCaseDomain() {
  const TASK_STORAGE_KEY = "fulian-work-plan-v1";

  const DRAFT_PREFIX_BY_TYPE = Object.freeze({
    renewal: "fulian-terminal-counseling-draft-v3",
    new: "fulian-new-member-interview-v2",
    midterm: "fulian-midterm-counseling-draft-v2",
    industry: "fulian-industry-change-interview-v2",
    departure: "fulian-departure-interview-v2",
  });

  const STAGES = Object.freeze({
    WAITING: "waiting",
    INTERVIEW: "interview",
    FEEDBACK: "feedback",
    VOTE: "vote",
    ADVISOR: "advisor",
    CLOSED: "closed",
  });

  const DECISION_WORKFLOW_TYPES = Object.freeze([
    "renewal",
    "new",
    "industry",
  ]);

  let taskIdSequence = 0;

  function createTaskId(existingTasks = [], options = {}) {
    const existingIds = new Set(
      (Array.isArray(existingTasks) ? existingTasks : [])
        .map((item) => (typeof item === "string" ? item : item?.id))
        .filter(Boolean)
    );
    const nowValue =
      typeof options.now === "function"
        ? options.now()
        : options.now ?? Date.now();
    const timestamp = Math.trunc(Number(nowValue));
    const cryptoApi =
      options.cryptoApi ??
      (typeof globalThis !== "undefined" ? globalThis.crypto : null);
    const randomUuid =
      typeof options.randomUUID === "function"
        ? options.randomUUID
        : typeof cryptoApi?.randomUUID === "function"
          ? () => cryptoApi.randomUUID()
          : null;
    const random =
      typeof options.random === "function" ? options.random : Math.random;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      taskIdSequence += 1;
      let entropy = "";
      try {
        entropy = randomUuid
          ? String(randomUuid()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)
          : "";
      } catch {}
      if (!entropy) {
        entropy = Math.floor(Math.abs(random()) * Number.MAX_SAFE_INTEGER)
          .toString(36)
          .padStart(10, "0");
      }
      const id = `task-${Number.isFinite(timestamp) ? timestamp : Date.now()}-${entropy}-${taskIdSequence.toString(36)}`;
      if (!existingIds.has(id)) return id;
    }

    throw new Error("無法建立唯一案件編號");
  }

  function workflowStorageKey(caseId) {
    return `fulian-case-workflow-v2-${caseId}`;
  }

  function draftStorageKey(task) {
    const prefix = DRAFT_PREFIX_BY_TYPE[task?.type];
    return prefix && task?.id ? `${prefix}-${task.id}` : "";
  }

  function parseJson(value, fallback = null) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function readWorkflow(storage, caseId) {
    return parseJson(storage.getItem(workflowStorageKey(caseId)), null);
  }

  function readDraft(storage, task) {
    const key = draftStorageKey(task);
    return key ? parseJson(storage.getItem(key), null) : null;
  }

  function hasFeedback(state) {
    return Object.values(state?.feedback || {}).some((value) =>
      String(value || "").trim()
    );
  }

  function feedbackCount(state) {
    return Object.values(state?.feedback || {}).filter((value) =>
      String(value || "").trim()
    ).length;
  }

  function voteCount(state) {
    const tallyTotal = Number(state?.voteTally?.total);
    return Number.isInteger(tallyTotal) && tallyTotal >= 0
      ? tallyTotal
      : Object.keys(state?.votes || {}).length;
  }

  function voteSummary(state, baseFallback = 0) {
    const snapshot = Array.isArray(state?.voterSnapshot)
      ? state.voterSnapshot
      : [];
    const snapshotSet = new Set(snapshot);
    const entries = Object.entries(state?.votes || {}).filter(([name]) =>
      !snapshot.length || snapshotSet.has(name)
    );
    const tally = state?.voteTally;
    const tallyApprove = Number(tally?.approve);
    const tallyReject = Number(tally?.reject);
    const approve = Number.isInteger(tallyApprove) && tallyApprove >= 0
      ? tallyApprove
      : entries.filter(([, choice]) => choice === "approve").length;
    const reject = Number.isInteger(tallyReject) && tallyReject >= 0
      ? tallyReject
      : entries.filter(([, choice]) => choice === "reject").length;
    const countedTotal = approve + reject;
    const tallyTotal = Number(tally?.total);
    const total = Number.isInteger(tallyTotal) && tallyTotal >= countedTotal
      ? tallyTotal
      : countedTotal;
    const base = snapshot.length || Math.max(Number(baseFallback) || 0, total);
    const quorum = majorityThreshold(base);
    const status = total < quorum
      ? "waiting"
      : approve === reject
        ? "tie"
        : approve > reject
          ? "pass"
          : "reject";
    return {
      status,
      base,
      quorum,
      total,
      approve,
      reject,
      unvoted: Math.max(base - total, 0),
    };
  }

  function voteAccessReady(state) {
    return Boolean(
      state?.voteCallStatus === "replied"
      || state?.voteNoticeSent
      || state?.voteNoticeCopiedAt
    );
  }

  function assignedMembers(task) {
    return [task?.lead, ...(task?.companions || [])].filter(Boolean);
  }

  function sameTaskIdentity(left, right) {
    return Boolean(left && right)
      && String(left.type || "").trim() === String(right.type || right.taskType || "").trim()
      && String(left.member || "").trim() === String(right.member || "").trim();
  }

  function linkedCareTask(tasks, item, { includeCompleted = false } = {}) {
    const list = Array.isArray(tasks) ? tasks : [];
    const reference = String(item?.taskId || "").trim();
    const linked = reference
      ? list.find(task => task?.id === reference)
      : null;
    if (
      linked
      && sameTaskIdentity(linked, item)
      && (includeCompleted || !linked.completed)
    ) {
      return linked;
    }
    return list.find(task =>
      sameTaskIdentity(task, item)
      && (includeCompleted || !task.completed)
    ) || null;
  }

  function isAssignedTo(task, userName) {
    const normalizedName = String(userName || "").trim();
    return Boolean(normalizedName) && assignedMembers(task).includes(normalizedName);
  }

  function feedbackParticipation(task, state, userName, committee = []) {
    const normalizedName = String(userName || "").trim();
    const isCommitteeMember =
      Boolean(normalizedName) && committee.includes(normalizedName);
    const eligible =
      isCommitteeMember &&
      eligibleMembers(committee, task?.member).includes(normalizedName);
    const submitted = Boolean(
      String(state?.feedback?.[normalizedName] || "").trim()
    );
    return {
      eligible,
      submitted,
      status: !isCommitteeMember
        ? "not-eligible"
        : !eligible
          ? "recused"
          : submitted
            ? "submitted"
            : "pending",
    };
  }

  function requiresInterviewForm(task) {
    return Object.prototype.hasOwnProperty.call(
      DRAFT_PREFIX_BY_TYPE,
      task?.type
    );
  }

  function requiresDecisionWorkflow(task) {
    return DECISION_WORKFLOW_TYPES.includes(task?.type);
  }

  function canDirectComplete(task) {
    return task?.type === "special";
  }

  function isClosed(task, state) {
    return Boolean(
      state?.closed ||
      (requiresInterviewForm(task) &&
        !requiresDecisionWorkflow(task) &&
        state?.wordSaved) ||
      (task?.completed && !requiresDecisionWorkflow(task))
    );
  }

  function stageOf(task, state, draftExists = false) {
    if (isClosed(task, state)) return STAGES.CLOSED;
    if (
      state?.leadersSent ||
      state?.advisorStatus === "confirmed" ||
      state?.advisorStatus === "returned"
    ) {
      return STAGES.ADVISOR;
    }
    if (state?.votingOpen || voteAccessReady(state)) return STAGES.VOTE;
    if (state?.wordSaved || state?.feedbackNotified || hasFeedback(state)) {
      return STAGES.FEEDBACK;
    }
    return draftExists ? STAGES.INTERVIEW : STAGES.WAITING;
  }

  function pendingActions(
    task,
    state,
    { userName = "", committee = [], draftExists = false } = {}
  ) {
    const normalizedName = String(userName || "").trim();
    if (!normalizedName || isClosed(task, state)) return [];

    const actions = [];
    const stage = stageOf(task, state, draftExists);
    const feedback = feedbackParticipation(
      task,
      state,
      normalizedName,
      committee
    );

    if (
      isAssignedTo(task, normalizedName) &&
      (stage === STAGES.WAITING || stage === STAGES.INTERVIEW)
    ) {
      actions.push("assigned");
    }

    if (
      requiresDecisionWorkflow(task) &&
      (state?.wordSaved || state?.feedbackNotified || hasFeedback(state)) &&
      feedback.eligible &&
      !feedback.submitted
    ) {
      actions.push("feedback");
    }

    const voterSnapshot = Array.isArray(state?.voterSnapshot)
      ? state.voterSnapshot
      : [];
    if (
      requiresDecisionWorkflow(task) &&
      state?.votingOpen &&
      voteAccessReady(state) &&
      voterSnapshot.includes(normalizedName) &&
      !Object.prototype.hasOwnProperty.call(state?.votes || {}, normalizedName)
    ) {
      actions.push("vote");
    }

    return actions;
  }

  function stageSnapshot(storage, task) {
    const state = readWorkflow(storage, task.id);
    const draft = readDraft(storage, task);
    return {
      state,
      draft,
      stage: stageOf(task, state, Boolean(draft)),
      feedbackCount: feedbackCount(state),
      voteCount: voteCount(state),
    };
  }

  function recusedApplicant(committee, applicant) {
    const normalizedApplicant = String(applicant || "").trim();
    return committee.includes(normalizedApplicant) ? normalizedApplicant : "";
  }

  function eligibleMembers(committee, applicant) {
    const recused = recusedApplicant(committee, applicant);
    return committee.filter((name) => name !== recused);
  }

  function majorityThreshold(base) {
    return Math.floor(Math.max(Number(base) || 0, 0) / 2) + 1;
  }

  function taipeiTimestamp(value) {
    if (value instanceof Date || typeof value === "number") return new Date(value).getTime();
    const raw = String(value || "").trim();
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)
      ? `${raw}+08:00`
      : raw;
    return new Date(normalized).getTime();
  }

  function voteDeadlineStatus(value, nowValue = Date.now()) {
    if (!value) {
      return { valid: false, expired: false, timestamp: null };
    }
    const timestamp = taipeiTimestamp(value);
    if (!Number.isFinite(timestamp)) {
      return { valid: false, expired: false, timestamp: null };
    }
    const now = taipeiTimestamp(nowValue);
    return {
      valid: true,
      expired: Number.isFinite(now) ? timestamp <= now : false,
      timestamp,
    };
  }

  function annualRenewalMetrics(member) {
    const metrics = member?.annualMetrics;
    const education = Number(metrics?.education);
    const visitors = Number(metrics?.visitors);
    if (!Number.isFinite(education) || !Number.isFinite(visitors)) return null;
    return { education, visitors };
  }

  return Object.freeze({
    TASK_STORAGE_KEY,
    DRAFT_PREFIX_BY_TYPE,
    DECISION_WORKFLOW_TYPES,
    STAGES,
    createTaskId,
    workflowStorageKey,
    draftStorageKey,
    parseJson,
    readWorkflow,
    readDraft,
    hasFeedback,
    feedbackCount,
    voteCount,
    voteSummary,
    voteAccessReady,
    assignedMembers,
    sameTaskIdentity,
    linkedCareTask,
    isAssignedTo,
    feedbackParticipation,
    requiresInterviewForm,
    requiresDecisionWorkflow,
    canDirectComplete,
    isClosed,
    pendingActions,
    stageOf,
    stageSnapshot,
    recusedApplicant,
    eligibleMembers,
    majorityThreshold,
    voteDeadlineStatus,
    annualRenewalMetrics,
  });
});
