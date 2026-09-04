(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
  const session = FulianAuth.getSession();
  const domain = FulianCaseDomain;
  const files = FulianCaseFiles;
  const caseId = new URLSearchParams(location.search).get("case");
  const typeMap = {
    renewal: "續約／終期輔導",
    new: "新會員訪談",
    midterm: "期中輔導",
    industry: "轉換行業別訪談",
    departure: "離會訪談",
    special: "特定會員關懷"
  };

  function parse(value, fallback) {
    try { return JSON.parse(value || "") ?? fallback; } catch { return fallback; }
  }

  function dateLabel(value) {
    if (!value) return "未記錄";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function assignmentLabel(assignments) {
    return (Array.isArray(assignments) ? assignments : []).map(item => `${item.name || "未記錄"}${item.role === "lead" ? "（主責）" : "（陪訪）"}`).join("、") || "未記錄";
  }

  function assignmentEvent(item) {
    const previous = assignmentLabel(item.previousAssignments);
    const next = assignmentLabel(item.newAssignments);
    const actor = item.actor ? `・操作人：${item.actor}` : "";
    if (item.eventType === "created") return `建立工作指派：${next}${actor}`;
    if (item.eventType === "handover_pending") return `年度換屆列入待交接；原指派：${previous}${actor}`;
    if (item.eventType === "handover_reassigned") return `年度換屆完成接手：${previous} → ${next}${actor}`;
    return `工作指派異動：${previous} → ${next}${actor}`;
  }

  function fact(label, value) {
    return `<div><dt>${esc(label)}</dt><dd>${esc(value || "未記錄")}</dd></div>`;
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
  }

  function decisionOf(state) {
    const snapshot = Array.isArray(state.voterSnapshot) ? state.voterSnapshot : [];
    const summary = domain.voteSummary(state, snapshot.length);
    const statusLabel = summary.status === "waiting" ? "未達門檻" : summary.status === "tie" ? "同票未形成決議" : summary.status === "pass" ? "通過" : "不通過";
    return { snapshot, ...summary, statusLabel };
  }

  function renderDecision(task, state) {
    if (!domain.requiresDecisionWorkflow(task)) {
      $("#decisionSection").hidden = true;
      $("#advisorSection").hidden = true;
      return;
    }
    $("#decisionSection").hidden = false;
    const decision = decisionOf(state);
    $("#decisionSummary").innerHTML = `
      <article><small>結案決議</small><strong>${esc(decision.statusLabel)}</strong></article>
      <article><small>已投票／門檻</small><strong>${decision.total}／${decision.quorum}</strong></article>
      <article><small>同意</small><strong>${decision.approve}</strong></article>
      <article><small>不同意</small><strong>${decision.reject}</strong></article>`;
    const feedback = Object.entries(state.feedback || {}).filter(([, text]) => String(text).trim());
    $("#feedbackList").innerHTML = feedback.length
      ? feedback.map(([name, text]) => `<article><b>${esc(name)}</b><p>${esc(text)}</p></article>`).join("")
      : '<div class="empty-record">沒有保存委員回饋</div>';
    $("#voteList").innerHTML = decision.snapshot.length
      ? `<h3>投票資格與結果</h3>${decision.snapshot.map(name => {
          const vote = state.votes?.[name];
          return `<span><b>${esc(name)}</b><em class="${vote || "pending"}">${vote === "approve" ? "同意" : vote === "reject" ? "不同意" : "未投票"}</em></span>`;
        }).join("")}`
      : '<div class="empty-record">沒有保存投票資格快照</div>';
    const downloadButton = $("#downloadVoteResult");
    downloadButton.disabled = !["pass", "reject"].includes(decision.status);
    downloadButton.onclick = async () => {
      if (downloadButton.disabled) return;
      downloadButton.disabled = true;
      const original = downloadButton.textContent;
      downloadButton.textContent = "正在產生 PNG…";
      try {
        await window.FulianVoteResultImage.download(window.FulianVoteResultImage.createReport({
          state,
          caseType: task.type,
          applicant: task.member,
          profession: task.profession || state.form?.profession,
          deadlineAt: state.form?.voteDeadline,
          approveLabel: task.type === "new" ? "同意入會" : task.type === "industry" ? "同意轉換" : "同意續約",
          rejectLabel: task.type === "new" ? "不同意入會" : task.type === "industry" ? "不同意轉換" : "不同意續約",
        }));
        toast("投票結果圖已下載");
      } catch (error) {
        toast(error.message || "投票結果圖下載失敗");
      } finally {
        downloadButton.textContent = original;
        downloadButton.disabled = !["pass", "reject"].includes(decision.status);
      }
    };
    const form = state.form || {};
    const advisorLabel = state.advisorStatus === "confirmed" ? "同意會員委員會決議" : state.advisorStatus === "returned" ? "退回補充資料" : "尚未回覆";
    $("#advisorFacts").innerHTML = [
      fact("三長群發送", state.leadersSent ? "已登記發送" : "未登記"),
      fact("董事顧問確認", advisorLabel),
      fact("正式公告群", state.resultAnnouncementSent ? `${dateLabel(state.resultAnnouncementSentAt)}・${state.resultAnnouncementTargetName || "正式公告群"}` : decision.status === "reject" ? "不通過案件不公告" : "未發布"),
      fact("確認備註", state.advisorNote),
      ...(task.type === "renewal" ? [
        fact("過去一年培訓", form.annualTraining),
        fact("過去一年來賓", form.annualVisitors)
      ] : [])
    ].join("");
  }

  function renderRecordOnlySummary(task, draft) {
    const isDeparture = task.type === "departure";
    $("#departureInsightsSection").hidden = !isDeparture;
    $("#activityStep").textContent = isDeparture ? "04" : domain.requiresDecisionWorkflow(task) ? "05" : "03";
    if (!isDeparture) return;
    $("#archiveDescription").textContent = "保存離會訪談 Word、分會營運改善摘要與案件歷程；本案不含委員回饋、投票、董事顧問確認或公告流程。";
    $("#departureInsights").innerHTML = [
      fact("改善議題分類", draft.reasonCategory),
      fact("分會營運改善摘要", draft.committeeSummary),
      fact("後續優化行動與追蹤", draft.internalNotes)
    ].join("");
  }

  async function loadWord(state) {
    const button = $("#downloadWord");
    try {
      const file = await files.getCaseFile({ caseId, indexedDb: indexedDB });
      if (!file) {
        $("#wordName").textContent = state.wordName || "尚未找到 Word";
        $("#wordStatus").textContent = "此瀏覽器沒有保存附件；可能是在其他裝置完成，或附件已被清除。";
        return;
      }
      $("#wordName").textContent = file.name || state.wordName || "訪談紀錄.docx";
      $("#wordStatus").textContent = "已找到此瀏覽器保存的正式附件";
      button.disabled = false;
      button.onclick = () => {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name || state.wordName || "訪談紀錄.docx";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast("已開始下載保存檔");
      };
    } catch (error) {
      $("#wordStatus").textContent = `附件讀取失敗：${error.message}`;
    }
  }

  async function init() {
    await window.FulianTaskStore.ready;
    await window.FulianCaseStateStore.ready;
    if (!["vp", "admin"].includes(session?.role)) {
      $("#accessNotice").hidden = false;
      $("#accessNotice").innerHTML = "<b>只有副主席與 Admin 可以查閱結案資料</b><span>會員委員的工作範圍為訪談、回饋與投票。</span>";
      $("#archiveStatus").textContent = "無查閱權限";
      return;
    }
    const tasks = parse(localStorage.getItem(domain.TASK_STORAGE_KEY), []);
    const task = tasks.find(item => item.id === caseId);
    if (!caseId || !task) {
      $("#accessNotice").hidden = false;
      $("#accessNotice").innerHTML = "<b>找不到這筆案件</b><span>案件可能已被刪除，或網址中的案件編號不完整。</span>";
      $("#archiveStatus").textContent = "找不到資料";
      return;
    }
    const state = domain.readWorkflow(localStorage, caseId) || {};
    if (!domain.isClosed(task, state)) {
      $("#accessNotice").hidden = false;
      $("#accessNotice").innerHTML = `<b>這筆案件尚未結案</b><span><a href="case-workflow.html?case=${encodeURIComponent(caseId)}">返回案件流程</a></span>`;
      $("#archiveStatus").textContent = "尚未結案";
      return;
    }
    $("#archiveContent").hidden = false;
    $("#archiveStatus").textContent = "已結案存檔";
    $("#pageTitle").textContent = `${task.member}・${typeMap[task.type] || "會員案件"}`;
    const stateForm = state.form || {};
    const draft = domain.readDraft(localStorage, task) || {};
    $("#caseFacts").innerHTML = [
      fact("案件編號", task.id),
      fact("案件類型", typeMap[task.type]),
      fact("會員／申請者", task.member),
      fact("專業類別", task.profession),
      fact("主要負責人", task.lead),
      fact("陪訪委員", (task.companions || []).join("、") || "無"),
      fact("訪談完成", dateLabel(state.interviewCompletedAt || stateForm.interviewDate)),
      fact("結案時間", dateLabel(task.completedAt || state.interviewCompletedAt)),
      fact("結案確認人", task.completedBy),
      fact("保存檔名", state.wordName)
    ].join("");
    renderRecordOnlySummary(task, draft);
    renderDecision(task, state);
    const workflowLog = (Array.isArray(state.log) ? state.log : []).map((item, index) => ({ text: item.text, time: item.time || "", sortTime: Date.parse(item.time || "") || 0, index }));
    const assignmentLog = (Array.isArray(task.assignmentHistory) ? task.assignmentHistory : []).map((item, index) => ({ text: assignmentEvent(item), time: dateLabel(item.occurredAt), sortTime: Date.parse(item.occurredAt || "") || 0, index: workflowLog.length + index }));
    const log = [...workflowLog, ...assignmentLog].sort((a, b) => b.sortTime - a.sortTime || b.index - a.index);
    $("#activityLog").innerHTML = log.length
      ? log.map(item => `<li><i></i><div><b>${esc(item.text)}</b><span>${esc(item.time || "")}</span></div></li>`).join("")
      : '<li class="empty-record">沒有保存案件歷程</li>';
    await loadWord(state);
  }

  init();
})();
