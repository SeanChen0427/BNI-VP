(function () {
  const domain = window.FulianRenewalFoundationDomain;
  const calendar = window.FulianCalendarDomain;
  const session = FulianAuth.getSession();
  if (!session) return;
  let items = [], error = "", pending = null;
  const relevant = item => domain.manager(session) || [item.leadName, ...(item.companionNames || [])].includes(session.name);
  function notifications() {
    if (error) return [{ id: `foundation-load-failed-${calendar.dateInput()}`, title: "續約地基追蹤尚未同步", detail: "目前無法確認是否有到期項目，請開啟追蹤頁查看。", icon: "基", tone: "urgent", link: "renewal-foundations.html", priority: 1, time: new Date().toISOString() }];
    return items.filter(item => relevant(item) && domain.attention(item).rank <= 2).map(item => {
      const attention = domain.attention(item);
      return { id: `foundation-${item.id}-${item.revision}-${attention.key}-${calendar.dateInput()}`, title: `${item.memberName}・${attention.label}`, detail: `${item.title}・期限 ${item.dueOn}・主責 ${item.leadName}`, icon: "基", tone: attention.rank === 0 ? "urgent" : "workflow", link: `renewal-foundations.html?item=${encodeURIComponent(item.id)}`, priority: attention.rank, time: item.updatedAt };
    });
  }
  function render() {
    const node = document.getElementById("foundationSummaryText");
    if (!node) return;
    const active = items.filter(item => !domain.resolved(item));
    const due = active.filter(item => relevant(item) && domain.attention(item).rank <= 2);
    const list=document.getElementById("foundationHomeList");
    if(list){list.replaceChildren();for(const item of active.filter(value=>domain.attention(value).rank<=2||domain.attention(value).rank===8)){const link=document.createElement("a"),title=document.createElement("b"),progress=document.createElement("span"),assignment=document.createElement("span");link.className="foundation-home-item";link.href=`renewal-foundations.html?item=${encodeURIComponent(item.id)}`;title.textContent=`${item.memberName}・${item.title}｜${domain.attention(item).label}`;progress.textContent=domain.progressText(item);assignment.textContent=`主責 ${item.leadName}｜起算 ${item.startOn||item.nextCheckOn}｜期限 ${item.dueOn}`;link.append(title,progress,assignment);list.append(link);}}
    node.textContent = error ? "尚未同步，請開啟追蹤頁確認。" : `持續列管 ${active.length} 項・${domain.manager(session) ? "待跟進" : "我需跟進"} ${due.length} 項`;
  }
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetch("/api/renewal-foundations?summary=1", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "無法同步");
        items = data.items;
        error = "";
      } catch (reason) { error = reason.message; }
      render();
      dispatchEvent(new CustomEvent("fulian:foundation-changed"));
    })().finally(() => { pending = null; });
    return pending;
  }
  window.FulianFoundationSummary = { notifications, refresh };
  refresh();
  addEventListener("focus", refresh);
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
})();
