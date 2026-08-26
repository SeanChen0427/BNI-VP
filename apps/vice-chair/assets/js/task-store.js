(function () {
  const KEY = window.FulianCaseDomain.TASK_STORAGE_KEY;
  const MIGRATION_KEY = "fulian-task-supabase-migration-v2";
  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  let applyingServerState = false;
  let queue = Promise.resolve();
  let pendingWrites = 0;
  let lastLocalWrite = 0;
  let refreshPromise = null;
  let syncFailed = false;
  let conflictBlocked = false;
  const retryTasks = new Map();

  function parse(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function cached() {
    return parse(nativeGetItem.call(localStorage, KEY));
  }

  function showError(message) {
    let node = document.getElementById("taskSyncAlert");
    if (!node) {
      node = document.createElement("div");
      node.id = "taskSyncAlert";
      node.setAttribute("role", "alert");
      Object.assign(node.style, {
        position: "fixed", left: "16px", right: "16px", bottom: "16px", zIndex: "99999",
        padding: "12px 16px", borderRadius: "10px", color: "#fff", background: "#9f2d20",
        boxShadow: "0 8px 30px #0004", fontWeight: "700",
      });
      document.body.append(node);
    }
    node.textContent = `Supabase 同步失敗：${message}。本機內容暫時保留，請勿重複操作並重新整理。`;
  }

  function clearError() {
    document.getElementById("taskSyncAlert")?.remove();
  }

  function replaceCache(tasks) {
    if (!Array.isArray(tasks)) throw new Error("伺服器沒有回傳有效的排程資料");
    applyingServerState = true;
    nativeSetItem.call(localStorage, KEY, JSON.stringify(tasks));
    applyingServerState = false;
    clearError();
    window.dispatchEvent(new CustomEvent("fulian:data-changed", { detail: { source: "supabase-tasks" } }));
  }

  async function api(body) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `排程同步失敗：HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    replaceCache(data.tasks);
    return data.tasks;
  }

  function changedTasks(before, after) {
    const previous = new Map(before.map(task => [task.id, JSON.stringify(task)]));
    return after.filter(task => !task.id || previous.get(task.id) !== JSON.stringify(task));
  }

  function queueUpsert(before, after) {
    const changed = changedTasks(before, after);
    if (!changed.length) return queue;
    changed.forEach(task => retryTasks.set(task.id, task));
    queue = queue.catch(() => undefined).then(async () => {
      pendingWrites += 1;
      try {
        const batch = [...retryTasks.values()];
        const tasks = await api({ action: "upsert", tasks: batch });
        batch.forEach(task => {
          if (retryTasks.get(task.id) === task) retryTasks.delete(task.id);
        });
        syncFailed = retryTasks.size > 0;
        return tasks;
      }
      finally { pendingWrites -= 1; }
    });
    queue.catch(error => {
      syncFailed = true;
      if (error.status === 409) conflictBlocked = true;
      console.error("Supabase task sync failed", error);
      showError(error.message);
      window.dispatchEvent(new CustomEvent("fulian:task-sync-error", { detail: { message: error.message } }));
    });
    return queue;
  }

  async function retryPending() {
    if (!retryTasks.size) return cached();
    const batch = [...retryTasks.values()];
    pendingWrites += 1;
    try {
      const tasks = await api({ action: "upsert", tasks: batch });
      batch.forEach(task => {
        if (retryTasks.get(task.id) === task) retryTasks.delete(task.id);
      });
      syncFailed = retryTasks.size > 0;
      if (!syncFailed) queue = Promise.resolve(tasks);
      return tasks;
    } catch (error) {
      syncFailed = true;
      showError(error.message);
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  }

  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || key !== KEY || applyingServerState) {
      return nativeSetItem.call(this, key, value);
    }
    const before = cached();
    const result = nativeSetItem.call(this, key, value);
    lastLocalWrite = Date.now();
    queueUpsert(before, parse(value));
    return result;
  };

  async function fetchAll() {
    const response = await fetch("/api/tasks", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `排程載入失敗：HTTP ${response.status}`);
    if (!Array.isArray(data.tasks)) throw new Error("排程載入回應格式不正確");
    return data.tasks;
  }

  async function initialize() {
    const localTasks = cached();
    let serverTasks = await fetchAll();
    const session = FulianAuth.getSession();
    const canManage = ["admin", "vp"].includes(session?.role);
    if (canManage && !nativeGetItem.call(localStorage, MIGRATION_KEY) && localTasks.length) {
      const serverIds = new Set(serverTasks.map(task => task.id));
      const missing = localTasks.filter(task => task.id && !serverIds.has(task.id));
      if (missing.length) serverTasks = await api({ action: "import", tasks: missing });
      nativeSetItem.call(localStorage, MIGRATION_KEY, new Date().toISOString());
    }
    replaceCache(serverTasks);
    return serverTasks;
  }

  const ready = initialize().catch(error => {
    syncFailed = true;
    console.error("Supabase task bootstrap failed", error);
    showError(error.message);
    window.dispatchEvent(new CustomEvent("fulian:task-sync-error", { detail: { message: error.message } }));
    return cached();
  });

  window.FulianTaskStore = {
    ready,
    all: cached,
    refresh: async function () {
      if (conflictBlocked || pendingWrites || Date.now() - lastLocalWrite < 1500) return cached();
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        if (retryTasks.size) return retryPending();
        const tasks = await fetchAll();
        if (pendingWrites || Date.now() - lastLocalWrite < 1500) return cached();
        syncFailed = false;
        replaceCache(tasks);
        return tasks;
      })();
      try { return await refreshPromise; }
      finally { refreshPromise = null; }
    },
    remove: async function (id) {
      await queue.catch(() => undefined);
      const task = cached().find(item => item.id === id);
      if (!task) return cached();
      try {
        await window.FulianCaseStateStore?.beforeTaskDelete?.(task);
        const tasks = await api({ action: "delete", id, revision: task._revision });
        window.FulianCaseStateStore?.discardDeletedTask?.(task);
        syncFailed = false;
        return tasks;
      } catch (error) {
        showError(error.message);
        await this.refresh().catch(() => undefined);
        throw error;
      }
    },
    completeRecordOnly: async function (id) {
      await queue.catch(() => undefined);
      try {
        const tasks = await api({ action: "complete-record-only", id });
        retryTasks.delete(id);
        syncFailed = retryTasks.size > 0;
        conflictBlocked = false;
        if (!syncFailed) queue = Promise.resolve(tasks);
        return tasks;
      } catch (error) {
        showError(error.message);
        throw error;
      }
    },
    flush: function () {
      return queue;
    },
  };

  window.addEventListener?.("focus", () => window.FulianTaskStore.refresh().catch(() => undefined));
  document.addEventListener?.("visibilitychange", () => {
    if (!document.hidden) window.FulianTaskStore.refresh().catch(() => undefined);
  });
  window.addEventListener?.("storage", event => {
    if (event.storageArea === localStorage && event.key === KEY) window.FulianTaskStore.refresh().catch(() => undefined);
  });
  if (typeof setInterval === "function") {
    setInterval(() => {
      if (!document.hidden) window.FulianTaskStore.refresh().catch(() => undefined);
    }, 30000);
  }
})();
