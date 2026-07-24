(function () {
  const KEY = window.FulianCaseDomain.TASK_STORAGE_KEY;
  const MIGRATION_KEY = "fulian-task-supabase-migration-v1";
  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  let applyingServerState = false;
  let queue = Promise.resolve();

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

  function replaceCache(tasks) {
    applyingServerState = true;
    nativeSetItem.call(localStorage, KEY, JSON.stringify(Array.isArray(tasks) ? tasks : []));
    applyingServerState = false;
    window.dispatchEvent(new CustomEvent("fulian:data-changed", { detail: { source: "supabase-tasks" } }));
  }

  async function request(tasks = [], deletedIds = []) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", tasks, deletedIds }),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `排程同步失敗：HTTP ${response.status}`);
    replaceCache(data.tasks);
    return data.tasks;
  }

  function changedTasks(before, after) {
    const previous = new Map(before.map(task => [task.id, JSON.stringify(task)]));
    return after.filter(task => !task.id || previous.get(task.id) !== JSON.stringify(task));
  }

  function queueSync(before, after) {
    const afterIds = new Set(after.map(task => task.id));
    const deletedIds = before.map(task => task.id).filter(id => id && !afterIds.has(id));
    const changed = changedTasks(before, after);
    if (!changed.length && !deletedIds.length) return queue;
    queue = queue.catch(() => undefined).then(() => request(changed, deletedIds));
    queue.catch(error => {
      console.error("Supabase task sync failed", error);
      window.dispatchEvent(new CustomEvent("fulian:task-sync-error", { detail: { message: error.message } }));
    });
    return queue;
  }

  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || key !== KEY || applyingServerState) {
      return nativeSetItem.call(this, key, value);
    }
    const before = cached();
    const result = nativeSetItem.call(this, key, value);
    queueSync(before, parse(value));
    return result;
  };

  async function initialize() {
    const localTasks = cached();
    const response = await fetch("/api/tasks", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `排程載入失敗：HTTP ${response.status}`);
    let serverTasks = Array.isArray(data.tasks) ? data.tasks : [];
    const session = FulianAuth.getSession();
    const canManage = ["admin", "vp"].includes(session?.role);
    if (canManage && !nativeGetItem.call(localStorage, MIGRATION_KEY) && localTasks.length) {
      const serverIds = new Set(serverTasks.map(task => task.id));
      const missing = localTasks.filter(task => task.id && !serverIds.has(task.id));
      if (missing.length) serverTasks = await request(missing, []);
      nativeSetItem.call(localStorage, MIGRATION_KEY, new Date().toISOString());
    }
    replaceCache(serverTasks);
    return serverTasks;
  }

  const ready = initialize().catch(error => {
    console.error("Supabase task bootstrap failed", error);
    window.dispatchEvent(new CustomEvent("fulian:task-sync-error", { detail: { message: error.message } }));
    return cached();
  });

  window.FulianTaskStore = {
    ready,
    all: cached,
    refresh: async function () {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `排程載入失敗：HTTP ${response.status}`);
      replaceCache(data.tasks);
      return data.tasks;
    },
    flush: function () {
      return queue;
    }
  };
})();
