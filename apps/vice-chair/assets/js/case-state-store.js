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

  function applyState(state) {
    const task = window.FulianTaskStore.all().find(item => item.id === state.taskId);
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
    if (!response.ok) throw new Error(data.message || `案件同步失敗：HTTP ${response.status}`);
    syncFailed = false;
    applyState(data);
    return data;
  }

  function queueSave(key, value) {
    const info = infoForKey(key);
    if (!info) return queue;
    queue = queue.catch(() => undefined).then(async () => {
      pendingWrites += 1;
      try { return await save(info, parse(value)); }
      finally { pendingWrites -= 1; }
    });
    queue.catch(error => {
      syncFailed = true;
      console.error("Supabase case state sync failed", error);
      showError(error.message);
      window.dispatchEvent(new CustomEvent("fulian:case-sync-error", { detail: { message: error.message } }));
    });
    return queue;
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

  async function postAction(taskId, kind, value) {
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
        }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `案件操作失敗：HTTP ${response.status}`);
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
      applyState(state);
      if (migrate && serverEmpty && local) {
        if (Object.keys(local.workflow).length) await save({ taskId: state.taskId, kind: "workflow" }, local.workflow);
        if (state.draft !== null && Object.keys(local.draft).length) {
          await save({ taskId: state.taskId, kind: "draft" }, local.draft);
        }
      }
    }
    return data.states;
  }

  async function refresh() {
    if (syncFailed || pendingWrites || Date.now() - lastEditingAt < 1500) return [];
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      await window.FulianTaskStore.refresh().catch(() => undefined);
      return initialize({ migrate: false });
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
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
    saveFeedback: (taskId, value) => postAction(taskId, "feedback", value),
    saveVote: (taskId, value) => postAction(taskId, "vote", value),
    openVote: (taskId, workflow) => postAction(taskId, "open-vote", workflow),
    reset: (taskId) => postAction(taskId, "reset", {}),
  };

  document.addEventListener?.("input", event => {
    if (event.target?.closest?.("[data-save], #myFeedback")) lastEditingAt = Date.now();
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
