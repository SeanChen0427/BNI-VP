(function () {
  const KEY = "fulian-announcement-board-v1";
  const session = FulianAuth.getSession();
  const roleLabels = { admin: "系統管理員", vp: "副主席", committee: "會員委員" };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  function cached() {
    try {
      const posts = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  }

  function replaceCache(posts) {
    if (!Array.isArray(posts)) throw new Error("伺服器沒有回傳有效留言資料");
    localStorage.setItem(KEY, JSON.stringify(posts.slice(0, 200)));
    dispatchEvent(new CustomEvent("fulian:data-changed", { detail: { source: "supabase-announcements" } }));
  }

  function legacyPosts(posts) {
    return posts.filter(post =>
      /^notice-[0-9]{10,16}-[a-z0-9-]{4,64}$/.test(String(post?.id || ""))
      && post?.authorName === session.name
      && post?.authorRole === session.role
    );
  }

  async function api(body) {
    const response = await fetch("/api/announcements", body ? {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    } : { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `留言同步失敗：HTTP ${response.status}`);
    if (!Array.isArray(data.posts)) throw new Error("伺服器沒有回傳有效留言資料");
    return data;
  }

  function setSyncState(message = "", tone = "") {
    const node = $("#announcementSyncState");
    node.textContent = message;
    node.className = `announcement-sync-state${tone ? ` ${tone}` : ""}`;
    node.hidden = !message;
  }

  function timeText(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "時間未記錄";
    return date.toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function render(posts = cached()) {
    const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#announcementList").innerHTML = sorted.length ? sorted.map(post => `
      <article class="announcement-item">
        <span class="announcement-avatar">${esc(post.authorName?.slice(-1) || "人")}</span>
        <div>
          <div class="announcement-meta"><strong>${esc(post.authorName)}</strong><span>${esc(roleLabels[post.authorRole] || "使用者")}</span><time>${timeText(post.createdAt)}</time></div>
          <p>${esc(post.content)}</p>
        </div>
        ${post.canDelete ? `<button type="button" class="announcement-delete" data-delete-post="${esc(post.id)}">刪除</button>` : ""}
      </article>
    `).join("") : `<div class="announcement-empty"><b>目前還沒有留言</b><span>留下第一則公告、提醒或交接資訊。</span></div>`;
    $("#announcementList").querySelectorAll("[data-delete-post]").forEach(button => {
      button.onclick = () => remove(button.dataset.deletePost);
    });
  }

  async function refresh() {
    const oldPosts = cached();
    const pendingLegacy = legacyPosts(oldPosts);
    const data = pendingLegacy.length
      ? await api({ action: "import-legacy", posts: pendingLegacy })
      : await api();
    replaceCache(data.posts);
    render(data.posts);
    setSyncState(pendingLegacy.length ? "舊留言已安全搬入 Supabase，手機與電腦會同步顯示。" : "已與 Supabase 同步", "success");
    return data.posts;
  }

  async function publish() {
    const input = $("#announcementInput");
    const button = $("#announcementPublish");
    const content = input.value.trim();
    if (!content) {
      input.focus();
      return;
    }
    button.disabled = true;
    setSyncState("正在保存到 Supabase…");
    try {
      const clientReference = `notice-${Date.now()}-${crypto.randomUUID()}`;
      const data = await api({ action: "create", clientReference, content });
      replaceCache(data.posts);
      input.value = "";
      updateCount();
      render(data.posts);
      setSyncState("留言已保存，其他裝置重新整理後即可看到。", "success");
    } catch (error) {
      setSyncState(`Supabase 保存失敗：${error.message}。內容仍在輸入框，請勿重複送出。`, "error");
      input.focus();
    } finally {
      button.disabled = false;
    }
  }

  async function remove(id) {
    const post = cached().find(item => item.id === id);
    if (!post?.canDelete) return;
    if (!confirm(`確定刪除 ${post.authorName} 留下的這則文字嗎？`)) return;
    setSyncState("正在更新 Supabase…");
    try {
      const data = await api({ action: "delete", id });
      replaceCache(data.posts);
      render(data.posts);
      setSyncState("留言已刪除並同步到所有裝置。", "success");
    } catch (error) {
      setSyncState(`Supabase 刪除失敗：${error.message}。原留言仍保留。`, "error");
    }
  }

  function updateCount() {
    const input = $("#announcementInput");
    $("#announcementCount").textContent = `${input.value.length}／1000`;
  }

  async function initialize() {
    render();
    setSyncState("正在讀取 Supabase 留言…");
    try {
      return await refresh();
    } catch (error) {
      setSyncState(`Supabase 同步失敗：${error.message}。目前顯示此裝置的安全備援。`, "error");
      return cached();
    }
  }

  $("#announcementIdentity").textContent = `將以 ${session.name}・${roleLabels[session.role]} 名義發布`;
  $("#announcementPublish").onclick = publish;
  $("#announcementInput").oninput = updateCount;
  $("#announcementInput").onkeydown = event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") publish();
  };
  updateCount();
  window.FulianAnnouncementBoard = { ready: initialize(), refresh };
})();
