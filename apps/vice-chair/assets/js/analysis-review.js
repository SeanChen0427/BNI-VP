(() => {
  const session = FulianAuth.getSession();
  if (!session) return;
  const identity = `${session.role}:${session.name}`;
  const isVp = ["vp", "admin"].includes(session.role);
  const $ = (selector) => document.querySelector(selector);

  if (!isVp) {
    $("#forbidden").hidden = false;
    return;
  }
  $("#workspace").hidden = false;

  const lightLabel = { green: "綠燈", yellow: "黃燈", red: "紅燈", black: "黑燈" };
  const radarLabel = { "expired-unrenewed": "已到期未續約", overdue: "已過續約截止", "due-this-month": "本月截止", upcoming: "即將截止", "weak-early-warning": "審查弱項預警" };
  let currentDraft = null;

  const post = async (payload) => {
    const response = await fetch("/api/analysis-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || "操作失敗"), { data, status: response.status });
    return data;
  };

  function renderIssues(container, issues) {
    container.hidden = !issues.length;
    container.innerHTML = issues.map((issue) => `<p class="issue ${issue.level}"><b>[${issue.level === "blocking" ? "阻擋" : issue.level === "critical" ? "最高優先" : "警告"}]</b> ${issue.message}</p>`).join("");
  }

  function renderDraft(draft) {
    currentDraft = draft;
    const hasDraft = Boolean(draft);
    $("#draftPanel").hidden = !hasDraft;
    $("#reviewPanel").hidden = !hasDraft;
    $("#decisionPanel").hidden = !hasDraft || !draft.aiReview;
    if (!hasDraft) return;
    const e = draft.engine;
    $("#draftMeta").textContent = `期間 ${e.meta.period.start} ~ ${e.meta.period.end}｜產出於 ${new Date(draft.createdAt).toLocaleString("zh-TW")}`;
    const d = e.distribution;
    const radarTop = e.renewalRadar.slice(0, 6).map((item) => `${radarLabel[item.kind] || item.kind}：${item.name}`).join("；") || "無";
    const auditRed = (e.audit?.observations || []).filter((o) => o.level === "red").map((o) => `${o.name}（${o.families.join("+")}）`).join("、") || "無";
    $("#draftSummary").innerHTML = [
      ["現任會員", `${e.reconciliation.counts.active} 人`, `排除離會 ${e.reconciliation.excludedDeparted.length} 人`],
      ["燈號分布", `綠 ${d.green}／黃 ${d.yellow}／紅 ${d.red}／黑 ${d.black}`, `週數 ${e.totalWeeks}`],
      ["續約雷達", `${e.renewalRadar.length} 項`, radarTop],
      ["審計紅色觀察", `${(e.audit?.observations || []).filter((o) => o.level === "red").length} 人`, auditRed],
      ["行為診斷", `${e.behavior.length} 人`, `綠燈空轉 ${e.greenIdles.length} 人`],
      ["黃燈突圍", `${e.yellowBreakthroughs.length} 人`, `期中關懷 ${e.lifecycle.midterm.length}／新會員 ${e.lifecycle.newMembers.length}`],
    ].map(([label, value, note]) => `<article><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
    renderIssues($("#draftWarnings"), e.reconciliation.issues || []);
    $("#draftJson").textContent = JSON.stringify(e, null, 2);

    const feedback = draft.feedback || [];
    $("#feedbackList").hidden = !feedback.length;
    $("#feedbackList").innerHTML = feedback.length
      ? `<b>退回紀錄（AI 重跑時逐點回應）</b>${feedback.map((f) => `<p>${new Date(f.at).toLocaleString("zh-TW")}｜${f.reason}</p>`).join("")}`
      : "";

    const review = draft.aiReview;
    $("#reviewOutput").hidden = !review;
    if (review) {
      $("#reviewOutputMeta").textContent = `${review.provider}｜${review.model}｜${new Date(review.generatedAt).toLocaleString("zh-TW")}｜脈絡 ${Math.round(review.promptChars / 1000)}K 字元｜已帶入回饋 ${review.feedbackCount} 則`;
      $("#reviewText").textContent = review.text;
    }
  }

  async function loadDraft() {
    try {
      const response = await fetch(`/api/analysis-draft?identity=${encodeURIComponent(identity)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) renderDraft(data.draft);
    } catch { /* 伺服器未啟動時保持初始畫面 */ }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`/api/analysis-snapshots?identity=${encodeURIComponent(identity)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.snapshots?.length) return;
      $("#historyList").innerHTML = data.snapshots.slice().reverse().map((s) => `<article><b>第 ${s.version} 版</b><span>期間 ${s.period?.start || "—"} ~ ${s.period?.end || "—"}</span><span>發佈 ${new Date(s.publishedAt).toLocaleString("zh-TW")}｜${s.publishedBy.split(":")[1] || s.publishedBy}</span></article>`).join("");
    } catch { /* 同上 */ }
  }

  $("#generateButton").addEventListener("click", async () => {
    $("#generateStatus").textContent = "解析與對帳中…";
    $("#reconcileIssues").hidden = true;
    try {
      const data = await post({ action: "generate" });
      $("#generateStatus").textContent = "草稿已產出";
      renderDraft(data.draft);
    } catch (error) {
      $("#generateStatus").textContent = error.message;
      if (error.data?.issues) renderIssues($("#reconcileIssues"), error.data.issues);
    }
  });

  $("#reviewButton").addEventListener("click", async () => {
    const button = $("#reviewButton");
    button.disabled = true;
    $("#reviewStatus").textContent = "AI 審視進行中（完整脈絡，約需一至數分鐘）…";
    try {
      const data = await post({ action: "ai-review", provider: $("#providerSelect").value });
      $("#reviewStatus").textContent = "審視完成，請往下審閱";
      renderDraft(data.draft);
    } catch (error) {
      $("#reviewStatus").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("#rejectButton").addEventListener("click", async () => {
    const reason = $("#rejectReason").value.trim();
    if (!reason) { $("#rejectReason").focus(); return; }
    try {
      const data = await post({ action: "reject", reason });
      $("#rejectReason").value = "";
      $("#reviewStatus").textContent = data.message;
      renderDraft(data.draft);
    } catch (error) {
      $("#reviewStatus").textContent = error.message;
    }
  });

  $("#publishButton").addEventListener("click", async () => {
    if (!currentDraft?.aiReview) return;
    if (!confirm("確認發佈本月分析快照？發佈後委員即可看到，且此版本不可改寫。")) return;
    try {
      const data = await post({ action: "publish" });
      alert(data.message);
      renderDraft(null);
      loadHistory();
    } catch (error) {
      alert(error.message);
    }
  });

  loadDraft();
  loadHistory();
})();
