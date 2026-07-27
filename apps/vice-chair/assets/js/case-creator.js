(function () {
  const KEY = window.FulianCaseDomain.TASK_STORAGE_KEY;
  const config = FulianAuth.getConfig();
  const session = FulianAuth.getSession();
  const committee = [config.vpName, ...config.committee];
  const types = {
    renewal: { label: "終期輔導（續約）", stage: "待進行終期輔導", form: "terminal-form.html", existing: true },
    new: { label: "新會員訪談", stage: "待進行新會員訪談", form: "new-member-form.html" },
    industry: { label: "轉換行業別訪談", stage: "待進行轉換訪談", form: "industry-change-form.html", existing: true },
    midterm: { label: "期中輔導（GROW）", stage: "待進行期中輔導", form: "midterm-form.html", existing: true },
    departure: { label: "離會訪談", stage: "待進行離會訪談", form: "departure-form.html", existing: true },
    special: { label: "特定會員關懷", stage: "待進行會員關懷", form: "member-care.html", existing: true },
  };
  let members = [];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
  const local = () => {
    const date = new Date(Date.now() + 864e5);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  function html() {
    return `<div class="case-create-modal" id="caseCreateModal" hidden>
      <div class="case-create-dialog">
        <div class="case-create-head">
          <div><small>CREATE CASE</small><h2>建立會員案件</h2><p>建立後立即加入「進行中案件」，每案使用獨立草稿與流程紀錄。</p></div>
          <button type="button" id="closeCaseCreate">×</button>
        </div>
        <form id="caseCreateForm">
          <div class="case-create-fields">
            <label>案件類型<select id="createType">${Object.entries(types).map(([value, item]) => `<option value="${value}">${item.label}</option>`).join("")}</select></label>
            <label>排定日期與時間<input id="createDate" type="datetime-local" required></label>
            <label>會員／申請者<input id="createMember" list="createMemberList" autocomplete="off" required placeholder="搜尋會員或輸入新申請者"><datalist id="createMemberList"></datalist></label>
            <label>專業類別<input id="createProfession" placeholder="新會員請手動填寫"></label>
            <label>主要負責人<select id="createLead">${committee.map(name => `<option value="${esc(name)}">${esc(name)}${name === config.vpName ? "（副主席）" : ""}</option>`).join("")}</select></label>
            <label>優先程度<select id="createPriority"><option value="normal">一般</option><option value="high">高優先</option></select></label>
            <fieldset class="full"><legend>陪訪人員（選填，最多兩位）</legend><div class="companions" id="createCompanions"></div></fieldset>
            <label class="full">案件備註<textarea id="createNotes" rows="3" placeholder="訪談前需要準備或確認的事項"></textarea></label>
          </div>
          <div class="case-create-foot"><button type="button" class="cancel" id="cancelCaseCreate">取消</button><button type="submit" class="start">建立案件並開始</button></div>
        </form>
      </div>
    </div>`;
  }

  function renderCompanions() {
    const lead = document.querySelector("#createLead").value;
    document.querySelector("#createCompanions").innerHTML = committee
      .filter(name => name !== lead)
      .map(name => `<label><input type="checkbox" value="${esc(name)}">${esc(name)}</label>`)
      .join("");
    document.querySelectorAll("#createCompanions input").forEach(input => {
      input.onchange = () => {
        const checked = [...document.querySelectorAll("#createCompanions input:checked")];
        if (checked.length > 2) input.checked = false;
      };
    });
  }

  function syncProfession() {
    const found = members.find(item => item.name === document.querySelector("#createMember").value.trim());
    if (found) document.querySelector("#createProfession").value = found.profession || "";
  }

  function open(type = "renewal") {
    const selectedType = types[type] ? type : "renewal";
    document.querySelector("#createType").value = selectedType;
    document.querySelector("#createMember").value = "";
    document.querySelector("#createProfession").value = "";
    document.querySelector("#createDate").value = local();
    document.querySelector("#createLead").value = session.name && committee.includes(session.name)
      ? session.name
      : config.vpName;
    document.querySelector("#createPriority").value = "normal";
    document.querySelector("#createNotes").value = "";
    renderCompanions();
    document.querySelector("#caseCreateModal").hidden = false;
    document.querySelector("#createMember").focus();
  }

  function close() {
    document.querySelector("#caseCreateModal").hidden = true;
    history.replaceState(null, "", "case-board.html");
  }

  async function submit(event) {
    event.preventDefault();
    const type = document.querySelector("#createType").value;
    const member = document.querySelector("#createMember").value.trim();
    if (!member) return;
    if (types[type]?.existing && !members.some(item => item.name === member)) {
      alert("此案件類型必須從正式會員名單選擇，不可手動輸入其他姓名。");
      return;
    }
    const tasks = JSON.parse(localStorage.getItem(KEY) || "[]");
    const id = window.FulianCaseDomain.createTaskId(tasks);
    const task = {
      id,
      type,
      member,
      profession: document.querySelector("#createProfession").value.trim(),
      scheduledAt: document.querySelector("#createDate").value,
      lead: document.querySelector("#createLead").value,
      companions: [...document.querySelectorAll("#createCompanions input:checked")].map(input => input.value),
      priority: document.querySelector("#createPriority").value,
      stage: types[type].stage,
      notes: document.querySelector("#createNotes").value.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      createdBy: session.name,
    };
    tasks.push(task);
    localStorage.setItem(KEY, JSON.stringify(tasks));
    await window.FulianTaskStore.flush();
    location.href = `${types[type].form}?task=${encodeURIComponent(id)}`;
  }

  async function init() {
    await window.FulianTaskStore.ready;
    document.body.insertAdjacentHTML("beforeend", html());
    document.querySelector("#closeCaseCreate").onclick = close;
    document.querySelector("#cancelCaseCreate").onclick = close;
    document.querySelector("#caseCreateForm").onsubmit = submit;
    document.querySelector("#createLead").onchange = renderCompanions;
    document.querySelector("#createMember").onchange = syncProfession;
    document.querySelector("#newCase").onclick = () => open("renewal");
    try {
      const response = await fetch("/api/bni-analysis", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      members = (data.members || []).map(item => ({ name: item.name, profession: item.profession || "" }));
      document.querySelector("#createMemberList").innerHTML = members
        .map(item => `<option value="${esc(item.name)}">${esc(item.profession)}</option>`)
        .join("");
    } catch {
      members = [];
    }
    const requested = new URLSearchParams(location.search).get("new");
    if (requested) open(requested);
  }

  init();
  window.FulianCaseCreator = { open };
})();
