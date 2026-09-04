(() => {
  const $ = selector => document.querySelector(selector);
  const session = FulianAuth.getSession();
  const domain = FulianMessageTemplateDomain;
  const canEdit = session?.role === "admin";
  let templates = domain.response(domain.defaults()).templates;
  let apiAvailable = true;
  let vicePresidentProfile = { name: "", profession: "" };

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
    const label = Number.isNaN(date.getTime()) ? template.updatedAt : date.toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});
    return `正式公版最後更新：${label}${template.updatedBy ? `・${template.updatedBy}` : ""}`;
  }

  function profileValues() {
    return {
      vicePresidentName: vicePresidentProfile.name,
      vicePresidentProfession: vicePresidentProfile.profession,
    };
  }

  function profileNote(template) {
    if (!template.usesVicePresidentProfile) return "";
    const complete = vicePresidentProfile.name && vicePresidentProfile.profession;
    const detail = [vicePresidentProfile.profession, vicePresidentProfile.name].filter(Boolean).join("・");
    return `<div class="dynamic-note${complete ? "" : " warning"}"><b>當屆副主席資訊</b><span>${complete
      ? `複製時會自動帶入：${esc(detail)}`
      : `目前尚缺${vicePresidentProfile.name ? "行業別" : "姓名與行業別"}，文案會保留提示文字，請先確認當屆名單與會員主檔。`}</span></div>`;
  }

  function displayParts(template, content = template.content) {
    const displayContent = canEdit ? content : domain.personalizeContent(content, profileValues());
    return domain.contentParts(template, displayContent);
  }

  function partEditor(part, index, partCount) {
    const editorHint = canEdit ? "Admin 可修改正式公版" : "正式公版・僅供複製";
    const copyLabel = partCount > 1 ? part.copyLabel : "複製文案";
    return `<section class="message-part" data-part-index="${index}">
      <label class="editor-label"><b>${esc(part.title)}</b><span>${editorHint}</span><span data-count="${index}">${[...part.content].length} 字</span></label>
      ${part.hint ? `<p class="part-hint">${esc(part.hint)}</p>` : ""}
      <textarea maxlength="${domain.MAX_CONTENT_LENGTH}" data-content data-part-index="${index}"${canEdit ? "" : " readonly"}>${esc(part.content)}</textarea>
      <div class="template-actions"><button class="copy" type="button" data-copy="${index}">${esc(copyLabel)}</button></div>
    </section>`;
  }

  function templateCard(template) {
    const parts = displayParts(template);
    const adminActions = canEdit
      ? `<button type="button" data-default>載入原始公版</button><button class="save" type="button" data-save${apiAvailable ? "" : " disabled"}>儲存為正式公版</button>`
      : "";
    return `<article class="template-card" data-template-id="${esc(template.id)}">
      <header class="template-head"><span class="template-icon">${template.id.startsWith("renewal") ? "續" : template.id.startsWith("new-member") ? "新" : "群"}</span><div class="template-title"><strong>${esc(template.title)}</strong><span>${esc(template.description)}</span></div><em class="target-tag">${esc(template.target)}</em></header>
      <div class="template-body">
        ${profileNote(template)}
        ${parts.map((part, index) => partEditor(part, index, parts.length)).join("")}
        ${adminActions ? `<div class="template-actions admin-actions">${adminActions}</div>` : ""}
        <div class="template-meta" data-meta>${esc(formatMeta(template))}${apiAvailable ? "" : "・目前顯示安全備援，正式同步尚未連線"}</div>
      </div>
    </article>`;
  }

  function render() {
    const categories = [...new Set(templates.map(template => template.category))];
    $("#templateSections").innerHTML = categories.map(category => {
      const group = templates.filter(template => template.category === category);
      return `<section class="template-section"><header><div><small>${category === "新會員入會" ? "NEW MEMBER" : "RENEWAL"}</small><h2>${esc(category)}</h2><p>${category === "新會員入會" ? "新會員申請與繳費完成後的協助群、宣示與訪談確認使用。" : "續約會員確認資料時使用。"}</p></div><span class="template-count">${group.length} 份文稿</span></header><div class="template-list">${group.map(templateCard).join("")}</div></section>`;
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
    const content = domain.joinContent(template, [...card.querySelectorAll("[data-content]")].map(textarea => textarea.value));
    if (!content.trim()) return toast("文稿內容不可空白");
    if (content.length > domain.MAX_CONTENT_LENGTH) return toast(`文稿內容不可超過 ${domain.MAX_CONTENT_LENGTH} 字`);
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
      const textareas = [...card.querySelectorAll("[data-content]")];
      if (canEdit) textareas.forEach((textarea, index) => textarea.addEventListener("input", () => {
        card.querySelector(`[data-count="${index}"]`).textContent = `${[...textarea.value].length} 字`;
      }));
      card.querySelectorAll("[data-copy]").forEach(button => { button.onclick = async () => {
        const textarea = textareas[Number(button.dataset.copy) || 0];
        const content = domain.personalizeContent(textarea.value, profileValues());
        try { await copyText(content); toast("文案已複製，可以前往 LINE 貼上"); }
        catch { toast("瀏覽器無法存取剪貼簿，請長按文字手動複製"); }
      }; });
      if (canEdit) {
        card.querySelector("[data-default]").onclick = () => {
          const defaults = domain.contentParts(template, template.defaultContent);
          textareas.forEach((textarea, index) => {
            textarea.value = defaults[index]?.content || template.defaultContent;
            textarea.dispatchEvent(new Event("input"));
          });
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

  async function loadVicePresidentProfile() {
    const config = FulianAuth.getConfig();
    const name = String(config.vpName || (session?.role === "vp" ? session.name : "") || "").trim();
    vicePresidentProfile = { name, profession: "" };
    if (!name || !window.FulianData?.rest) return;
    try {
      const rows = await FulianData.rest(`members?status=eq.active&people.display_name=eq.${encodeURIComponent(name)}&select=profession,people!inner(display_name)&limit=2`);
      const member = Array.isArray(rows) ? rows.find(row => row.people?.display_name === name) : null;
      vicePresidentProfile.profession = String(member?.profession || "").trim();
    } catch (error) {
      console.warn("當屆副主席行業別載入失敗，文案保留提示文字", error);
    }
  }

  async function init() {
    if (!["admin", "vp"].includes(session?.role)) {
      $("#accessNotice").hidden = false;
      $("#templateSections").hidden = true;
      return;
    }
    await Promise.all([loadTemplates(), loadVicePresidentProfile()]);
    render();
  }

  init().catch(error => {
    $("#templateSections").innerHTML = `<div class="loading-card">文稿載入失敗：${esc(error.message || error)}</div>`;
  });
})();
