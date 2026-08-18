(() => {
  const RELEASES = Object.freeze([
    Object.freeze({
      version: "1.0.4",
      publishedAt: "2026-08-18",
      title: "新增常用文稿範本",
      level: "normal",
      changes: Object.freeze([
        "側欄把文稿範本與常用連結收合在「常用資源」，避免主選單持續變長。",
        "新增群組使用說明、新會員訪談確認及續約訪談確認三份可複製公版。",
        "所有文稿都是固定文字，直接按下複製即可，不讀取案件、投票或訪談 Word。",
        "副主席可查看與複製；只有系統開發人員 Admin 能更新跨裝置正式公版。"
      ]),
      impact: "不發送 LINE、不保存會員回覆的身分證字號，也不讀取或修改案件、投票、Word 或會員資料。"
    }),
    Object.freeze({
      version: "1.0.3",
      publishedAt: "2026-08-11",
      title: "離會訪談改為純紀錄流程",
      level: "important",
      changes: Object.freeze([
        "離會訪談保存 Word 後直接結案，不進入委員回饋、投票、董事顧問確認或公告流程。",
        "已登記離會的會員仍可從歷史紀錄安排補訪；補訪不會恢復會員資格，也不會加入現任人數。",
        "表單新增清楚的營運改善摘要與後續優化行動欄位，供分會持續改善。",
        "結案資料頁只顯示離會訪談 Word、營運改善紀錄與案件歷程，不再出現決議區塊。"
      ]),
      impact: "不修改既有已完成案件、訪談 Word 或歷史資料；只修正後續離會訪談的流程限制與顯示。"
    }),
    Object.freeze({
      version: "1.0.2",
      publishedAt: "2026-08-10",
      title: "留言板跨裝置同步",
      level: "important",
      changes: Object.freeze([
        "修正電腦發布留言後，手機登入卻看不到內容的問題。",
        "留言改由 Supabase 保存；舊電腦留言會在原作者開啟新版首頁時安全搬移。",
        "同步失敗會保留輸入內容或本機備援，不再顯示成已成功保存。",
        "已結案清單不再顯示續約、期中或新會員訪談的舊排定階段。"
      ]),
      impact: "既有電腦留言不會刪除；案件、月會、訪談、附件、回饋、投票與會員資料均不受影響。"
    }),
    Object.freeze({
      version: "1.0.1",
      publishedAt: "2026-08-10",
      title: "修正月會紀錄載入",
      level: "important",
      changes: Object.freeze([
        "修正舊月會草稿引用已刪除案件時，整個月會頁面無法載入的問題。",
        "月會紀錄會先正常顯示；失效排程只標示待處理，不會自動復活已刪除案件。"
      ]),
      impact: "既有月會內容、案件、期中關懷、訪談草稿、附件、回饋與投票資料均保留。"
    }),
    Object.freeze({
      version: "1.0.0",
      publishedAt: "2026-08-10",
      title: "交接與委員會通知更新",
      level: "normal",
      changes: Object.freeze([
        "新增首頁版本更新入口，改版資訊不再占用工作提醒鈴鐺。",
        "新增每週會員委員會工作進度預覽，可確認排版後再發送 LINE。",
        "委員會通知會清楚顯示後台指定的正式群或測試群，降低誤發風險。"
      ]),
      impact: "本次更新不影響既有案件、期中關懷、訪談草稿、附件、回饋、投票或會員資料。"
    })
  ]);

  const latest = RELEASES[0];
  const session = window.FulianAuth?.getSession?.() || { role: "guest", name: "訪客" };
  const readKey = `fulian-release-notes-read-v1-${session.role}-${session.name}`;
  const $ = selector => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function formattedDate(value) {
    const [year, month, day] = String(value).split("-");
    return `${year}/${month}/${day}`;
  }

  function isLatestRead() {
    try {
      return localStorage.getItem(readKey) === latest.version;
    } catch {
      return false;
    }
  }

  function updateTrigger() {
    const trigger = $("#releaseNotesTrigger");
    if (!trigger) return;
    const unread = !isLatestRead();
    $("#releaseNotesVersion").textContent = `v${latest.version}`;
    $("#releaseNotesNew").hidden = !unread;
    trigger.classList.toggle("unread", unread);
    trigger.setAttribute("aria-label", `${unread ? "新版本：" : "查看"}系統更新 v${latest.version}`);
  }

  function markLatestRead() {
    try {
      localStorage.setItem(readKey, latest.version);
    } catch {}
    updateTrigger();
  }

  function releaseMarkup(release, current = false) {
    const levelLabel = release.level === "important" ? "重要更新" : "一般更新";
    return `
      <article class="release-history-item${current ? " current" : ""}">
        <header>
          <div><b>v${escapeHtml(release.version)}</b><span>${escapeHtml(levelLabel)}</span></div>
          <time datetime="${escapeHtml(release.publishedAt)}">${escapeHtml(formattedDate(release.publishedAt))}</time>
        </header>
        <h3>${escapeHtml(release.title)}</h3>
        <ul>${release.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
        <p>${escapeHtml(release.impact)}</p>
      </article>`;
  }

  function openDialog() {
    const dialog = $("#releaseNotesDialog");
    if (!dialog) return;
    $("#releaseDialogVersion").textContent = `v${latest.version}`;
    $("#releaseDialogDate").textContent = formattedDate(latest.publishedAt);
    $("#releaseDialogTitle").textContent = latest.title;
    $("#releaseDialogChanges").innerHTML = latest.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("");
    $("#releaseDialogImpact").textContent = latest.impact;
    const acknowledge = $("#acknowledgeRelease");
    acknowledge.textContent = isLatestRead() ? "關閉" : "我知道了";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog() {
    const dialog = $("#releaseNotesDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function initDashboard() {
    const trigger = $("#releaseNotesTrigger");
    if (!trigger) return;
    updateTrigger();
    trigger.addEventListener("click", openDialog);
    $("#closeReleaseNotes")?.addEventListener("click", closeDialog);
    $("#acknowledgeRelease")?.addEventListener("click", () => {
      markLatestRead();
      closeDialog();
    });
    $("#releaseNotesDialog")?.addEventListener("click", event => {
      if (event.target === event.currentTarget) closeDialog();
    });
    if (latest.level === "important" && !isLatestRead()) openDialog();
  }

  function initHistory() {
    const history = $("#releaseNotesHistory");
    if (!history) return;
    history.innerHTML = RELEASES.map((release, index) => releaseMarkup(release, index === 0)).join("");
    $("#currentReleaseVersion").textContent = `v${latest.version}`;
    $("#currentReleaseDate").textContent = formattedDate(latest.publishedAt);
  }

  function init() {
    initDashboard();
    initHistory();
  }

  window.FulianReleaseNotes = Object.freeze({ releases: RELEASES, latest, isLatestRead, markLatestRead });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
