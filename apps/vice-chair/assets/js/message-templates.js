(() => {
  const $ = selector => document.querySelector(selector);
  const session = FulianAuth.getSession();
  const domain = FulianMessageTemplateDomain;
  const canEdit = session?.role === "admin";
  let templates = domain.response(domain.defaults()).templates;
  let apiAvailable = true;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
  }

  function formatMeta(template) {
    if (!template.updatedAt) return "目前使用系統原始公版";
    const date = new Date(template.updatedAt);
    const label = Number.isNaN(date.getTime()) ? template.updatedAt : date.toLocaleString("zh-TW");
    return `正式公版最後更新：${label}${template.updatedBy ? `・${template.updatedBy}` : ""}`;
  }

  function templateCard(template) {
    const editorHint = canEdit ? "Admin 可修改正式公版" : "固定公版・僅供複製";
    const adminActions = canEdit
      ? `<button type="button" data-default>載入原始公版</button><button class="save" type="button" data-save${apiAvailable ? "" : " disabled"}>儲存為正式公版</button>`
      : "";
    return `<article class="template-card" data-template-id="${esc(template.id)}">
      <header class="template-head"><span class="template-icon">${template.id.startsWith("renewal") ? "續" : template.id.startsWith("new-member") ? "新" : "群"}</span><div class="template-title"><strong>${esc(template.title)}</strong><span>${esc(template.description)}</span></div><em class="target-tag">${esc(template.target)}</em></header>
      <div class="template-body">
        <label class="editor-label"><b>文稿內容</b><span>${editorHint}</span><span data-count>${[...template.content].length} 字</span></label>
        <textarea maxlength="${domain.MAX_CONTENT_LENGTH}" data-content${canEdit ? "" : " readonly"}>${esc(template.content)}</textarea>
        <div class="template-actions"><button class="copy" type="button" data-copy>複製文案</button>${adminActions}</div>
        <div class="template-meta" data-meta>${esc(formatMeta(template))}${apiAvailable ? "" : "・目前顯示安全備援，正式同步尚未連線"}</div>
      </div>
    </article>`;
  }

  function render() {
    const categories = [...new Set(templates.map(template => template.category))];
    $("#templateSections").innerHTML = categories.map(category => {
      const group = templates.filter(template => template.category === category);
      return `<section class="template-section"><header><div><small>${category === "新會員入會" ? "NEW MEMBER" : "RENEWAL"}</small><h2>${esc(category)}</h2><p>${category === "新會員入會" ? "新會員宣示、協助群組與訪談確認使用。" : "續約會員確認資料時使用。"}</p></div><span class="template-count">${group.length} 份文稿</span></header><div class="template-list">${group.map(templateCard).join("")}</div></section>`;
    }).join("");
    bind();
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  async function saveTemplate(card, template) {
    if (!canEdit) return toast("只有系統開發人員 Admin 可以修改正式公版");
    if (!apiAvailable) return toast("正式範本同步服務尚未連線；目前公版仍可直接複製");
    const content = card.querySelector("[data-content]").value;
    if (!content.trim()) return toast("文稿內容不可空白");
    if (!confirm(`確認將「${template.title}」目前文字儲存為所有裝置共用的正式公版？`)) return;
    const button = card.querySelector("[data-save]");
    button.disabled = true;
    try {
      const response = await fetch("/api/message-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", templateId: template.id, content }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `正式公版保存失敗：HTTP ${response.status}`);
      templates = data.templates;
      render();
      toast("正式公版已保存，其他裝置重新開啟即可看到");
    } catch (error) {
      toast(error.message || "正式公版保存失敗");
      button.disabled = false;
    }
  }

  function bind() {
    document.querySelectorAll("[data-template-id]").forEach(card => {
      const template = templates.find(item => item.id === card.dataset.templateId);
      const textarea = card.querySelector("[data-content]");
      const count = card.querySelector("[data-count]");
      if (canEdit) textarea.addEventListener("input", () => { count.textContent = `${[...textarea.value].length} 字`; });
      card.querySelector("[data-copy]").onclick = async () => {
        try { await copyText(textarea.value); toast("文案已複製，可以前往 LINE 貼上"); }
        catch { toast("瀏覽器無法存取剪貼簿，請長按文字手動複製"); }
      };
      if (canEdit) {
        card.querySelector("[data-default]").onclick = () => {
          textarea.value = template.defaultContent;
          textarea.dispatchEvent(new Event("input"));
          toast("已載入原始公版；尚未儲存");
        };
        card.querySelector("[data-save]").onclick = () => saveTemplate(card, template);
      }
    });
  }

  async function loadTemplates() {
    try {
      const response = await fetch("/api/message-templates", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.templates)) throw new Error(data.message || `HTTP ${response.status}`);
      templates = data.templates;
    } catch (error) {
      apiAvailable = false;
      templates = domain.response(domain.defaults()).templates;
      console.warn("正式文稿同步尚未連線，顯示原始公版", error);
    }
  }

  async function init() {
    if (!["admin", "vp"].includes(session?.role)) {
      $("#accessNotice").hidden = false;
      $("#templateSections").hidden = true;
      return;
    }
    await loadTemplates();
    render();
  }

  init().catch(error => {
    $("#templateSections").innerHTML = `<div class="loading-card">文稿載入失敗：${esc(error.message || error)}</div>`;
  });
})();
