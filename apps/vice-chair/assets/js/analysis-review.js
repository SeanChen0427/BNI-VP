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
  const geminiModelKey = "fulian.analysis.gemini-model";
  let currentDraft = null;

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch {
      throw Object.assign(new Error("分析服務回應格式不正確，請重新整理後再試"), { status: response.status });
    }
  };

  const post = async (payload) => {
    const response = await fetch("/api/analysis-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity, ...payload }) });
    const data = await readJson(response);
    if (!response.ok) throw Object.assign(new Error(data.message || "操作失敗"), { data, status: response.status });
    return data;
  };

  const postDeparture = async (payload) => {
    const response = await fetch("/api/member-departure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity, ...payload }) });
    const data = await readJson(response);
    if (!response.ok) throw Object.assign(new Error(data.message || "離會登記失敗"), { data, status: response.status });
    return data;
  };

  const localDay = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };

  function renderIssues(container, issues) {
    container.hidden = !issues.length;
    container.innerHTML = issues.map((issue) => `<p class="issue ${issue.level}"><b>[${issue.level === "blocking" ? "阻擋" : issue.level === "critical" ? "最高優先" : "警告"}]</b> ${issue.message}</p>`).join("");
  }

  function renderDepartureResolution(issues) {
    const candidates = issues.filter((issue) => issue.level === "blocking" && issue.code === "expiry-only" && issue.member);
    const panel = $("#departureResolution");
    panel.hidden = !candidates.length;
    $("#departureResolveStatus").textContent = "";
    if (!candidates.length) {
      $("#departureCandidates").replaceChildren();
      return;
    }
    if (!$("#departureConfirmDate").value) $("#departureConfirmDate").value = localDay();
    const cards = candidates.map((issue) => {
      const card = document.createElement("article");
      const name = document.createElement("strong");
      const button = document.createElement("button");
      name.textContent = issue.member;
      button.type = "button";
      button.textContent = "確認已離會";
      button.addEventListener("click", () => confirmDeparture(issue.member, button));
      card.append(name, button);
      return card;
    });
    $("#departureCandidates").replaceChildren(...cards);
  }

  function renderRenewalResolution(engine) {
    const radar = Array.isArray(engine?.renewalRadar) ? engine.renewalRadar.filter((item) => item.expiryDate) : [];
    const confirmed = Array.isArray(engine?.renewalConfirmations) ? engine.renewalConfirmations : [];
    const panel = $("#renewalResolution");
    panel.hidden = !radar.length && !confirmed.length;
    $("#renewalResolveStatus").textContent = "";
    if (!$("#renewalCompletedDate").value) $("#renewalCompletedDate").value = localDay();
    const candidates = radar.map((item) => {
      const card = document.createElement("article");
      const details = document.createElement("span");
      const name = document.createElement("strong");
      const expiry = document.createElement("small");
      const button = document.createElement("button");
      name.textContent = item.name;
      expiry.textContent = `原到期日 ${item.expiryDate}`;
      details.append(name, expiry);
      button.type = "button";
      button.textContent = "中心已完成";
      button.addEventListener("click", () => confirmRenewal(item, button));
      card.append(details, button);
      return card;
    });
    $("#renewalCandidates").replaceChildren(...candidates);
    const completedCards = confirmed.map((item) => {
      const card = document.createElement("article");
      const details = document.createElement("span");
      const name = document.createElement("strong");
      const dates = document.createElement("small");
      const button = document.createElement("button");
      name.textContent = `${item.name}・中心已完成`;
      dates.textContent = `完成日 ${item.completedOn}｜原到期日 ${item.priorExpiryOn}`;
      details.append(name, dates);
      button.type = "button";
      button.className = "secondary";
      button.textContent = "撤銷誤確認";
      button.addEventListener("click", () => revokeRenewal(item, button));
      card.append(details, button);
      return card;
    });
    $("#renewalConfirmed").replaceChildren(...completedCards);
  }

  async function confirmRenewal(item, button) {
    const completedOn = $("#renewalCompletedDate").value;
    if (!completedOn) {
      $("#renewalResolveStatus").textContent = "請先選擇中心區完成日";
      $("#renewalCompletedDate").focus();
      return;
    }
    if (!confirm(`確認「${item.name}」已由中心區完成續約？\n系統只排除原到期日 ${item.expiryDate} 這一個週期，不會自行產生新到期日。`)) return;
    button.disabled = true;
    $("#renewalResolveStatus").textContent = `正在記錄 ${item.name}…`;
    try {
      const data = await post({ action: "confirm-renewal", name: item.name, priorExpiryOn: item.expiryDate, completedOn });
      renderDraft(data.draft);
      $("#renewalResolveStatus").textContent = data.message;
    } catch (error) {
      $("#renewalResolveStatus").textContent = error.message;
      button.disabled = false;
    }
  }

  async function revokeRenewal(item, button) {
    if (!confirm(`撤銷「${item.name}」的中心區完成確認？\n撤銷後，同一到期週期會重新出現在續約雷達。`)) return;
    button.disabled = true;
    try {
      const data = await post({ action: "revoke-renewal", completionId: item.id });
      renderDraft(data.draft);
      $("#renewalResolveStatus").textContent = data.message;
    } catch (error) {
      $("#renewalResolveStatus").textContent = error.message;
      button.disabled = false;
    }
  }

  async function confirmDeparture(name, button) {
    const confirmedAt = $("#departureConfirmDate").value;
    if (!confirmedAt) {
      $("#departureResolveStatus").textContent = "請先選擇離會確認日";
      $("#departureConfirmDate").focus();
      return;
    }
    if (!confirm(`確認「${name}」已離會？\n確認後會寫入正式會員主檔，後續分析自動排除；如有誤可到系統設定撤銷。`)) return;
    button.disabled = true;
    $("#departureResolveStatus").textContent = `正在登記 ${name}…`;
    try {
      const data = await postDeparture({ action: "register", source: "analysis-reconciliation", name, confirmName: name, confirmedAt, note: "月度分析對帳確認：到期報告有、PALMS 無" });
      $("#departureResolveStatus").textContent = data.message;
      await generateDraft();
    } catch (error) {
      $("#departureResolveStatus").textContent = error.message;
      button.disabled = false;
    }
  }

  async function generateDraft() {
    const button = $("#generateButton");
    button.disabled = true;
    $("#generateStatus").textContent = "解析與對帳中…";
    renderIssues($("#reconcileIssues"), []);
    renderDepartureResolution([]);
    try {
      const data = await post({ action: "generate" });
      $("#generateStatus").textContent = "草稿已產出";
      renderIssues($("#reconcileIssues"), []);
      renderDepartureResolution([]);
      renderDraft(data.draft);
    } catch (error) {
      $("#generateStatus").textContent = error.message;
      const issues = error.data?.issues || [];
      if (issues.length) {
        renderIssues($("#reconcileIssues"), issues);
        renderDepartureResolution(issues);
      }
    } finally {
      button.disabled = false;
    }
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
    const pendingOfficialData = Array.isArray(e.reconciliation.pendingOfficialData) ? e.reconciliation.pendingOfficialData : [];
    const summaryItems = [
      ["現任會員", `${e.reconciliation.counts.active} 人`, `排除離會 ${e.reconciliation.excludedDeparted.length} 人`],
      ["燈號分布", `綠 ${d.green}／黃 ${d.yellow}／紅 ${d.red}／黑 ${d.black}`, `週數 ${e.totalWeeks}`],
      ["續約雷達", `${e.renewalRadar.length} 項`, radarTop],
      ["審計紅色觀察", `${(e.audit?.observations || []).filter((o) => o.level === "red").length} 人`, auditRed],
      ["行為診斷", `${e.behavior.length} 人`, `綠燈空轉 ${e.greenIdles.length} 人`],
      ["黃燈突圍", `${e.yellowBreakthroughs.length} 人`, `期中關懷 ${e.lifecycle.midterm.length}／新會員 ${e.lifecycle.newMembers.length}`],
    ];
    if (pendingOfficialData.length) summaryItems.splice(1, 0, [
      "中心資料待同步",
      `${pendingOfficialData.length} 人`,
      pendingOfficialData.map((item) => `${item.name}（${item.missing.map((field) => field === "tenure" ? "會齡" : field === "expiry" ? "到期日" : field).join("、")}待同步）`).join("、"),
    ]);
    $("#draftSummary").innerHTML = summaryItems.map(([label, value, note]) => `<article><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
    renderIssues($("#draftWarnings"), e.reconciliation.issues || []);
    $("#draftJson").textContent = JSON.stringify(e, null, 2);
    renderRenewalResolution(e);

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
      if (review.provider === "codex") $("#codexReviewText").value = review.text;
    }
  }

  async function loadDraft() {
    try {
      const response = await fetch(`/api/analysis-draft?identity=${encodeURIComponent(identity)}`, { cache: "no-store" });
      const data = await readJson(response);
      if (response.ok) renderDraft(data.draft);
    } catch { /* 伺服器未啟動時保持初始畫面 */ }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`/api/analysis-snapshots?identity=${encodeURIComponent(identity)}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok || !data.snapshots?.length) return;
      $("#historyList").innerHTML = data.snapshots.slice().reverse().map((s) => `<article><b>第 ${s.version} 版</b><span>期間 ${s.period?.start || "—"} ~ ${s.period?.end || "—"}</span><span>發佈 ${new Date(s.publishedAt).toLocaleString("zh-TW")}｜${s.publishedBy.split(":")[1] || s.publishedBy}</span></article>`).join("");
    } catch { /* 同上 */ }
  }

  $("#generateButton").addEventListener("click", generateDraft);

  function syncModelSelect() {
    const isGemini = $("#providerSelect").value === "gemini";
    $("#geminiModelWrap").hidden = !isGemini;
  }

  const savedGeminiModel = localStorage.getItem(geminiModelKey);
  if (savedGeminiModel && [...$("#geminiModelSelect").options].some((option) => option.value === savedGeminiModel)) {
    $("#geminiModelSelect").value = savedGeminiModel;
  }
  $("#providerSelect").addEventListener("change", syncModelSelect);
  $("#geminiModelSelect").addEventListener("change", () => localStorage.setItem(geminiModelKey, $("#geminiModelSelect").value));
  syncModelSelect();

  $("#reviewButton").addEventListener("click", async () => {
    const button = $("#reviewButton");
    button.disabled = true;
    $("#reviewStatus").textContent = "AI 審視進行中（完整脈絡，約需一至數分鐘）…";
    try {
      const provider = $("#providerSelect").value;
      const data = await post({ action: "ai-review", provider, model: provider === "gemini" ? $("#geminiModelSelect").value : undefined });
      $("#reviewStatus").textContent = "審視完成，請往下審閱";
      renderDraft(data.draft);
    } catch (error) {
      $("#reviewStatus").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("#codexReviewButton").addEventListener("click", async () => {
    const button = $("#codexReviewButton");
    const text = $("#codexReviewText").value.trim();
    if (!text) {
      $("#codexReviewText").focus();
      $("#codexReviewStatus").textContent = "請先貼入 Codex 細部審視";
      return;
    }
    button.disabled = true;
    $("#codexReviewStatus").textContent = "正在驗證並保存…";
    try {
      const data = await post({ action: "codex-review", text });
      $("#codexReviewStatus").textContent = "Codex 細部審視已保存，請往下確認發佈";
      renderDraft(data.draft);
    } catch (error) {
      $("#codexReviewStatus").textContent = error.message;
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
