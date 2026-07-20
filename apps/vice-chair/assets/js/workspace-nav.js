(() => {
  const page = location.pathname.split("/").pop() || "index.html";
  if (["index.html", "login.html", "course.html"].includes(page)) return;

  const header = document.querySelector("body > header.topbar, body > header.meeting-topbar");
  if (!header || header.querySelector(".workspace-menu-button")) return;

  const session = globalThis.FulianAuth?.getSession?.() || {};
  const role = session.role || "";
  const roleLabel = role === "vp" ? "副主席" : role === "committee" ? "會員委員" : role === "admin" ? "系統管理員" : "使用者";
  const navGroups = [
    {
      label: "日常工作",
      items: [
        ["總", "工作總覽", "index.html"],
        ["案", "會員案件", "case-board.html"],
        ["檔", "結案資料", "case-board.html#closed", "vp"],
        ["關", "會員關懷儀表板", "member-care.html"],
        ["析", "月度分析審閱", "analysis-review.html", "vp"],
        ["會", "會員委員會月會", "monthly-meeting.html"],
        ["勤", "點名與出席", "attendance.html"],
      ],
    },
    {
      label: "訪談與輔導",
      items: [
        ["中", "期中輔導", "midterm-form.html"],
        ["終", "終期輔導", "terminal-form.html"],
        ["新", "新會員訪談", "new-member-form.html"],
        ["轉", "轉換行業別", "industry-change-form.html"],
        ["離", "離會訪談", "departure-form.html"],
      ],
    },
    {
      label: "資源與設定",
      items: [
        ["鏈", "常用連結", "useful-links.html"],
        ["學", "副主席交接課程", "course.html", "vp"],
        ["設", "系統與個人設定", "settings.html"],
      ],
    },
  ];

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "workspace-menu-button";
  menuButton.setAttribute("aria-label", "開啟主選單");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  header.prepend(menuButton);

  const backLink = header.querySelector(":scope > a[href]");
  if (backLink) {
    const originalLabel = backLink.textContent.trim();
    backLink.classList.add("workspace-back-button");
    backLink.setAttribute("aria-label", originalLabel || "上一頁");
    backLink.title = originalLabel || "上一頁";
    backLink.innerHTML = '<span class="workspace-back-arrow" aria-hidden="true">←</span><span class="workspace-back-label">上一頁</span>';
  }

  const scrim = document.createElement("button");
  scrim.type = "button";
  scrim.className = "workspace-menu-scrim";
  scrim.setAttribute("aria-label", "關閉主選單");

  const drawer = document.createElement("aside");
  drawer.className = "workspace-menu-drawer";
  drawer.setAttribute("aria-label", "主選單");
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = `
    <div class="workspace-menu-head">
      <span class="workspace-menu-brand">富</span>
      <div><strong>富聯分會</strong><small>會員委員會工作台</small></div>
      <button class="workspace-menu-close" type="button" aria-label="關閉主選單">×</button>
    </div>
    <nav class="workspace-menu-content">
      ${navGroups.map(group => `
        <section class="workspace-menu-group">
          <small>${group.label}</small>
          ${group.items.map(([icon, label, href, access]) => `
            <a class="workspace-menu-link${(href === "case-board.html#closed" ? page === "case-archive.html" : href === page || (page === "case-workflow.html" && href === "case-board.html")) ? " current" : ""}"
               href="${href}"${access === "vp" ? ' data-vp-only="true"' : ""}>
              <span class="workspace-menu-icon">${icon}</span><span>${label}</span><i>›</i>
            </a>`).join("")}
        </section>`).join("")}
    </nav>
    <div class="workspace-menu-user"><span data-workspace-avatar>人</span><div><strong data-workspace-name>使用者</strong><small>${roleLabel}</small></div></div>`;

  if (role === "committee") {
    drawer.querySelectorAll("[data-vp-only]").forEach(element => element.remove());
  }
  const userName = session.name || "使用者";
  drawer.querySelector("[data-workspace-name]").textContent = userName;
  drawer.querySelector("[data-workspace-avatar]").textContent = userName.slice(0, 1);

  document.body.append(scrim, drawer);
  const closeButton = drawer.querySelector(".workspace-menu-close");
  const open = () => {
    drawer.classList.add("open");
    scrim.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
    menuButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("workspace-nav-open");
    closeButton.focus();
  };
  const close = () => {
    drawer.classList.remove("open");
    scrim.classList.remove("show");
    drawer.setAttribute("aria-hidden", "true");
    menuButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("workspace-nav-open");
  };

  menuButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  scrim.addEventListener("click", close);
  drawer.addEventListener("click", event => {
    if (event.target.closest("a")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && drawer.classList.contains("open")) {
      close();
      menuButton.focus();
    }
  });
})();
