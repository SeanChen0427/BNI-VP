(async function () {
  const domain = window.FulianAccountabilityEmailDomain;
  const session = FulianAuth.getSession();
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const statusLabels = {
    pending_data: "待補資料",
    pending_send: "待寄送",
    sent: "已寄送",
    held: "暫緩",
    not_applicable: "不適用",
  };
  let tasks = [];
  let filter = "active";
  let selectedId = new URLSearchParams(location.search).get("task") || "";

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2800);
  }

  function identity() {
    return `${session.role}:${session.name}`;
  }

  async function api(method = "GET", body = null) {
    const query = method === "GET" ? `?identity=${encodeURIComponent(identity())}` : "";
    const response = await fetch(`/api/accountability-emails${query}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify({ identity: identity(), ...body }) : null,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `當責信服務無法使用：HTTP ${response.status}`);
    return data;
  }

  function filteredTasks() {
    if (filter === "active") return tasks.filter(task => ["pending_data", "pending_send"].includes(task.status));
    if (filter === "sent") return tasks.filter(task => task.status === "sent");
    if (filter === "held") return tasks.filter(task => ["held", "not_applicable"].includes(task.status));
    return tasks;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-TW");
  }

  function sourceLabel(task) {
    return task.sourceType === "confirmed_attendance" ? "已確認例會＋PALMS 基準" : "半年 PALMS 正式基準";
  }

  function renderSummary() {
    $("#pendingCount").textContent = tasks.filter(task => task.status === "pending_send").length;
    $("#missingCount").textContent = tasks.filter(task => task.status === "pending_data").length;
    $("#openCategoryCount").textContent = tasks.filter(task => task.riskLevel === "open_category" && !["sent", "not_applicable"].includes(task.status)).length;
    $("#sentCount").textContent = tasks.filter(task => task.status === "sent").length;
  }

  function taskCard(task) {
    const reason = task.reason === "absence" ? "缺席" : "代理";
    const riskLabel = task.riskLevel === "open_category" ? "開放行業別" : statusLabels[task.status] || task.status;
    return `<button type="button" class="task-card ${esc(task.riskLevel)} ${task.id === selectedId ? "active" : ""}" data-task-id="${esc(task.id)}">
      <span class="task-card-head"><strong>${esc(task.memberName)}</strong><em>${esc(riskLabel)}</em></span>
      <p>${esc(reason)}第 ${esc(task.occurrence)} 次・${esc(task.title)}</p>
      <footer><span>${esc(formatDate(task.periodStart))}－${esc(formatDate(task.periodEnd))}</span><span>${esc(statusLabels[task.status] || task.status)}</span></footer>
    </button>`;
  }

  function renderList() {
    const visible = filteredTasks();
    $("#taskListCount").textContent = `${visible.length} 筆`;
    if (!visible.some(task => task.id === selectedId)) selectedId = visible[0]?.id || "";
    $("#taskList").innerHTML = visible.length
      ? visible.map(taskCard).join("")
      : `<div class="loading-card">這個分類目前沒有當責信任務。</div>`;
    $("#taskList").querySelectorAll("[data-task-id]").forEach(button => {
      button.onclick = () => {
        selectedId = button.dataset.taskId;
        history.replaceState(null, "", `accountability-emails.html?task=${encodeURIComponent(selectedId)}`);
        renderList();
        renderPreview();
      };
    });
  }

  function renderPreview() {
    const task = tasks.find(item => item.id === selectedId);
    $("#previewEmpty").hidden = Boolean(task);
    $("#previewContent").hidden = !task;
    if (!task) return;
    const reason = task.reason === "absence" ? "缺席" : "代理";
    $("#previewEyebrow").textContent = task.riskLevel === "open_category" ? "OPEN CATEGORY ACCOUNTABILITY" : "ACCOUNTABILITY NOTICE";
    $("#previewTitle").textContent = task.title;
    $("#previewMember").textContent = `${task.memberName}${task.profession ? `・${task.profession}` : ""}`;
    $("#previewStatus").className = `status-badge ${task.status}`;
    $("#previewStatus").textContent = statusLabels[task.status] || task.status;
    $("#previewReason").textContent = `${reason}第 ${task.occurrence} 次`;
    $("#previewPeriod").textContent = `${formatDate(task.periodStart)}－${formatDate(task.periodEnd)}`;
    $("#previewTrigger").textContent = formatDate(task.triggerDate);
    $("#previewSource").textContent = sourceLabel(task);
    $("#previewRecipient").value = task.recipientEmail || "尚未建檔；請在正式信箱選擇會員本人";
    $("#previewCc").value = task.ccEmails?.length ? task.ccEmails.join("、") : "請依寄送當下規範選擇主席、區域辦公室及董事／顧問";
    $("#previewSubject").value = task.subject;
    $("#previewBody").value = task.body;
    $("#templateMeta").textContent = `公版版本：${task.templateVersion}・系統只產生草稿，不會自動寄送`;
    const missing = Array.isArray(task.missingFields) ? task.missingFields : [];
    $("#missingAlert").hidden = missing.length === 0;
    $("#missingAlert").textContent = missing.length ? `尚缺：${missing.join("、")}。補齊前不可使用「全部複製」。` : "";
    $("#copyAll").disabled = Boolean(missing.length) || !["pending_send", "held"].includes(task.status);
    $("#markSent").disabled = Boolean(missing.length) || !["pending_send", "held"].includes(task.status);
    $("#holdTask").hidden = ["sent", "not_applicable", "held"].includes(task.status);
    $("#notApplicable").hidden = ["sent", "not_applicable"].includes(task.status);
    $("#restoreTask").hidden = !["held", "not_applicable"].includes(task.status);
    const note = task.status === "sent"
      ? `已於 ${new Date(task.sentAt).toLocaleString("zh-TW")} 由使用者標記為人工寄送。`
      : task.status === "held" ? `暫緩原因：${task.holdReason || "未填寫"}`
        : task.status === "not_applicable" ? `不適用原因：${task.outcomeReason || "未填寫"}` : "";
    $("#outcomeNote").hidden = !note;
    $("#outcomeNote").textContent = note;
  }

  function render() {
    renderSummary();
    renderList();
    renderPreview();
  }

  async function copyText(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  async function recordCopy(task, field, value) {
    await copyText(value);
    try {
      const result = await api("POST", { action: "record-copy", id: task.id, field });
      tasks = result.tasks;
      render();
      toast(field === "all" ? "完整信件已複製，可貼到正式信箱" : field === "subject" ? "主旨已複製" : "內文已複製");
    } catch (error) {
      toast(`內容已複製，但留痕失敗：${error.message}`);
    }
  }

  async function updateTask(action, extra = {}) {
    const task = tasks.find(item => item.id === selectedId);
    if (!task) return;
    const result = await api("POST", { action, id: task.id, ...extra });
    tasks = result.tasks;
    render();
    toast(result.message || "當責信任務已更新");
  }

  async function load() {
    const button = $("#refreshTasks");
    button.disabled = true;
    button.textContent = "正在同步…";
    try {
      const result = await api();
      tasks = result.tasks || [];
      render();
    } catch (error) {
      $("#taskList").innerHTML = `<div class="loading-card">無法載入當責信任務：${esc(error.message)}</div>`;
      $("#taskListCount").textContent = "載入失敗";
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "重新同步正式出席資料";
    }
  }

  if (!["vp", "admin"].includes(session.role)) {
    $("#accessNotice").hidden = false;
    $("#accountabilityApp").hidden = true;
    return;
  }

  $$("[data-filter]").forEach(button => button.onclick = () => {
    filter = button.dataset.filter;
    $$("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
    render();
  });
  $$("[data-copy]").forEach(button => button.onclick = () => {
    const task = tasks.find(item => item.id === selectedId);
    if (!task) return;
    const field = button.dataset.copy;
    recordCopy(task, field, field === "subject" ? task.subject : task.body);
  });
  $("#copyAll").onclick = () => {
    const task = tasks.find(item => item.id === selectedId);
    if (!task) return;
    recordCopy(task, "all", domain.copyBundle({
      recipientEmail: task.recipientEmail,
      cc: task.ccEmails,
      subject: task.subject,
      body: task.body,
    }));
  };
  $("#markSent").onclick = async () => {
    const task = tasks.find(item => item.id === selectedId);
    if (!task || !confirm(`確認已在正式信箱人工寄出「${task.title}」？\n\n系統不會代為寄送；此動作只保存寄發紀錄。`)) return;
    try { await updateTask("mark-sent"); } catch (error) { toast(error.message); }
  };
  $("#holdTask").onclick = async () => {
    const reason = prompt("請填寫暫緩原因與後續處理時間：");
    if (!reason?.trim()) return;
    try { await updateTask("hold", { reason: reason.trim() }); } catch (error) { toast(error.message); }
  };
  $("#notApplicable").onclick = async () => {
    const reason = prompt("請填寫判定不適用的資料依據：");
    if (!reason?.trim()) return;
    try { await updateTask("not-applicable", { reason: reason.trim() }); } catch (error) { toast(error.message); }
  };
  $("#restoreTask").onclick = async () => {
    if (!confirm("確認將這筆任務恢復為待寄送？")) return;
    try { await updateTask("restore"); } catch (error) { toast(error.message); }
  };
  $("#refreshTasks").onclick = load;
  await load();
})();
