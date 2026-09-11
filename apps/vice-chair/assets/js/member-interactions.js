(function(){
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const tabs=[$("#memberOverviewTab"),$("#memberHistoryTab")];
  const panels=[$("#memberOverviewPanel"),$("#memberHistoryPanel")];
  let member="",preferredMonth="",selectedMonth="",data=null,ticket=0,started=false;
  function showTab(index){
    tabs.forEach((tab,i)=>{
      tab.setAttribute("aria-selected",String(i===index));
      tab.tabIndex=i===index?0:-1;
      panels[i].hidden=i!==index;
    });
    if(index===1&&!started){started=true;load();}
  }
  tabs.forEach((tab,index)=>{
    tab.onclick=()=>showTab(index);
    tab.onkeydown=event=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();
      const next=event.key==="Home"?0:event.key==="End"?1:1-index;
      showTab(next);tabs[next].focus();
    };
  });
  function matches(event,type){
    return type==="all"||type==="oneToOne"&&event.type==="oneToOne"
      ||type==="given"&&event.type==="referral"&&event.direction!=="incoming"
      ||type==="received"&&event.type==="referral"&&event.direction!=="outgoing";
  }
  function eventMarkup(event){
    const self=event.direction==="self",out=event.direction==="outgoing";
    const type=event.type==="oneToOne"?"一對一":self?"引薦（對象為本人）":out?"給出引薦":"收到引薦";
    const direction=self?"登錄對象為本人，需核對":event.type==="oneToOne"?(out?"由本人登錄":"由對方登錄"):(out?"本人 → 對方":"對方 → 本人");
    const details=[direction,event.inOut,event.chapterNote].filter(Boolean).map(escape).join(" · ");
    return `<li class="history-event"><span class="history-kind">${type}</span><div><strong>${escape(event.counterpart||"對象未填")}</strong><p>${details}</p></div></li>`;
  }
  function renderEvents(){
    if(!data?.coverage)return;
    const type=$("#historyType").value,events=data.events.filter(event=>matches(event,type));
    $("#historyResultCount").textContent=`目前顯示 ${events.length} 筆登錄；上方摘要包含所選月份已匯入的全部互動類型。`;
    $("#historyTimeline").innerHTML=data.coverage.availableWeeks.slice().reverse().map(week=>{
      const rows=events.filter(event=>event.week===week);
      return `<details class="history-week" open><summary><span>${escape(week)} 週報</span><span>${rows.length} 筆</span></summary>${rows.length?`<ul>${rows.map(eventMarkup).join("")}</ul>`:'<p class="history-note">這份已匯入週報中，未找到此會員符合篩選的登錄。</p>'}</details>`;
    }).join("");
  }
  function render(){
    $("#historyStatus").textContent="";
    if(!data.month){
      $("#historyStatus").textContent="目前尚未匯入審計週報，因此沒有可查閱的互動歷程；這不代表沒有互動。";
      $("#historyMonth").innerHTML='<option>尚無審計月份</option>';
      $("#historyMonth").disabled=true;return;
    }
    selectedMonth=data.month;
    $("#historyMonth").innerHTML=data.months.map(item=>`<option value="${escape(item.month)}">${escape(item.month)}（已匯入 ${item.availableWeeks.length} 週）</option>`).join("");
    $("#historyMonth").value=data.month;$("#historyMonth").disabled=false;
    const c=data.coverage,complete=c.status==="complete";
    const label=complete?"週報已齊":c.status==="ongoing"?"本月尚未結束":"週報尚未完整";
    const imported=window.FulianCalendarDomain.formatTaipeiTimestamp(data.importedAt,{year:true})||"未提供";
    $("#historyCoverage").classList.toggle("incomplete",!complete);
    $("#historyCoverage").innerHTML=`<strong>${escape(data.month)} · ${label}</strong><p>已匯入週次：${c.availableWeeks.map(escape).join("、")}。最近匯入：${escape(imported)}。</p>`
      +(c.missingWeeks.length?`<p>尚缺週次：${c.missingWeeks.map(escape).join("、")}。缺少的週次不能視為零互動。</p>`:"")
      +(c.extraWeeks.length?`<p>非例行週二的週報：${c.extraWeeks.map(escape).join("、")}，請核對是否為改期。</p>`:"")
      +'<p>完整性依每週二例會核對；停會或改期須另行確認。未匯入的月份不提供互動統計。</p>';
    const labels={oneToOne:"一對一登錄",given:"給出引薦",received:"收到引薦",counterpartCount:"不同互動對象"};
    $("#historySummary").innerHTML=Object.entries(labels).map(([key,label])=>`<div><dt>${label}</dt><dd>${data.summary[key]} <small>${key==="counterpartCount"?"位":"筆"}</small></dd></div>`).join("");
    $("#historyContent").hidden=false;renderEvents();
  }
  async function load(month=""){
    const current=++ticket;data=null;selectedMonth=month;
    $("#historyContent").hidden=true;$("#historyTimeline").replaceChildren();
    $("#historyRetry").hidden=true;$("#historyStatus").textContent="正在讀取這位會員的審計歷程…";
    try{
      const query=new URLSearchParams({member});
      if(month)query.set("month",month);
      const session=window.FulianAuth.getSession();
      query.set("identity",`${session.role}:${session.name}`);
      const response=await fetch(`/api/member-interactions?${query}`,{cache:"no-store"});
      const result=await response.json();
      if(current!==ticket)return;
      if(!response.ok)throw new Error(result.message||"互動歷程暫時無法讀取");
      if(result.schema!=="fulian.member-interactions.v1"||result.member!==member||(month&&result.month!==month)||!Array.isArray(result.events)||!Array.isArray(result.months))throw new Error("互動歷程格式不相容，請重新讀取");
      if(!month&&preferredMonth&&result.month!==preferredMonth&&result.months.some(item=>item.month===preferredMonth)){
        const preferred=preferredMonth;preferredMonth="";return load(preferred);
      }
      preferredMonth="";data=result;render();
    }catch(error){
      if(current!==ticket)return;
      $("#historyStatus").textContent=`未能載入：${error.message}。目前不顯示互動統計。`;
      $("#historyRetry").hidden=false;
    }
  }
  $("#historyMonth").onchange=()=>load($("#historyMonth").value);
  $("#historyType").onchange=renderEvents;
  $("#historyRetry").onclick=()=>load(selectedMonth);
  $("#memberDialog").addEventListener("close",()=>{
    if($("#memberDialog").open)return;
    ticket++;data=null;member="";$("#historyTimeline").replaceChildren();
  });
  window.FulianMemberInteractions={open(name,month=""){
    ticket++;member=name;preferredMonth=month;selectedMonth="";data=null;started=false;
    $("#historyMonth").innerHTML='<option>讀取月份中…</option>';$("#historyMonth").disabled=true;
    $("#historyType").value="all";$("#historyContent").hidden=true;
    $("#historyTimeline").replaceChildren();$("#historySummary").replaceChildren();
    $("#historyStatus").textContent="";$("#historyRetry").hidden=true;showTab(0);
  }};
})();
