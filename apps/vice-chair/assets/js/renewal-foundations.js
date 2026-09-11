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
  const eventLabels = { delete: "刪除地基", restore: "復原地基", create: "建立地基", amend: "調整條件／指派", note: "補充紀錄", reminder: "已實際提醒", progress: "回報進度", resolve: "人工確認結果", reopen: "重新開啟", "confirm-quarter": "確認本期工作坊" };
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
    const selected = items.find(item => item.id === selectedId);
    const memberKey = params.get("member") || selected?.memberId || selected?.memberName;
    const groups = domain.groupByMember(items).filter(group => {
      if (editorContext && group.memberName !== editorContext.memberName) return false;
      if (memberKey && group.key !== memberKey) return false;
      if (params.get("case") && !group.items.some(item => item.caseId === params.get("case"))) return false;
      return !search || group.items.some(item => `${item.memberName} ${item.title}`.includes(search));
    }).map(group => ({ ...group, items: group.items.filter(item => filter === "deleted" || filter === "all" || domain.resolved(item) === false || memberKey || editorContext) }))
      .filter(group => group.items.length && (filter !== "mine" || group.items.some(item => !domain.resolved(item) && [item.leadName, ...(item.companionNames || [])].includes(session.name))) && (filter !== "attention" || group.items.some(item => domain.attention(item).rank <= 2)))
      .sort((a, b) => Math.min(...a.items.map(item => domain.attention(item).rank)) - Math.min(...b.items.map(item => domain.attention(item).rank)));
    $("#foundationList").innerHTML = (memberKey || params.get("case") ? '<p>目前顯示指定會員的地基。<a href="renewal-foundations.html">查看全部追蹤</a></p>' : "") + (groups.length ? groups.map(group => `<article class="foundation-card"><div class="card-head"><div><h2 class="member-name">${esc(group.memberName)}</h2><span>${group.items.length} 項地基・${group.items.filter(item => domain.attention(item).rank <= 2).length} 項需跟進</span></div>${group.items.some(item => item.canReadDetail && !item.deletedAt) ? `<button data-copy-member="${esc(group.key)}">複製提醒文字</button>` : ""}${manager && !group.items[0].deletedAt ? `<button data-add="${esc(group.items[0].id)}">＋ 新增地基</button>` : ""}</div><div class="member-foundations">${group.items.map(item => {
      const attention = domain.attention(item);
      return `<section class="foundation-condition" id="foundation-${esc(item.id)}"><div class="card-head"><h3>${esc(item.title)}</h3><span class="badge ${attention.rank === 0 ? "urgent" : attention.rank <= 2 ? "warning" : domain.resolved(item) ? "done" : ""}">${esc(item.deletedAt ? "已刪除" : attention.label)}</span></div><p class="condition-progress">${esc(domain.compactProgress(item))}</p><div class="facts"><span>主責 ${esc(item.leadName)}</span><span>${item.reminderCount ? `已提醒 ${esc(item.reminderCount)} 次・最近 ${esc(item.lastRemindedOn)}` : "尚無提醒紀錄"}</span></div><details><summary>各期進度與操作</summary><div class="criterion">${item.canReadDetail ? esc(item.criterion) + "<br>" : ""}${esc(domain.progressText(item))}</div><div class="facts"><span>起算 ${esc(item.startOn || item.nextCheckOn)}</span><span>期限 ${esc(item.kind === "flexible" ? calendar.shiftDayKey(item.dueOn, -1) : item.dueOn)}</span><span>陪同 ${esc(item.companionNames?.join("、") || "無")}</span><span>${item.origin === "legacy" ? "既有地基補登" : "續約訪談設定"}</span></div><div class="card-actions">${item.canReadDetail && item.canRecord && !item.deletedAt && (!domain.resolved(item) || manager) ? `<button data-record="${esc(item.id)}">${domain.resolved(item) ? "重新開啟" : "記錄提醒／進度"}</button>` : ""}${manager && !item.deletedAt ? `<button data-edit="${esc(item.id)}">調整條件／指派</button>` : ""}${item.canReadDetail ? `<button data-detail="${esc(item.id)}">查看歷程</button>` : ""}${manager && !item.deletedAt ? `<button data-delete="${esc(item.id)}">刪除地基</button>` : ""}${manager && item.deletedAt ? `<button data-restore="${esc(item.id)}">復原地基</button>` : ""}</div></details></section>`;
    }).join("")}</div></article>`).join("") : '<div class="empty"><b>目前範圍沒有地基追蹤</b><p>新約定從續約訪談設定；既有約定可使用「補登既有地基」。</p></div>');
  }

  async function load() {
    const data = await api(null, $("#filter").value === "deleted" ? "?deleted=1" : "");
    items = data.items;
    sources = data.sources;
    members = data.members || [];
    people = data.people;
    render();
    window.dispatchEvent(new CustomEvent("fulian:foundation-editor-ready"));
  }
  function definitionFields() {
    const kind = $("#kind").value, manual = kind === "manual", flexible = kind === "flexible";
    const recurring = $("#period").value !== "cumulative";
    $("#flexibleFields").hidden = !flexible;
    $("#intervalField").hidden = !flexible || $("#period").value !== "custom";
    $("#intervalMonths").required = !$("#intervalField").hidden;
    $("#leadField").hidden = !flexible || recurring;
    $("#intervalMonths").disabled = $("#intervalField").hidden || Boolean(editing);
    $("#metric").disabled = $("#period").disabled = !flexible || Boolean(editing);
    $("#leadMonths").disabled = $("#leadField").hidden;
    $("#dueOnLabel").firstChild.textContent = flexible ? "地基結束日（含當日）" : "地基期限／下次續約日";
    $("#target").step = flexible && $("#metric").value === "ceu" ? "0.01" : "1";
    $("#target").min = $("#target").step;
    $("#automaticFields").hidden = manual;
    $("#startOn").required = !manual;
    $("#targetField").hidden = kind === "quarterly_workshop";
    $("#targetField").firstChild.textContent = flexible ? `${recurring ? "每期" : "累計"}目標（${domain.metricInfo({ metric: $("#metric").value }).unit}）` : kind === "visitors" ? "累計來賓目標（位）" : "每月來賓目標（位）";
    $("#target").required = !manual && kind !== "quarterly_workshop";
    $("#target").disabled = manual || kind === "quarterly_workshop";
    $("#startOn").disabled = manual;
    $("#manualCheckField").hidden = !manual;
    $("#nextCheckOn").required = manual;
    $("#nextCheckOn").disabled = !manual;
    $("#criterion").required = manual;
    $("#criterionLabel").firstChild.textContent = manual ? "完成標準（必填）" : "完成標準（選填）";
    $("#extraDefinitionSummary").textContent = manual ? "條件說明（請填完成標準）" : "補充說明（選填）";
    if (manual) $("#extraDefinition").open = true;
    const suggested = domain.suggestedText({ kind, target: $("#target").value, metric: $("#metric").value, cadence: recurring ? "recurring" : "cumulative", intervalMonths: $("#period").value === "custom" ? $("#intervalMonths").value : $("#period").value });
    $("#title").placeholder = `留白使用「${suggested.title}」`;
    $("#scheduleHint").textContent = flexible ? `${recurring ? "各期從地基起算日起計算，前期未完成會持續保留。" : "在起算日至結束日內累計，可設定整個會籍或指定半年等期間。"}${$("#metric").value === "ceu" ? "培訓採 PALMS 教育單位，不是紅綠燈換算分數。" : $("#metric").value === "workshop" ? "工作坊由副主席核對場次及參加證據。" : "來賓以可完整核對期間的 PALMS 計算。"}` : kind === "visitors" ? "從續約日起累計正式 PALMS，在設定期限前 6 個月開始持續追蹤。" : kind === "manual" ? "依個案約定設定追蹤日期。" : "從續約日起，每月／每 3 個月各自檢視；前期未完成項目會持續保留。";
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
    $("#kind").value = item?.kind || "flexible";
    $("#kind").disabled = Boolean(item);
    for (const option of $("#kind").options) if (!["flexible", "manual"].includes(option.value)) option.disabled = !item;
    $("#metric").value = item?.metric || "visitors";
    const interval = String(item?.intervalMonths || 0);
    $("#period").value = item?.cadence === "recurring" ? (["1", "3", "6", "12"].includes(interval) ? interval : "custom") : "cumulative";
    $("#intervalMonths").value = item?.intervalMonths || 2;
    $("#leadMonths").value = item?.leadMonths || 0;
    for (const key of ["metric", "period", "intervalMonths"]) $(`#${key}`).disabled = Boolean(item);
    $("#startOn").value = shared?.startOn || "";
    $("#startOn").readOnly = false;
    $("#scheduleChangeHint").hidden = !item || item.kind === "manual";
    $("#target").value = item?.target || 1;
    for (const key of ["title", "criterion", "source", "dueOn", "nextCheckOn"]) $(`#${key}`).value = item?.[key] || "";
    if (item?.titleGenerated) $("#title").value = "";
    if (item?.criterionGenerated) $("#criterion").value = "";
    if (!item && previous) for (const key of ["dueOn", "nextCheckOn", "source"]) $(`#${key}`).value = previous[key] || "";
    if ($("#kind").value === "flexible" && $("#dueOn").value) $("#dueOn").value = calendar.shiftDayKey($("#dueOn").value, -1);
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
    $("#completedCount").required = action === "confirm-quarter";
    $("#statusField").hidden = !["progress", "resolve", "confirm-quarter"].includes(action);
    $("#recordStatus").innerHTML = (action === "confirm-quarter" ? ["achieved", "unmet"] : action === "resolve" ? ((domain.isRecurring(recording) || domain.isWorkshop(recording)) ? ["cancelled"] : ["achieved", "unmet", "cancelled"]) : ["tracking", "reported"]).map(status => option(status, domain.labels[status])).join("");
    $("#nextField").hidden = !(manager || recording.isLead) || ["resolve", "confirm-quarter", "delete", "restore"].includes(action) || recording.kind !== "manual";
    $("#recordNextCheckOn").required = !$("#nextField").hidden;
  }
  function openRecord(item, operation = null) {
    recording = item;
    $("#recordForm").reset();
    $("#recordError").textContent = "";
    $("#recordItem").textContent = `${item.memberName}・${item.title}`;
    $("#recordOperationHint").textContent = operation === "delete" ? "刪除後不再出現在首頁、月會及訪談追蹤；原始紀錄保留，可從已刪除清單復原。請填寫刪除原因。" : operation === "restore" ? "復原後回到刪除前的狀態與原本期程。請填寫復原原因。" : "";
    const actions = operation ? [operation] : domain.resolved(item) ? ["reopen"] : ["reminder", "note"];
    if (!operation && !domain.resolved(item)) {
      if ((manager || item.isLead) && item.status !== "unmet" && !domain.isRecurring(item) && !domain.isWorkshop(item)) actions.push("progress");
      if (manager && domain.isWorkshop(item) && domain.cycles(item).length) actions.unshift("confirm-quarter");
      if (manager) actions.push("resolve");
      if (manager && item.status === "unmet") actions.push("reopen");
    }
    $("#action").innerHTML = actions.map(action => option(action, eventLabels[action])).join("");
    $("#contactedOn").value = calendar.dateInput();
    $("#contactedOn").max = calendar.dateInput();
    $("#recordNextCheckOn").value = item.nextCheckOn;
    $("#periodKey").innerHTML = domain.cycles(item).map(cycle => option(cycle.key, `${cycle.label}${domain.cycleReached(item, cycle) ? "・已確認" : "・待確認"}`)).join("");
    $("#periodKey").value = domain.cycles(item).find(cycle => !domain.cycleReached(item, cycle))?.key || domain.cycles(item)[0]?.key || "";
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
    if (body.kind === "flexible") {
      body.metric = $("#metric").value;
      body.cadence = $("#period").value === "cumulative" ? "cumulative" : "recurring";
      body.intervalMonths = body.cadence === "recurring" ? Number($("#period").value === "custom" ? $("#intervalMonths").value : $("#period").value) : 0;
      body.leadMonths = body.cadence === "cumulative" ? Number($("#leadMonths").value) : 0;
      body.dueOn = calendar.shiftDayKey(body.dueOn, 1);
    }
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
    if (body.action === "confirm-quarter") Object.assign(body, { periodKey: $("#periodKey").value, attendedOn: $("#attendedOn").value, completedCount: $("#completedCount").value });
    if (body.action === "reminder") Object.assign(body, { contactedOn: $("#contactedOn").value, channel: $("#channel").value, response: $("#response").value });
    if (!$("#nextField").hidden) body.nextCheckOn = $("#recordNextCheckOn").value;
    save(body, $("#recordDialog"), $("#recordError"));
  };
  async function detail(item) {
    $("#detailContent").textContent = "正在讀取完整歷程…";
    $("#detailDialog").showModal();
    try {
      const { events } = await api(null, `?id=${encodeURIComponent(item.id)}`);
      $("#detailContent").innerHTML = `<h3>${esc(item.memberName)}・${esc(item.title)}</h3><p class="criterion">${esc(item.criterion)}</p><p>設定來源：${item.origin === "legacy" ? "既有地基補登" : "續約訪談"}・登錄時間：${esc(calendar.formatTaipeiTimestamp(item.createdAt, { year: true }))}</p><h4>議定依據與確認紀錄</h4><p class="detail-source">${esc(item.source || "未填寫補充依據")}</p><h4>追蹤歷程</h4>` + events.map(event => `<article class="history-item"><b>${esc(eventLabels[event.detail.operation || event.event_type])}</b> <small>${esc(event.actor_name)}・${esc(calendar.formatTaipeiTimestamp(event.created_at, { year: true, seconds: true }))}</small><p>${esc(event.detail.note)}</p>${event.detail.periodKey ? `<p>檢視期起日：${esc(event.detail.periodKey)}・參加日期：${esc(event.detail.attendedOn || "未達成")}</p>` : ""}${event.detail.contactedOn ? `<p>實際提醒：${esc(event.detail.contactedOn)}・${esc(event.detail.channel)}<br>會員回覆：${esc(event.detail.response)}</p>` : ""}${event.previous_data?.status !== event.next_data.status ? `<p>結果：${esc(domain.labels[event.next_data.status])}</p>` : ""}${event.event_type === "amend" ? window.FulianFoundationHistory.renderAmendment(event) : ""}<p>下次追蹤：${esc(event.next_data.nextCheckOn)}・主責：${esc(event.next_data.leadName)}</p></article>`).join("");
    } catch (error) { $("#detailContent").textContent = error.message; }
  }
  $("#foundationList").onclick = async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-copy-member")) {
      const text = domain.memberReminderText(items, button.dataset.copyMember);
      if (!text) return;
      try { await navigator.clipboard.writeText(text); message("已複製這位夥伴全部可查閱地基的提醒文字。實際聯繫後，再記錄提醒與回覆。"); }
      catch { message("瀏覽器無法複製，請確認剪貼簿權限後重試。"); }
      return;
    }
    const key = ["detail", "record", "edit", "add", "delete", "restore"].find(key => button.dataset[key]);
    const item = items.find(item => item.id === button.dataset[key]);
    if (!item) return;
    if (key === "detail") return detail(item);
    if (key === "edit") return openDefinition(item);
    if (key === "add") return openDefinition(null, !editorContext && !params.get("case") && item.origin === "legacy", item);
    if (key === "record") return openRecord(item);
    if (["delete", "restore"].includes(key)) return openRecord(item, key);
  };
  document.querySelectorAll("[data-close]").forEach(button => { button.onclick = () => { if (!busy) button.closest("dialog").close(); }; });
  document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); }));
  $("#action").onchange = recordFields;
  $("#kind").onchange = definitionFields;
  $("#target").oninput = definitionFields;
  for (const key of ["metric", "period", "intervalMonths", "leadMonths"]) $(`#${key}`).onchange = definitionFields;
  $("#recordStatus").onchange = () => { $("#completedCount").required = $("#attendedOn").required = $("#action").value === "confirm-quarter" && $("#recordStatus").value === "achieved"; };
  $("#deletedFilter").hidden = !manager;
  $("#filter").onchange = async () => { selectedId = ""; try { await load(); } catch (error) { items = []; render(); message(error.message); } };
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
