(async function () {
  await window.FulianTaskStore.ready;
  const domain = window.FulianCaseDomain;
  const TASK_KEY = domain.TASK_STORAGE_KEY;
  const ANNOUNCEMENT_KEY = "fulian-announcement-board-v1";
  const session = FulianAuth.getSession();
  const READ_KEY = `fulian-notification-read-v1-${session.role}-${session.name}`;
  const typeLabels = { renewal: "續約", new: "新會員", midterm: "期中輔導", industry: "轉行業別", departure: "離會訪談", special: "特定關懷" };
  const $ = selector => document.querySelector(selector);
  let items = [];
  let monthlyDataStatus = null;

  function parse(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function workflow(id) {
    return domain.readWorkflow(localStorage, id) || {};
  }

  function readIds() {
    const value = parse(READ_KEY, []);
    return new Set(Array.isArray(value) ? value : []);
  }

  function saveRead(ids) {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-300)));
  }

  function relevantTask(task) {
    if (domain.isClosed(task, workflow(task.id))) return false;
    if (session.role === "vp" || session.role === "admin") return true;
    return [task.lead, ...(task.companions || [])].includes(session.name);
  }

  function taskItem(task) {
    const state = workflow(task.id);
    const draft = domain.readDraft(localStorage, task);
    const stage = domain.stageOf(task, state, Boolean(draft));
    const date = task.scheduledAt ? new Date(task.scheduledAt) : null;
    const hours = date && !Number.isNaN(date.getTime()) ? (date - new Date()) / 36e5 : null;
    const label = typeLabels[task.type] || "會員案件";
    let kind = "draft";
    let title = `${label}尚待處理`;
    let detail = `${task.member}・${task.stage || "尚未開始"}`;
    let tone = "workflow";
    let icon = "案";
    let link = `case-board.html#active`;
    let priority = 6;

    if (stage === domain.STAGES.ADVISOR) {
      kind = "advisor";
      title = state.advisorStatus === "returned" ? "董顧退回案件補件" : "案件等待董顧確認";
      link = `case-workflow.html?case=${encodeURIComponent(task.id)}`;
      icon = "顧";
      priority = 3;
    } else if (stage === domain.STAGES.VOTE) {
      kind = "vote";
      title = `投票進行中・已投 ${Object.keys(state.votes || {}).length} 票`;
      link = `case-workflow.html?case=${encodeURIComponent(task.id)}`;
      icon = "票";
      priority = 2;
    } else if (stage === domain.STAGES.FEEDBACK) {
      kind = "feedback";
      title = `等待委員回饋・已收 ${domain.feedbackCount(state)} 份`;
      link = `case-workflow.html?case=${encodeURIComponent(task.id)}`;
      icon = "回";
      priority = 4;
    }

    if (hours !== null && hours < 0) {
      kind = `${kind}-overdue`;
      title = `${label}已逾期`;
      detail = `${task.member}・原排定 ${date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
      tone = "urgent";
      icon = "急";
      priority = 0;
    } else if (hours !== null && hours <= 72 && priority > 1) {
      kind = `${kind}-due`;
      title = `${label}將在 3 日內到期`;
      detail = `${task.member}・${date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
      tone = "urgent";
      icon = "期";
      priority = 1;
    }

    return {
      id: `task-${task.id}-${kind}`,
      title,
      detail,
      icon,
      tone,
      link,
      priority,
      time: task.updatedAt || task.createdAt || task.scheduledAt || new Date().toISOString()
    };
  }

  function announcementItems() {
    const posts = parse(ANNOUNCEMENT_KEY, []);
    return (Array.isArray(posts) ? posts : [])
      .filter(post => post.authorName !== session.name)
      .slice(0, 20)
      .map(post => ({
        id: `announcement-${post.id}`,
        title: `新公告・${post.authorName}`,
        detail: String(post.content || "").replace(/\s+/g, " ").slice(0, 80),
        icon: "告",
        tone: "announcement",
        link: "index.html#announcementTitle",
        priority: 5,
        time: post.createdAt
      }));
  }

  function timeText(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function buildItems() {
    const tasks = parse(TASK_KEY, []);
    const taskItems = (Array.isArray(tasks) ? tasks : []).filter(relevantTask).map(taskItem);
    const dataItems = ["vp", "admin"].includes(session.role) && monthlyDataStatus
      ? monthlyDataStatus.items.filter(item => !item.complete).map(item => ({
          id: `monthly-data-${monthlyDataStatus.month}-${item.type}`,
          title: `每月資料待上傳・${item.label}`,
          detail: item.period,
          icon: "資",
          tone: "urgent",
          link: "index.html#monthlyDataUpdate",
          priority: 1,
          time: monthlyDataStatus.generatedAt
        }))
      : [];
    items = [...dataItems, ...taskItems, ...announcementItems()].sort((a, b) => a.priority - b.priority || new Date(b.time) - new Date(a.time));
  }

  function render() {
    buildItems();
    const read = readIds();
    const unread = items.filter(item => !read.has(item.id)).length;
    const badge = $("#notificationCount");
    badge.textContent = unread > 99 ? "99+" : unread;
    badge.hidden = unread === 0;
    $("#notificationList").innerHTML = items.length ? items.map(item => `
      <button type="button" class="notification-item ${item.tone} ${read.has(item.id) ? "" : "unread"}" data-notification="${item.id}">
        <span class="notification-icon">${item.icon}</span>
        <span class="notification-copy"><strong>${item.title}</strong><span>${item.detail}</span></span>
        <time>${timeText(item.time)}</time>
      </button>
    `).join("") : `<div class="notification-empty"><b>目前沒有提醒</b><span>新案件、期限、投票或公告會顯示在這裡。</span></div>`;
    $("#notificationList").querySelectorAll("[data-notification]").forEach(button => {
      button.onclick = () => openItem(button.dataset.notification);
    });
  }

  function openItem(id) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    const read = readIds();
    read.add(id);
    saveRead(read);
    render();
    location.href = item.link;
  }

  function markAllRead() {
    const read = readIds();
    items.forEach(item => read.add(item.id));
    saveRead(read);
    render();
  }

  function togglePanel(force) {
    const panel = $("#notificationPanel");
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    $("#notificationBell").setAttribute("aria-expanded", String(open));
    if (open) render();
  }

  $("#notificationBell").onclick = event => {
    event.stopPropagation();
    togglePanel();
  };
  $("#notificationPanel").onclick = event => event.stopPropagation();
  $("#markAllNotificationsRead").onclick = markAllRead;
  document.addEventListener("click", () => togglePanel(false));
  addEventListener("keydown", event => {
    if (event.key === "Escape") togglePanel(false);
  });
  addEventListener("storage", render);
  addEventListener("fulian:data-changed", render);
  addEventListener("fulian:monthly-data-status", event => {
    monthlyDataStatus = event.detail;
    render();
  });
  render();
})();
