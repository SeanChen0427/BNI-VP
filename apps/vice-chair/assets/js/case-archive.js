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
      : date.toLocaleString("zh-TW", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
    const votes = Object.entries(state.votes || {}).filter(([name]) => snapshot.includes(name));
    const approve = votes.filter(([, vote]) => vote === "approve").length;
    const reject = votes.filter(([, vote]) => vote === "reject").length;
    const quorum = Math.floor(snapshot.length / 2) + 1;
    const status = votes.length < quorum ? "未達門檻" : approve === reject ? "同票未形成決議" : approve > reject ? "通過" : "不通過";
    return { snapshot, votes, approve, reject, quorum, status };
  }

  function renderDecision(task, state) {
    if (!domain.requiresDecisionWorkflow(task)) {
      $("#decisionSummary").innerHTML = '<div class="no-decision"><b>本案不需委員回饋及投票</b><span>訪談 Word 完成後即依規則結案。</span></div>';
      $("#feedbackList").hidden = true;
      $("#voteList").hidden = true;
      $("#advisorSection").hidden = true;
      return;
    }
    const decision = decisionOf(state);
    $("#decisionSummary").innerHTML = `
      <article><small>結案決議</small><strong>${esc(decision.status)}</strong></article>
      <article><small>已投票／門檻</small><strong>${decision.votes.length}／${decision.quorum}</strong></article>
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
    const form = state.form || {};
    const advisorLabel = state.advisorStatus === "confirmed" ? "同意會員委員會決議" : state.advisorStatus === "returned" ? "退回補充資料" : "尚未回覆";
    $("#advisorFacts").innerHTML = [
      fact("三長群發送", state.leadersSent ? "已登記發送" : "未登記"),
      fact("董事顧問確認", advisorLabel),
      fact("確認備註", state.advisorNote),
      ...(task.type === "renewal" ? [
        fact("過去一年培訓", form.annualTraining),
        fact("過去一年來賓", form.annualVisitors)
      ] : [])
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
    if (session?.role !== "vp") {
      $("#accessNotice").hidden = false;
      $("#accessNotice").innerHTML = "<b>只有副主席可以查閱結案資料</b><span>會員委員的工作範圍為訪談、回饋與投票。</span>";
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
    $("#caseFacts").innerHTML = [
      fact("案件編號", task.id),
      fact("案件類型", typeMap[task.type]),
      fact("會員／申請者", task.member),
      fact("專業類別", task.profession),
      fact("主要負責人", task.lead),
      fact("陪訪委員", (task.companions || []).join("、") || "無"),
      fact("訪談完成", dateLabel(state.interviewCompletedAt || stateForm.interviewDate)),
      fact("結案時間", dateLabel(task.completedAt || state.interviewCompletedAt)),
      fact("保存檔名", state.wordName)
    ].join("");
    renderDecision(task, state);
    const log = Array.isArray(state.log) ? state.log : [];
    $("#activityLog").innerHTML = log.length
      ? log.map(item => `<li><i></i><div><b>${esc(item.text)}</b><span>${esc(item.time || "")}</span></div></li>`).join("")
      : '<li class="empty-record">沒有保存案件歷程</li>';
    await loadWord(state);
  }

  init();
})();
