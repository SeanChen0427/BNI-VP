(function () {
  const domain = window.FulianCaseDomain;
  const WORKFLOW_PREFIX = "fulian-case-workflow-v2-";
  const DRAFT_PREFIXES = Object.values(domain.DRAFT_PREFIX_BY_TYPE || {
    renewal: "fulian-terminal-counseling-draft-v3",
    new: "fulian-new-member-interview-v2",
    midterm: "fulian-midterm-counseling-draft-v2",
    industry: "fulian-industry-change-interview-v2",
    departure: "fulian-departure-interview-v2",
  });
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeGetItem = Storage.prototype.getItem;
  const revisions = new Map();
  let applyingServerState = false;
  let queue = Promise.resolve();
  let pendingWrites = 0;
  let lastEditingAt = 0;
  let refreshPromise = null;
  let syncFailed = false;
  let conflictBlocked = false;
  const failedSaves = new Map();

  function parse(value) {
    try {
      const result = JSON.parse(value || "{}");
      return result && typeof result === "object" && !Array.isArray(result) ? result : {};
    } catch {
      return {};
    }
  }

  function infoForKey(key) {
    if (key.startsWith(WORKFLOW_PREFIX)) {
      return { taskId: key.slice(WORKFLOW_PREFIX.length), kind: "workflow" };
    }
    const task = window.FulianTaskStore.all().find(item => domain.draftStorageKey(item) === key);
    return task ? { taskId: task.id, kind: "draft" } : null;
  }

  function isCaseKey(key) {
    return key.startsWith(WORKFLOW_PREFIX)
      || DRAFT_PREFIXES.some(prefix => key.startsWith(`${prefix}-`));
  }

  function showError(message) {
    let node = document.getElementById("caseSyncAlert");
    if (!node) {
      node = document.createElement("div");
      node.id = "caseSyncAlert";
      node.setAttribute("role", "alert");
      Object.assign(node.style, {
        position: "fixed", left: "16px", right: "16px", bottom: "76px", zIndex: "99999",
        padding: "12px 16px", borderRadius: "10px", color: "#fff", background: "#9f2d20",
        boxShadow: "0 8px 30px #0004", fontWeight: "700",
      });
      document.body.append(node);
    }
    node.textContent = `案件資料同步失敗：${message}。本機草稿仍保留，請重新整理後再試。`;
  }

  function showExternalUpdate() {
    let node = document.getElementById("caseExternalUpdateAlert");
    if (node) return;
    node = document.createElement("div");
    node.id = "caseExternalUpdateAlert";
    node.setAttribute("role", "alert");
    Object.assign(node.style, {
      position: "fixed", left: "16px", right: "16px", bottom: "76px", zIndex: "100000",
      padding: "12px 16px", borderRadius: "10px", color: "#fff", background: "#7a4b00",
      boxShadow: "0 8px 30px #0004", fontWeight: "700",
    });
    const message = document.createElement("span");
    message.textContent = "這份訪談已由另一個裝置更新。系統已停止覆寫，請先確認畫面內容，再載入最新版本。";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "載入最新版本";
    Object.assign(button.style, {
      marginLeft: "12px", padding: "6px 10px", border: "0", borderRadius: "7px", cursor: "pointer",
    });
    button.addEventListener("click", () => location.reload());
    node.append(message, button);
    document.body.append(node);
  }

  function applyState(state, { detectDraftConflict = false } = {}) {
    const task = window.FulianTaskStore.all().find(item => item.id === state.taskId);
    const activeTaskId = typeof URLSearchParams === "function"
      ? new URLSearchParams(location.search).get("task")
      : null;
    const knownRevision = revisions.get(state.taskId);
    if (
      detectDraftConflict
      && task
      && activeTaskId === state.taskId
      && state.draft !== null
      && knownRevision !== undefined
      && Number(state.revision || 0) > knownRevision
    ) {
      const localDraft = parse(nativeGetItem.call(localStorage, domain.draftStorageKey(task)));
      if (JSON.stringify(localDraft) !== JSON.stringify(state.draft || {})) {
        showExternalUpdate();
        window.dispatchEvent(new CustomEvent("fulian:case-external-update", { detail: { taskId: state.taskId } }));
        return false;
      }
    }
    applyingServerState = true;
    nativeSetItem.call(localStorage, domain.workflowStorageKey(state.taskId), JSON.stringify(state.workflow || {}));
    if (task && state.draft !== null) {
      const draftKey = domain.draftStorageKey(task);
      if (draftKey) nativeSetItem.call(localStorage, draftKey, JSON.stringify(state.draft || {}));
    }
    applyingServerState = false;
    revisions.set(state.taskId, Number(state.revision || 0));
    document.getElementById("caseSyncAlert")?.remove();
    window.dispatchEvent(new CustomEvent("fulian:data-changed", { detail: { source: "supabase-case-state", taskId: state.taskId } }));
    return true;
  }

  async function save(info, value) {
    const response = await fetch("/api/case-states", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: info.taskId,
        kind: info.kind,
        value,
        revision: revisions.get(info.taskId) || 0,
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `案件同步失敗：HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    syncFailed = false;
    applyState(data);
    return data;
  }

  function queueSave(key, value) {
    const info = infoForKey(key);
    if (!info) return queue;
    failedSaves.set(key, { info, value });
    queue = queue.catch(() => undefined).then(async () => {
      pendingWrites += 1;
      try {
        const result = await save(info, parse(value));
        if (failedSaves.get(key)?.value === value) failedSaves.delete(key);
        return result;
      }
      finally { pendingWrites -= 1; }
    });
    queue.catch(error => {
      syncFailed = true;
      if (error.status === 409) {
        conflictBlocked = true;
        showExternalUpdate();
      }
      console.error("Supabase case state sync failed", error);
      showError(error.message);
      window.dispatchEvent(new CustomEvent("fulian:case-sync-error", { detail: { message: error.message } }));
    });
    return queue;
  }

  async function retryFailed() {
    const entries = [...failedSaves.entries()];
    if (!entries.length) return [];
    pendingWrites += 1;
    try {
      const saved = [];
      for (const [key, pending] of entries) {
        saved.push(await save(pending.info, parse(pending.value)));
        if (failedSaves.get(key)?.value === pending.value) failedSaves.delete(key);
      }
      syncFailed = failedSaves.size > 0;
      if (!syncFailed) queue = Promise.resolve(saved.at(-1));
      return saved;
    } catch (error) {
      syncFailed = true;
      showError(error.message);
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  }

  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || !isCaseKey(key) || applyingServerState) {
      return nativeSetItem.call(this, key, value);
    }
    const result = nativeSetItem.call(this, key, value);
    queueSave(key, value);
    return result;
  };

  Storage.prototype.removeItem = function (key) {
    if (this !== localStorage || !isCaseKey(key) || applyingServerState) {
      return nativeRemoveItem.call(this, key);
    }
    const result = nativeRemoveItem.call(this, key);
    queueSave(key, "{}");
    return result;
  };

  async function postAction(taskId, kind, value, extra = {}) {
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    pendingWrites += 1;
    try {
      await queue.catch(() => undefined);
      const response = await fetch("/api/case-states", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId,
          kind,
          value,
          revision: revisions.get(taskId) || 0,
          ...extra,
        }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || `案件操作失敗：HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      syncFailed = false;
      applyState(data);
      return data;
    } finally {
      pendingWrites -= 1;
    }
  }

  async function initialize({ migrate = true } = {}) {
    await window.FulianTaskStore.ready;
    const localByTask = new Map(window.FulianTaskStore.all().map(task => [task.id, {
      workflow: parse(nativeGetItem.call(localStorage, domain.workflowStorageKey(task.id))),
      draft: parse(nativeGetItem.call(localStorage, domain.draftStorageKey(task))),
    }]));
    const response = await fetch("/api/case-states", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.states)) {
      throw new Error(data.message || `案件資料載入失敗：HTTP ${response.status}`);
    }
    if (!migrate && (pendingWrites || Date.now() - lastEditingAt < 1500)) return [];
    const serverIds = new Set();
    for (const state of data.states) {
      serverIds.add(state.taskId);
      const local = localByTask.get(state.taskId);
      const serverEmpty = Number(state.revision || 0) === 0;
      applyState(state, { detectDraftConflict: !migrate });
      if (migrate && serverEmpty && local) {
        if (Object.keys(local.workflow).length) await save({ taskId: state.taskId, kind: "workflow" }, local.workflow);
        if (state.draft !== null && Object.keys(local.draft).length) {
          await save({ taskId: state.taskId, kind: "draft" }, local.draft);
        }
      }
    }
    syncFailed = false;
    return data.states;
  }

  async function refresh() {
    if (conflictBlocked || pendingWrites || Date.now() - lastEditingAt < 1500) return [];
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      if (failedSaves.size) return retryFailed();
      await window.FulianTaskStore.refresh().catch(() => undefined);
      return initialize({ migrate: false });
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
  }

  async function reconcileDraft(task, binding) {
    const key = domain.draftStorageKey(task);
    if (!key || !binding || typeof binding !== "object") return false;
    const current = parse(nativeGetItem.call(localStorage, key));
    if (!Object.keys(current).length) return false;
    const next = { ...current, ...binding };
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    localStorage.setItem(key, JSON.stringify(next));
    await queue;
    return true;
  }

  function taskStateKeys(task) {
    return [
      domain.workflowStorageKey(task.id),
      domain.draftStorageKey(task),
    ].filter(Boolean);
  }

  async function beforeTaskDelete(task) {
    if (!task?.id) return;
    try {
      await queue;
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
    taskStateKeys(task).forEach(key => failedSaves.delete(key));
  }

  function discardDeletedTask(task) {
    if (!task?.id) return;
    applyingServerState = true;
    try {
      taskStateKeys(task).forEach(key => nativeRemoveItem.call(localStorage, key));
    } finally {
      applyingServerState = false;
    }
    revisions.delete(task.id);
    taskStateKeys(task).forEach(key => failedSaves.delete(key));
    if (!failedSaves.size) {
      syncFailed = false;
      document.getElementById("caseSyncAlert")?.remove();
    }
  }

  const ready = initialize({ migrate: true }).catch(error => {
    console.error("Supabase case state bootstrap failed", error);
    showError(error.message);
    return [];
  });

  window.FulianCaseStateStore = {
    ready,
    flush: () => queue,
    refresh,
    reconcileDraft,
    beforeTaskDelete,
    discardDeletedTask,
    saveFeedback: (taskId, value, authorName = "") => postAction(
      taskId,
      "feedback",
      value,
      authorName ? { authorName } : {},
    ),
    saveVote: (taskId, value) => postAction(taskId, "vote", value),
    openVote: (taskId, workflow) => postAction(taskId, "open-vote", workflow),
    sendFeedbackNotice: taskId => postAction(taskId, "feedback-notice", {}),
    prepareFeedbackCall: (taskId, feedbackEnvironment = "production") => postAction(
      taskId,
      "feedback-call-prepare",
      {},
      { feedbackEnvironment },
    ),
    prepareVoteCall: (taskId, voteEnvironment = "production") => postAction(
      taskId,
      "vote-call-prepare",
      {},
      { voteEnvironment },
    ),
    saveLeadersStep: (taskId, method = "manual") => postAction(
      taskId,
      "leaders-sent",
      { method },
    ),
    saveAdvisorConfirmation: (taskId, status, note = "") => postAction(
      taskId,
      "advisor-confirmation",
      { status, note },
    ),
    recordResultAnnouncementCopy: taskId => postAction(
      taskId,
      "result-announcement-copy",
      {},
    ),
    sendResultAnnouncement: taskId => postAction(taskId, "result-announcement", {}),
    saveWorkflow: (taskId, workflow) => postAction(taskId, "workflow", workflow),
    reset: (taskId) => postAction(taskId, "reset", {}),
  };

  document.addEventListener?.("input", event => {
    if (event.target?.closest?.("[data-save], #myFeedback, #advisorStatus, #advisorNote")) lastEditingAt = Date.now();
  });
  window.addEventListener?.("focus", () => refresh().catch(() => undefined));
  document.addEventListener?.("visibilitychange", () => {
    if (!document.hidden) refresh().catch(() => undefined);
  });
  window.addEventListener?.("storage", event => {
    if (event.storageArea === localStorage && isCaseKey(event.key || "")) refresh().catch(() => undefined);
  });
  if (typeof setInterval === "function") {
    setInterval(() => {
      if (!document.hidden) refresh().catch(() => undefined);
    }, 30000);
  }
})();
