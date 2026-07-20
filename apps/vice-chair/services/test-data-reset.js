(function exposeTestDataReset(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FulianTestDataReset = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createTestDataReset() {
  const TASK_STORAGE_KEY = "fulian-work-plan-v1";
  const RESET_PREFIXES = Object.freeze([
    "fulian-case-workflow-v2-",
    "fulian-terminal-counseling-draft-v3",
    "fulian-new-member-interview-v2",
    "fulian-midterm-counseling-draft-v2",
    "fulian-industry-change-interview-v2",
    "fulian-departure-interview-v2",
  ]);
  const DATABASE_NAME = "fulian-case-files";
  const STORE_NAME = "files";

  function storageKeys(storage) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
    return keys;
  }

  function resettableStorageKeys(storage) {
    return storageKeys(storage).filter(
      (key) =>
        key === TASK_STORAGE_KEY ||
        RESET_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
  }

  function taskCount(storage) {
    try {
      const tasks = JSON.parse(storage.getItem(TASK_STORAGE_KEY) || "[]");
      return Array.isArray(tasks) ? tasks.length : 0;
    } catch {
      return 0;
    }
  }

  function openDatabase(indexedDb) {
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function attachmentCount(indexedDb) {
    const database = await openDatabase(indexedDb);
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function summary({ storage, indexedDb }) {
    const keys = resettableStorageKeys(storage);
    return {
      tasks: taskCount(storage),
      workflows: keys.filter((key) =>
        key.startsWith("fulian-case-workflow-v2-")
      ).length,
      drafts: keys.filter((key) =>
        RESET_PREFIXES.slice(1).some((prefix) => key.startsWith(prefix))
      ).length,
      attachments: await attachmentCount(indexedDb),
    };
  }

  async function reset({ storage, indexedDb }) {
    const before = await summary({ storage, indexedDb });
    resettableStorageKeys(storage).forEach((key) => storage.removeItem(key));

    const database = await openDatabase(indexedDb);
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }

    return before;
  }

  return Object.freeze({
    TASK_STORAGE_KEY,
    RESET_PREFIXES,
    resettableStorageKeys,
    taskCount,
    summary,
    reset,
  });
});
