(function exposeCaseFiles(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FulianCaseFiles = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createCaseFiles() {
  const DATABASE_NAME = "fulian-case-files";
  const STORE_NAME = "files";

  function workflowAfterWord(existing, fileName, sourceLabel, timeLabel, completedAt = "", {closeWithoutDecision = false} = {}) {
    const state = existing && typeof existing === "object" ? existing : {};
    const log = Array.isArray(state.log) ? state.log : [];
    return {
      ...state,
      wordSaved: true,
      wordReal: true,
      wordName: fileName,
      interviewCompletedAt: completedAt || state.interviewCompletedAt || "",
      closed: closeWithoutDecision || Boolean(state.closed),
      feedback: state.feedback || {},
      votes: state.votes || {},
      log: [
        {
          text: `訪談 Word 已由${sourceLabel}產生：${fileName}`,
          time: timeLabel,
          done: true,
        },
        ...log,
      ].slice(0, 20),
    };
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

  async function saveGeneratedWord({
    caseId,
    blob,
    fileName,
    sourceLabel,
    caseType = "",
    domain,
    storage,
    indexedDb,
    FileClass,
    now = new Date(),
  }) {
    if (!caseId) throw new Error("缺少案件編號");
    if (!blob || !fileName) throw new Error("缺少 Word 檔案");

    const database = await openDatabase(indexedDb);
    const file = new FileClass([blob], fileName, {
      type:
        blob.type ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(file, caseId);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }

    const workflowKey = domain.workflowStorageKey(caseId);
    const existing = domain.parseJson(storage.getItem(workflowKey), {});
    const closeWithoutDecision =
      Boolean(caseType) &&
      typeof domain.requiresDecisionWorkflow === "function" &&
      !domain.requiresDecisionWorkflow({ type: caseType });
    const state = workflowAfterWord(
      existing,
      fileName,
      sourceLabel,
      now.toLocaleString("zh-TW"),
      now.toISOString(),
      { closeWithoutDecision }
    );
    storage.setItem(workflowKey, JSON.stringify(state));
    if (closeWithoutDecision) {
      const tasks = domain.parseJson(storage.getItem(domain.TASK_STORAGE_KEY), []);
      const target = Array.isArray(tasks)
        ? tasks.find(item => item.id === caseId)
        : null;
      if (target) {
        target.completed = true;
        target.completedAt = now.toISOString();
        target.stage = "已完成";
        storage.setItem(domain.TASK_STORAGE_KEY, JSON.stringify(tasks));
      }
    }
    return state;
  }

  async function getCaseFile({caseId, indexedDb}) {
    if (!caseId) throw new Error("缺少案件編號");
    const database = await openDatabase(indexedDb);
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(caseId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  return Object.freeze({
    DATABASE_NAME,
    STORE_NAME,
    workflowAfterWord,
    saveGeneratedWord,
    getCaseFile,
  });
});
