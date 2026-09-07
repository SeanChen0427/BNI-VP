(async function () {
  const domain = window.FulianRenewalFoundationDomain;
  const calendar = window.FulianCalendarDomain;
  const session = FulianAuth.getSession();
  if (!session) return;
  const manager = domain.manager(session);
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const params = new URLSearchParams(location.search);
  const editorContext = window.FulianFoundationEditorContext;
  const eventLabels = { create: "建立地基", amend: "調整條件／指派", note: "補充紀錄", reminder: "已實際提醒", progress: "回報進度", resolve: "人工確認結果", reopen: "重新開啟", "confirm-quarter": "確認本期工作坊" };
  let items = [], sources = [], members = [], people = [], creatingLegacy = false, editing = null, recording = null, creationId = "", busy = false;
  let selectedId = params.get("item") || "";

  async function api(body, query = "") {
    const response = await fetch(`/api/renewal-foundations${query}${editorContext ? `${query ? "&" : "?"}contextTask=${encodeURIComponent(editorContext.caseId)}` : ""}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `無法同步地基追蹤（${response.status}）`);
    return data;
  }
  const message = text => { $("#pageMessage").textContent = text; };
  function render() {
    const active = items.filter(item => !domain.resolved(item));
    $("#activeCount").textContent = active.length;
    $("#attentionCount").textContent = active.filter(item => domain.attention(item).rank <= 2).length;
    $("#unremindedCount").textContent = active.filter(item => !item.reminderCount).length;
    $("#achievedCount").textContent = items.filter(item => item.status === "achieved").length;
    const filter = $("#filter").value, search = $("#search").value.trim();
    const visible = items.filter(item => {
      if (editorContext) return item.memberName === editorContext.memberName;
      if (selectedId) return item.id === selectedId;
      if (params.get("case") && item.caseId !== params.get("case")) return false;
      if (filter === "active" && domain.resolved(item)) return false;
      if (filter === "mine" && (domain.resolved(item) || ![item.leadName, ...(item.companionNames || [])].includes(session.name))) return false;
      if (filter === "attention" && domain.attention(item).rank > 2) return false;
      return !search || `${item.memberName} ${item.title}`.includes(search);
    }).sort((a, b) => domain.attention(a).rank - domain.attention(b).rank || a.nextCheckOn.localeCompare(b.nextCheckOn));
    $("#foundationList").innerHTML = (selectedId || params.get("case") ? '<p>目前顯示指定地基／案件。<a href="renewal-foundations.html">查看全部追蹤</a></p>' : "") + (visible.length ? visible.map(item => {
      const attention = domain.attention(item);
      return `<article class="foundation-card" id="foundation-${esc(item.id)}"><div class="card-head"><div><span class="member-name">${esc(item.memberName)}</span><h2>${esc(item.title)}</h2></div><span class="badge ${attention.rank === 0 ? "urgent" : attention.rank <= 2 ? "warning" : domain.resolved(item) ? "done" : ""}">${esc(attention.label)}</span></div>
        <div class="facts"><span>條件期限 <b>${esc(item.dueOn)}</b></span><span>${item.kind === "manual" ? "下次追蹤" : "續約起算"} <b>${esc(item.kind === "manual" ? item.nextCheckOn : item.startOn)}</b></span><span>${esc(domain.labels[item.status])}</span><span>${item.origin === "legacy" ? "既有地基補登" : "續約訪談設定"}</span></div>
        ${item.canReadDetail ? `<div class="criterion">${esc(item.criterion)}<br><b>${esc(domain.progressText(item))}</b></div>` : `<p>${esc(domain.progressText(item))}</p>`}
        <div class="facts"><span>主責 ${esc(item.leadName)}</span><span>陪同 ${esc(item.companionNames?.join("、") || "無")}</span><span>${item.reminderCount ? `已記錄 ${esc(item.reminderCount)} 次提醒・最近 ${esc(item.lastRemindedOn)}` : "尚無實際提醒紀錄"}</span></div>
        <div class="card-actions">${item.canReadDetail ? `<button data-detail="${esc(item.id)}">查看歷程</button>${item.canRecord && (!domain.resolved(item) || manager) ? `<button data-record="${esc(item.id)}">${domain.resolved(item) ? "重新開啟" : "記錄提醒／進度"}</button>` : ""}${!domain.resolved(item) ? `<button data-copy="${esc(item.id)}">複製提醒文字</button>` : ""}` : ""}${manager ? `<button data-add="${esc(item.id)}">＋ 新增此會員地基</button>` : ""}${manager && !domain.resolved(item) ? `<button data-edit="${esc(item.id)}">調整條件／指派</button>` : ""}</div></article>`;
    }).join("") : '<div class="empty"><b>目前範圍沒有地基追蹤</b><p>新約定從續約訪談設定；使用系統前已有約定，副主席可使用「補登既有地基」。</p></div>');
  }
  async function load() {
    const data = await api();
    items = data.items;
    sources = data.sources;
    members = data.members || [];
    people = data.people;
    render();
    window.dispatchEvent(new CustomEvent("fulian:foundation-editor-ready"));
  }
  function definitionFields() {
    const kind = $("#kind").value, manual = kind === "manual";
    $("#automaticFields").hidden = manual;
    $("#startOn").required = !manual;
    $("#targetField").hidden = kind === "quarterly_workshop";
    $("#targetField").firstChild.textContent = kind === "visitors" ? "累計來賓目標（位）" : "每月來賓目標（位）";
    $("#target").required = !manual && kind !== "quarterly_workshop";
    $("#manualCheckField").hidden = !manual;
    $("#nextCheckOn").required = manual;
    $("#criterion").required = manual;
    $("#criterionLabel").firstChild.textContent = manual ? "完成標準（必填）" : "完成標準（選填）";
    $("#extraDefinitionSummary").textContent = manual ? "條件說明（請填完成標準）" : "補充說明（選填）";
    if (manual) $("#extraDefinition").open = true;
    const suggested = domain.suggestedText({ kind, target: $("#target").value });
    $("#title").placeholder = `留白使用「${suggested.title}」`;
    $("#scheduleHint").textContent = kind === "visitors" ? "從續約日起累計正式 PALMS，在設定期限前 6 個月開始持續追蹤。" : kind === "manual" ? "依個案約定設定追蹤日期。" : "從續約日起，每月／每 3 個月各自檢視；前期未完成項目會持續保留。";
  }
  function openDefinition(item = null, legacy = false, previous = null) {
    const shared = item || previous;
    editing = item;
    creatingLegacy = item ? item.origin === "legacy" : legacy;
    creationId = crypto.randomUUID();
    $("#definitionForm").reset();
    $("#definitionError").textContent = "";
    $("#extraDefinition").open = Boolean(item);
    $("#saveAndAddFoundation").hidden = Boolean(item);
    $("#definitionTitle").textContent = item ? "調整地基與追蹤指派" : creatingLegacy ? "補登既有地基" : "新增一項地基";
    $("#sourceTaskField").hidden = creatingLegacy;
    $("#sourceTaskId").required = !creatingLegacy;
    $("#legacyMemberField").hidden = !creatingLegacy;
    $("#memberId").required = creatingLegacy;
    $("#memberId").disabled = Boolean(item) || !creatingLegacy;
    $("#memberId").innerHTML = option("", "請選擇會員") + members.map(member => option(member.id, member.name)).join("");
    if (item && !members.some(member => member.id === item.memberId)) $("#memberId").innerHTML += option(item.memberId, item.memberName);
    $("#memberId").value = shared?.memberId || "";
    $("#legacyHint").hidden = !creatingLegacy;
    $("#sourceTaskId").innerHTML = option("", "請選擇續約案件") + sources.map(source => option(source.id, `${source.memberName}・${source.caseId}`)).join("");
    $("#sourceTaskId").value = sources.find(source => source.caseId === (item?.caseId || editorContext?.caseId || params.get("case") || previous?.caseId))?.id || "";
    $("#sourceTaskId").disabled = Boolean(creatingLegacy || item || editorContext || params.get("case"));
    $("#kind").value = item?.kind || "monthly_visitors";
    $("#kind").disabled = Boolean(item);
    $("#startOn").value = shared?.startOn || "";
    $("#startOn").readOnly = Boolean(item);
    $("#target").value = item?.target || 1;
    for (const key of ["title", "criterion", "source", "dueOn", "nextCheckOn"]) $(`#${key}`).value = item?.[key] || "";
    if (item?.titleGenerated) $("#title").value = "";
    if (item?.criterionGenerated) $("#criterion").value = "";
    if (!item && previous) for (const key of ["dueOn", "nextCheckOn", "source"]) $(`#${key}`).value = previous[key] || "";
    for (const [key, value] of [["leadId", shared?.leadId], ["companionOne", shared?.companionIds?.[0]], ["companionTwo", shared?.companionIds?.[1]]]) {
      $(`#${key}`).innerHTML = option("", key === "leadId" ? "請選擇主責" : "無") + people.map(person => option(person.id, person.name)).join("");
      $(`#${key}`).value = people.some(person => person.id === value) ? value : "";
    }
    $("#amendReasonLabel").hidden = !item;
    $("#amendReason").required = Boolean(item);
    definitionFields();
    $("#definitionDialog").showModal();
  }
  function recordFields() {
    const action = $("#action").value;
    $("#reminderFields").hidden = action !== "reminder";
    $("#contactedOn").required = $("#response").required = action === "reminder";
    $("#quarterFields").hidden = action !== "confirm-quarter";
    $("#attendedOn").required = action === "confirm-quarter";
    $("#statusField").hidden = !["progress", "resolve", "confirm-quarter"].includes(action);
    $("#recordStatus").innerHTML = (action === "confirm-quarter" ? ["achieved", "unmet"] : action === "resolve" ? (["quarterly_workshop", "monthly_visitors"].includes(recording.kind) ? ["cancelled"] : ["achieved", "unmet", "cancelled"]) : ["tracking", "reported"]).map(status => option(status, domain.labels[status])).join("");
    $("#nextField").hidden = !(manager || recording.isLead) || ["resolve", "confirm-quarter"].includes(action) || recording.kind !== "manual";
    $("#recordNextCheckOn").required = !$("#nextField").hidden;
  }
  function openRecord(item) {
    recording = item;
    $("#recordForm").reset();
    $("#recordError").textContent = "";
    $("#recordItem").textContent = `${item.memberName}・${item.title}`;
    const actions = domain.resolved(item) ? ["reopen"] : ["reminder", "note"];
    if (!domain.resolved(item)) {
      if ((manager || item.isLead) && item.status !== "unmet" && !["quarterly_workshop", "monthly_visitors"].includes(item.kind)) actions.push("progress");
      if (manager && item.kind === "quarterly_workshop" && domain.cycles(item).length) actions.unshift("confirm-quarter");
      if (manager) actions.push("resolve");
      if (manager && item.status === "unmet") actions.push("reopen");
    }
    $("#action").innerHTML = actions.map(action => option(action, eventLabels[action])).join("");
    $("#contactedOn").value = calendar.dateInput();
    $("#contactedOn").max = calendar.dateInput();
    $("#recordNextCheckOn").value = item.nextCheckOn;
    $("#periodKey").innerHTML = domain.cycles(item).map(cycle => option(cycle.key, `${cycle.label}${cycle.result?.status === "achieved" ? "・已確認" : "・待確認"}`)).join("");
    $("#periodKey").value = domain.cycles(item).find(cycle => cycle.result?.status !== "achieved")?.key || domain.cycles(item)[0]?.key || "";
    recordFields();
    $("#recordDialog").showModal();
  }
  async function save(body, dialog, errorNode) {
    if (busy) return;
    busy = true;
    const buttons = [...dialog.querySelectorAll('[type="submit"]')];
    buttons.forEach(button => { button.disabled = true; });
    errorNode.textContent = "";
    try {
      await api(body);
      dialog.close();
      message("已儲存追蹤紀錄。");
      try { await load(); } catch (error) { message(`紀錄已儲存，但清單更新失敗：${error.message}。請重新整理，勿重複新增。`); }
      return true;
    } catch (error) { errorNode.textContent = `${error.message}。輸入內容仍保留；若是版本衝突，請關閉後重新整理再填寫。`; }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  $("#definitionForm").onsubmit = async event => {
    event.preventDefault();
    const body = Object.fromEntries(["sourceTaskId", "title", "criterion", "source", "dueOn", "nextCheckOn", "leadId", "kind", "startOn", "target"].map(key => [key, $(`#${key}`).value]));
    body.origin = creatingLegacy ? "legacy" : "renewal";
    if (creatingLegacy) { body.memberId = $("#memberId").value; delete body.sourceTaskId; }
    body.companionIds = [$("#companionOne").value, $("#companionTwo").value].filter(Boolean);
    body.note = $("#amendReason").value;
    Object.assign(body, { action: editing ? "amend" : "create", id: editing?.id || creationId, revision: editing?.revision });
    const addNext = event.submitter?.id === "saveAndAddFoundation";
    const saved = await save(body, $("#definitionDialog"), $("#definitionError"));
    if (saved && addNext) {
      const source = sources.find(source => source.id === body.sourceTaskId);
      openDefinition(null, body.origin === "legacy", { ...body, caseId: source?.caseId });
    }
  };
  $("#recordForm").onsubmit = event => {
    event.preventDefault();
    const body = { id: recording.id, revision: recording.revision, action: $("#action").value, note: $("#note").value, status: $("#recordStatus").value };
    if (body.action === "confirm-quarter") Object.assign(body, { periodKey: $("#periodKey").value, attendedOn: $("#attendedOn").value });
    if (body.action === "reminder") Object.assign(body, { contactedOn: $("#contactedOn").value, channel: $("#channel").value, response: $("#response").value });
    if (!$("#nextField").hidden) body.nextCheckOn = $("#recordNextCheckOn").value;
    save(body, $("#recordDialog"), $("#recordError"));
  };
  async function detail(item) {
    $("#detailContent").textContent = "正在讀取完整歷程…";
    $("#detailDialog").showModal();
    try {
      const { events } = await api(null, `?id=${encodeURIComponent(item.id)}`);
      $("#detailContent").innerHTML = `<h3>${esc(item.memberName)}・${esc(item.title)}</h3><p class="criterion">${esc(item.criterion)}</p><p>設定來源：${item.origin === "legacy" ? "既有地基補登" : "續約訪談"}・登錄時間：${esc(calendar.formatTaipeiTimestamp(item.createdAt, { year: true }))}</p><h4>議定依據與確認紀錄</h4><p class="detail-source">${esc(item.source || "未填寫補充依據")}</p><h4>追蹤歷程</h4>` + events.map(event => `<article class="history-item"><b>${esc(eventLabels[event.event_type])}</b> <small>${esc(event.actor_name)}・${esc(calendar.formatTaipeiTimestamp(event.created_at, { year: true, seconds: true }))}</small><p>${esc(event.detail.note)}</p>${event.detail.periodKey ? `<p>檢視期起日：${esc(event.detail.periodKey)}・參加日期：${esc(event.detail.attendedOn || "未達成")}</p>` : ""}${event.detail.contactedOn ? `<p>實際提醒：${esc(event.detail.contactedOn)}・${esc(event.detail.channel)}<br>會員回覆：${esc(event.detail.response)}</p>` : ""}${event.previous_data?.status !== event.next_data.status ? `<p>結果：${esc(domain.labels[event.next_data.status])}</p>` : ""}${event.event_type === "amend" ? `<details><summary>查看調整前後內容</summary><pre>${esc(JSON.stringify({ 原紀錄: event.previous_data, 新紀錄: event.next_data }, null, 2))}</pre></details>` : ""}<p>下次追蹤：${esc(event.next_data.nextCheckOn)}・主責：${esc(event.next_data.leadName)}</p></article>`).join("");
    } catch (error) { $("#detailContent").textContent = error.message; }
  }
  $("#foundationList").onclick = async event => {
    const button = event.target.closest("button");
    if (!button) return;
    const key = ["detail", "record", "copy", "edit", "add"].find(key => button.dataset[key]);
    const item = items.find(item => item.id === button.dataset[key]);
    if (!item) return;
    if (key === "detail") return detail(item);
    if (key === "edit") return openDefinition(item);
    if (key === "add") return openDefinition(null, !editorContext && !params.get("case") && item.origin === "legacy", item);
    if (key === "record") return openRecord(item);
    try { await navigator.clipboard.writeText(domain.reminderText(item)); message("提醒文字已複製。實際聯繫會員後，請使用「記錄提醒／進度」保存提醒與回覆。"); }
    catch { message("瀏覽器無法複製，請確認剪貼簿權限後重試。"); }
  };
  document.querySelectorAll("[data-close]").forEach(button => { button.onclick = () => { if (!busy) button.closest("dialog").close(); }; });
  document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); }));
  $("#action").onchange = recordFields;
  $("#kind").onchange = definitionFields;
  $("#target").oninput = definitionFields;
  $("#recordStatus").onchange = () => { $("#attendedOn").required = $("#action").value === "confirm-quarter" && $("#recordStatus").value === "achieved"; };
  $("#filter").onchange = () => { selectedId = ""; render(); };
  $("#search").oninput = () => { selectedId = ""; render(); };
  $("#createFoundation").hidden = !manager || !(editorContext || params.get("case"));
  $("#importLegacyFoundation").hidden = !manager || Boolean(editorContext || params.get("case"));
  $("#importLegacyFoundation").onclick = () => openDefinition(null, true);
  $("#createFoundation").onclick = () => openDefinition();
  $("#refresh").onclick = async () => { try { await load(); message(""); } catch (error) { message(error.message); } };
  window.FulianFoundationPage = { refresh: load, snapshotText: memberName => domain.summaryText(items.filter(item => item.memberName === memberName)) };
  try { await load(); }
  catch (error) { message(`地基追蹤尚未載入：${error.message}`); $("#foundationList").textContent = "目前無法確認追蹤狀態，請重新整理或請管理員確認服務。"; }
})();
