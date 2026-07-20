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

  function load() {
    try {
      const posts = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  }

  function save(posts) {
    localStorage.setItem(KEY, JSON.stringify(posts.slice(0, 200)));
    dispatchEvent(new CustomEvent("fulian:data-changed"));
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

  function canDelete(post) {
    return session.role === "admin" || session.role === "vp" || post.authorName === session.name;
  }

  function render() {
    const posts = load().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#announcementList").innerHTML = posts.length ? posts.map(post => `
      <article class="announcement-item">
        <span class="announcement-avatar">${esc(post.authorName?.slice(-1) || "人")}</span>
        <div>
          <div class="announcement-meta"><strong>${esc(post.authorName)}</strong><span>${esc(roleLabels[post.authorRole] || "使用者")}</span><time>${timeText(post.createdAt)}</time></div>
          <p>${esc(post.content)}</p>
        </div>
        ${canDelete(post) ? `<button type="button" class="announcement-delete" data-delete-post="${esc(post.id)}">刪除</button>` : ""}
      </article>
    `).join("") : `<div class="announcement-empty"><b>目前還沒有留言</b><span>留下第一則公告、提醒或交接資訊。</span></div>`;
    $("#announcementList").querySelectorAll("[data-delete-post]").forEach(button => {
      button.onclick = () => remove(button.dataset.deletePost);
    });
  }

  function publish() {
    const input = $("#announcementInput");
    const content = input.value.trim();
    if (!content) {
      input.focus();
      return;
    }
    const posts = load();
    posts.unshift({
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      authorName: session.name,
      authorRole: session.role,
      createdAt: new Date().toISOString()
    });
    save(posts);
    input.value = "";
    updateCount();
    render();
  }

  function remove(id) {
    const posts = load();
    const post = posts.find(item => item.id === id);
    if (!post || !canDelete(post)) return;
    if (!confirm(`確定刪除 ${post.authorName} 留下的這則文字嗎？`)) return;
    save(posts.filter(item => item.id !== id));
    render();
  }

  function updateCount() {
    const input = $("#announcementInput");
    $("#announcementCount").textContent = `${input.value.length}／1000`;
  }

  $("#announcementIdentity").textContent = `將以 ${session.name}・${roleLabels[session.role]} 名義發布`;
  $("#announcementPublish").onclick = publish;
  $("#announcementInput").oninput = updateCount;
  $("#announcementInput").onkeydown = event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") publish();
  };
  updateCount();
  render();
})();
