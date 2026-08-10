(async function () {
  await Promise.all([window.FulianNewMemberFormReady, window.FulianTaskStore.ready]);
  const form = document.querySelector("#newMemberForm");
  const session = FulianAuth.getSession();
  const config = FulianAuth.getConfig();
  const taskId = new URLSearchParams(location.search).get("task");
  let task = null;
  try {
    task = (JSON.parse(localStorage.getItem(window.FulianCaseDomain.TASK_STORAGE_KEY) || "[]") || [])
      .find(item => item.id === taskId && item.type === "new") || null;
  } catch {}
  if (!task) {
    form.hidden = true;
    toast("找不到指定的新會員訪談案件，請由進行中案件重新開啟");
    return;
  }

  try {
    const role = session.role === "vp" ? "副主席" : session.role === "admin" ? "系統管理員" : "會員委員";
    const identity = document.querySelector("#loginUser");
    identity.innerHTML = `<option value="${session.name}">${session.name}（${role}）</option>`;
    identity.disabled = true;
    document.querySelector("#committeeList").innerHTML = [...new Set([config.vpName, ...config.committee])]
      .map(name => `<option value="${name}"></option>`)
      .join("");
    applicants = [{ name: task.member }];
    document.querySelector("#applicantList").innerHTML = `<option value="${task.member}"></option>`;
    selectApplicant(task.member);
    document.querySelector("#applicantSearch").readOnly = true;
    document.querySelector("#profession").value = task.profession || "";
    document.querySelector("#leadInterviewer").value = task.lead || session.name;
    document.querySelector("#witness1").value = task.lead || session.name;
    const companions = task.companions || [];
    document.querySelector("#companionInterviewer").value = companions[0] || "";
    document.querySelector("#secondCompanion").value = companions[1] || "";
    document.querySelector("#witness2").value = companions[0] || "";
    document.querySelector("#witness3").value = companions[1] || "";
    if (task.scheduledAt) document.querySelector("#meetingDate").value = task.scheduledAt;
    const memberResponse = await fetch("/api/bni-analysis", { cache: "no-store" });
    if (!memberResponse.ok) throw new Error(`正式會員資料載入失敗：HTTP ${memberResponse.status}`);
    const snapshot = await memberResponse.json();
    const members = (snapshot.members || [])
      .filter(item => item?.name && item.name !== task.member)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
    if (!members.length) throw new Error("沒有可選擇的正式會員引薦人");
    const draftKey = window.FulianCaseDomain.draftStorageKey(task);
    let savedReferrer = "";
    try { savedReferrer = JSON.parse(localStorage.getItem(draftKey) || "{}").referrerName || ""; } catch {}
    const referrerSelect = document.querySelector("#referrerName");
    referrerSelect.replaceChildren(new Option("請選擇引薦人", ""));
    members.forEach(member => {
      const option = new Option(member.name, member.name);
      option.dataset.memberId = String(member.memberId || member.id || member.personId || member.name);
      referrerSelect.add(option);
    });
    if (members.some(member => member.name === savedReferrer)) referrerSelect.value = savedReferrer;
    document.querySelector("#saveTime").textContent = "已由進行中案件帶入";
    await window.FulianCaseStateStore.reconcileDraft(task, {
      applicant: task.member,
      ...(task.scheduledAt ? { meetingDate: task.scheduledAt } : {}),
      profession: task.profession || "",
      leadInterviewer: task.lead || session.name,
      witness1: task.lead || session.name,
      companionInterviewer: companions[0] || "",
      secondCompanion: companions[1] || "",
      witness2: companions[0] || "",
      witness3: companions[1] || "",
      ...(referrerSelect.value ? { referrerName: referrerSelect.value } : {}),
    });
    form.hidden = false;
  } catch (error) {
    console.error("新會員案件資料載入失敗", error);
    form.hidden = true;
    toast(error.message || "新會員案件資料載入失敗，請重新整理");
  }
})();
