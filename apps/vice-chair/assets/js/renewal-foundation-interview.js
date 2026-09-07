(function () {
  const terminal = location.pathname.endsWith("terminal-form.html");
  const domain = window.FulianRenewalFoundationDomain;
  const taskId = new URLSearchParams(location.search).get("task");
  const container = document.getElementById("renewalFoundationPanel");
  let task, items = [], loadError = "";
  async function loadScript(src) {
    await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = reject; document.body.append(script); });
  }
  async function refresh() {
    if (terminal) return window.FulianFoundationPage?.refresh();
    const response = await fetch(`/api/renewal-foundations?summary=1&contextTask=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "地基追蹤讀取失敗");
    items = data.items.filter(item => item.memberName === task.member);
    container.replaceChildren();
    const title = document.createElement("h2"); title.textContent = "續約地基進度與本次關懷";
    const text = document.createElement("p"); text.className = "foundation-snapshot"; text.textContent = domain.summaryText(items);
    const link = document.createElement("a"); link.href = "renewal-foundations.html"; link.textContent = "查看地基與完整追蹤歷程 →";
    container.append(title, text, link);
  }
  const ready = (async () => {
    if (!container) return;
    await window.FulianTaskStore.ready;
    task = window.FulianTaskStore.all().find(item => item.id === taskId);
    if (!task) throw new Error("尚未取得訪談會員，無法核對地基");
    if (terminal) {
      window.FulianFoundationEditorContext = { caseId: taskId, memberName: task.member };
      const response = await fetch("renewal-foundations.html", { cache: "no-store" });
      if (!response.ok) throw new Error("無法載入地基設定表單");
      const template = new DOMParser().parseFromString(await response.text(), "text/html");
      container.replaceChildren(...[...template.querySelector("main").children].map(node => document.importNode(node, true)));
      container.querySelector(".summary").hidden = true;
      container.querySelector(".toolbar").hidden = true;
      container.querySelector("h1").textContent = "本次續約地基設定與歷次進度";
      container.querySelector(".hero p").textContent = "逐項設定起算日、目標及週期；保存後由工作總覽持續追蹤，也會帶入訪談 Word。";
      for (const dialog of template.querySelectorAll("dialog")) {
        const copy = document.importNode(dialog, true); copy.classList.add("foundation-modal"); document.body.append(copy);
      }
      await loadScript("assets/js/renewal-foundations.js?v=4");
      // Refresh explicitly so completion/export never races the first API response.
      await window.FulianFoundationPage.refresh();
    } else await refresh();
  })().catch(error => { loadError = error.message; if (container) container.textContent = `續約地基尚未載入：${error.message}`; });
  window.FulianFoundationInterview = {
    ready,
    async capture() {
      await ready;
      if (loadError) throw new Error(loadError);
      await refresh();
      return terminal ? window.FulianFoundationPage.snapshotText(task.member) : domain.summaryText(items);
    },
    snapshotText() { return terminal ? window.FulianFoundationPage?.snapshotText(task?.member) || "地基資料尚未載入" : domain.summaryText(items); },
  };
})();
