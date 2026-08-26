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

  async function blobBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function base64Blob(value, type) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Blob([bytes], { type });
  }

  async function uploadPrivateWord(caseId, file) {
    if (typeof fetch !== "function" || typeof window === "undefined") return null;
    const response = await fetch("/api/task-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: caseId,
        filename: file.name,
        type: file.type,
        base64: await blobBase64(file),
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Word 上傳失敗：HTTP ${response.status}`);
    return data;
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

    await uploadPrivateWord(caseId, file);
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
    if (typeof window !== "undefined") {
      await window.FulianCaseStateStore?.flush();
    }
    if (closeWithoutDecision) {
      if (typeof window === "undefined" || typeof window.FulianTaskStore?.completeRecordOnly !== "function") {
        throw new Error("案件完成服務尚未更新，請重新整理頁面後再試");
      }
      await window.FulianTaskStore.completeRecordOnly(caseId);
    }
    return state;
  }

  async function getCaseFile({caseId, indexedDb}) {
    if (!caseId) throw new Error("缺少案件編號");
    if (typeof fetch === "function" && typeof window !== "undefined") {
      try {
        const response = await fetch(`/api/task-file?task=${encodeURIComponent(caseId)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.base64) {
          return new File(
            [base64Blob(data.base64, data.type)],
            data.name,
            { type: data.type }
          );
        }
        if (response.status !== 404) throw new Error(data.message || `Word 下載失敗：HTTP ${response.status}`);
      } catch (error) {
        if (!indexedDb) throw error;
        console.warn("Supabase Word 載入失敗，改讀本機備援", error);
      }
    }
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
