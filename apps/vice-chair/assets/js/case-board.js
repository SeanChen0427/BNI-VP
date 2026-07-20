(function () {
  const domain = window.FulianCaseDomain;
  const TASK_KEY = domain.TASK_STORAGE_KEY;
  const session = FulianAuth.getSession();
  const authConfig = FulianAuth.getConfig();
  const committee = [authConfig.vpName, ...authConfig.committee];
  const canDelete = session.role === "vp" || session.role === "admin";
  const canViewArchive = session.role === "vp";
  const typeMap = {
    renewal: { label: "續約", icon: "續", form: "terminal-form.html", flow: true },
    new: { label: "新會員", icon: "新", form: "new-member-form.html", flow: true },
    midterm: { label: "期中輔導", icon: "中", form: "midterm-form.html", flow: false },
    industry: { label: "轉行業別", icon: "轉", form: "industry-change-form.html", flow: true },
    departure: { label: "離會訪談", icon: "離", form: "departure-form.html", flow: false },
    special: { label: "特定關懷", icon: "關", form: "member-care.html" }
  };
  const stages = ["active", "waiting", "interview", "feedback", "vote", "advisor", "closed"];
  const labels = {
    active: "全部工作中",
    waiting: "待安排訪談",
    interview: "訪談進行中",
    feedback: "待回饋",
    vote: "投票中",
    advisor: "待董顧",
    closed: "已結案"
  };

  let filter = location.hash.replace("#", "") || "active";
  if (filter === "draft") filter = "interview";
  if (!stages.includes(filter)) filter = "active";
  let query = "";
  let pendingDeleteId = null;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  function loadTasks() {
    try {
      const value = JSON.parse(localStorage.getItem(TASK_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function workflow(id) {
    return domain.readWorkflow(localStorage, id);
  }

  function draftKey(task) {
    return domain.draftStorageKey(task);
  }

  function hasDraft(task) {
    const key = draftKey(task);
    return key && Boolean(localStorage.getItem(key));
  }

  function stageOf(task, state) {
    return domain.stageOf(task, state, hasDraft(task));
  }

  function stageText(task, state, stage) {
    if (stage === "closed") return "已結案存檔";
    if (stage === "advisor") return state?.advisorStatus === "returned" ? "董顧退回補件" : "等待董顧確認";
    if (stage === "vote") return `投票中・已投 ${Object.keys(state?.votes || {}).length} 票`;
    if (stage === "feedback") return `回饋中・已收 ${Object.values(state?.feedback || {}).filter(value => String(value).trim()).length} 份`;
    if (stage === "interview") return "訪談草稿進行中";
    return "尚未開始訪談";
  }

  function due(task) {
    if (!task.scheduledAt) return { label: "未排日期", overdue: false };
    const date = new Date(task.scheduledAt);
    const overdue = date < new Date() && !domain.isClosed(task, workflow(task.id));
    return {
      label: `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
      overdue
    };
  }

  function records() {
    return loadTasks().map(task => {
      const state = workflow(task.id);
      return { task, state, stage: stageOf(task, state) };
    });
  }

  function counts(list) {
    return Object.fromEntries(stages.map(stage => [
      stage,
      stage === "active" ? list.filter(item => item.stage !== "closed").length : list.filter(item => item.stage === stage).length
    ]));
  }

  function renderSummary(list) {
    const count = counts(list);
    $("#summary").innerHTML = [
      ["待安排訪談", count.waiting],
      ["訪談進行中", count.interview],
      ["等待委員回饋", count.feedback],
      ["投票中", count.vote],
      ["等待董顧確認", count.advisor]
    ].map(([label, number]) => `<article><small>${label}</small><strong>${number}</strong></article>`).join("");
  }

  function renderTabs(list) {
    const count = counts(list);
    $("#stageTabs").innerHTML = stages.map(stage => `<button data-stage="${stage}" class="${filter === stage ? "active" : ""}">${labels[stage]} ${count[stage]}</button>`).join("");
    $("#stageTabs").querySelectorAll("button").forEach(button => {
      button.onclick = () => {
        filter = button.dataset.stage;
        location.hash = filter;
        render();
      };
    });
  }

  function card({ task, state, stage }) {
    const type = typeMap[task.type] || typeMap.special;
    const deadline = due(task);
    const people = [task.lead, ...(task.companions || [])].filter(Boolean);
    const form = `${type.form}?task=${encodeURIComponent(task.id)}`;
    const flow = `case-workflow.html?case=${encodeURIComponent(task.id)}`;
    const feedbackStarted = type.flow && Boolean(
      state?.wordSaved || state?.feedbackNotified || domain.hasFeedback(state)
    );
    const participation = domain.feedbackParticipation(
      task,
      state,
      session.name,
      committee
    );
    const feedbackBadge = feedbackStarted && participation.status !== "not-eligible"
      ? `<span class="personal-feedback ${participation.status}">${
          participation.status === "submitted"
            ? "你已回饋"
            : participation.status === "recused"
              ? "你需迴避"
              : "待你回饋"
        }</span>`
      : "";
    const formAction = stage !== "closed"
      ? `<a href="${form}">${stage === "waiting" || stage === "interview" ? (hasDraft(task) ? "繼續填寫" : "開啟訪談") : "查看訪談表"}</a>`
      : "";
    const archiveAction = stage === "closed" && canViewArchive
      ? `<a class="main" href="case-archive.html?case=${encodeURIComponent(task.id)}">查看結案資料</a>`
      : "";
    const flowAction = type.flow && stage !== "closed"
      ? `<a class="main" href="${flow}${feedbackStarted && participation.status === "pending" ? "#feedbackSection" : ""}">${
          feedbackStarted && participation.status === "pending"
            ? "填寫我的回饋"
            : "查看案件流程"
        }</a>`
      : "";
    return `<article class="case-card">
      <div class="case-main"><span class="type-icon">${type.icon}</span><div><strong>${esc(task.member)}</strong><small>${type.label}・${esc(task.profession || "專業類別待補")}</small></div></div>
      <div class="stage"><span class="pill ${stage}">${stageText(task, state, stage)}</span>${feedbackBadge}<small>${esc(task.stage || "尚未設定階段")}</small></div>
      <div class="owner"><strong>${esc(task.lead || "未指派")}</strong><small>${people.length > 1 ? `＋${people.length - 1} 位陪訪` : "主要負責人"}</small></div>
      <div class="deadline ${deadline.overdue ? "overdue" : ""}"><time>${deadline.label}</time><small>${deadline.overdue ? "已逾期" : "排定時間"}</small></div>
      <div class="actions">
        ${formAction}
        ${flowAction}
        ${archiveAction}
        ${canDelete ? `<button type="button" data-delete="${esc(task.id)}">刪除</button>` : ""}
      </div>
    </article>`;
  }

  function openDeleteDialog(id) {
    if (!canDelete) return;
    const task = loadTasks().find(item => item.id === id);
    if (!task) return;
    pendingDeleteId = id;
    $("#deleteCaseName").textContent = `${task.member}・${(typeMap[task.type] || typeMap.special).label}`;
    $("#deleteModal").hidden = false;
    $("#confirmDelete").focus();
  }

  function closeDeleteDialog() {
    pendingDeleteId = null;
    $("#deleteModal").hidden = true;
  }

  async function deleteAttachment(id) {
    try {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("fulian-case-files", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("files");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("files", "readwrite");
        transaction.objectStore("files").delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    } catch (error) {
      console.warn("案件附件清除失敗", error);
    }
  }

  async function confirmDelete() {
    if (!canDelete || !pendingDeleteId) return;
    const id = pendingDeleteId;
    const tasks = loadTasks();
    const task = tasks.find(item => item.id === id);
    if (!task) {
      closeDeleteDialog();
      render();
      return;
    }
    localStorage.setItem(TASK_KEY, JSON.stringify(tasks.filter(item => item.id !== id)));
    localStorage.removeItem(domain.workflowStorageKey(id));
    const key = draftKey(task);
    if (key) localStorage.removeItem(key);
    await deleteAttachment(id);
    closeDeleteDialog();
    render();
  }

  function bindDeleteDialog() {
    $("#cancelDelete").onclick = closeDeleteDialog;
    $("#confirmDelete").onclick = confirmDelete;
    $("#deleteModal").onclick = event => {
      if (event.target.id === "deleteModal") closeDeleteDialog();
    };
    addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("#deleteModal").hidden) closeDeleteDialog();
    });
  }

  function render() {
    const all = records();
    const visible = all
      .filter(item => filter === "active" ? item.stage !== "closed" : item.stage === filter)
      .filter(({ task }) => !query || [task.member, task.profession, task.lead, ...(task.companions || [])].join(" ").toLowerCase().includes(query));
    renderSummary(all);
    renderTabs(all);
    $("#caseList").innerHTML = visible.length
      ? visible.sort((a, b) => new Date(a.task.scheduledAt || "2999") - new Date(b.task.scheduledAt || "2999")).map(card).join("")
      : `<div class="empty"><b>這個階段目前沒有案件</b><span>從首頁排定工作後，每一案會自動出現在這裡。</span></div>`;
    $("#caseList").querySelectorAll("[data-delete]").forEach(button => {
      button.onclick = () => openDeleteDialog(button.dataset.delete);
    });
  }

  $("#search").oninput = event => {
    query = event.target.value.trim().toLowerCase();
    render();
  };
  addEventListener("hashchange", () => {
    filter = location.hash.replace("#", "") || "active";
    if (filter === "draft") filter = "interview";
    if (!stages.includes(filter)) filter = "active";
    render();
  });
  bindDeleteDialog();
  render();
})();
