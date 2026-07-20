(function () {
  const sharedLinks = [
    {
      key: "events",
      icon: "曆",
      eyebrow: "EVENTS",
      title: "高屏區活動行事曆",
      description: "查看高雄市中心區與屏東區近期活動及培訓日期。",
      url: "https://bnikaohsiung.com.tw/zh-TW/events",
      action: "查看活動行事曆"
    },
    {
      key: "connect",
      icon: "BNI",
      eyebrow: "MEMBER SYSTEM",
      title: "BNI Connect",
      description: "登入 BNI Connect，使用會員系統與日常資料功能。",
      url: "https://www.bniconnectglobal.com/login/",
      action: "登入 BNI Connect"
    },
    {
      key: "training",
      icon: "訓",
      eyebrow: "TRAINING",
      title: "高屏區培訓報名網",
      description: "登入會員培訓系統，查詢並報名適合的課程。",
      url: "https://www.bnitraining.com/html/memberLogin",
      action: "前往培訓報名"
    }
  ];

  const vpLinks = [
    {
      key: "meeting-report",
      icon: "報",
      eyebrow: "WEEKLY REPORT",
      title: "分會例會資料填報系統",
      description: "副主席進行分會例會相關資料填報時使用。",
      url: "https://script.google.com/macros/s/AKfycbz1kscmhgLgkcwpMRf37TWHVKqpoktDRMg3GnBjIFlA9XOF3QsafDv3y65T6MmgHPe2Xw/exec",
      action: "開啟資料填報"
    },
    {
      key: "office-drive",
      icon: "告",
      eyebrow: "OFFICE NOTICE",
      title: "高屏區辦公室公告雲端資料夾",
      description: "查閱 BNI 高雄市中心區與屏東區辦公室公告資料。",
      url: "https://reurl.cc/DOabZQ",
      action: "開啟公告資料夾"
    },
    {
      key: "vp-drive",
      icon: "VP",
      eyebrow: "VICE PRESIDENT",
      title: "BNI 副主席資料夾",
      description: "開啟副主席職務所需的共用文件與工作資料。",
      url: "https://reurl.cc/gGEDEz",
      action: "開啟副主席資料夾"
    }
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function renderLinks(target, links) {
    target.innerHTML = links.map(link => `
      <a class="link-card" data-link-key="${escapeHtml(link.key)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        <span class="link-icon">${escapeHtml(link.icon)}</span>
        <span class="link-copy">
          <small>${escapeHtml(link.eyebrow)}</small>
          <strong>${escapeHtml(link.title)}</strong>
          <p>${escapeHtml(link.description)}</p>
          <em>${escapeHtml(link.action)} <i aria-hidden="true">↗</i></em>
        </span>
      </a>
    `).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const session = FulianAuth.getSession();
    renderLinks(document.querySelector("#sharedLinks"), sharedLinks);
    if (session?.role === "vp") {
      renderLinks(document.querySelector("#vpLinks"), vpLinks);
      document.querySelector("#vpLinksSection").hidden = false;
    }
  });
})();
