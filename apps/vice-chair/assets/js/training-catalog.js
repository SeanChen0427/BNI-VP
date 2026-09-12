(() => {
  const domain=globalThis.FulianTrainingCatalog,calendar=globalThis.FulianCalendarDomain;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let data=null,mode="upcoming",busy=false,loadFailed=false;
  const params=new URLSearchParams(location.search);
  $("#courseSearch").value=params.get("q")||"";
  for(const [key,label] of Object.entries(domain.CATEGORIES))$("#category").add(new Option(label,key));
  if(params.get("category") in domain.CATEGORIES)$("#category").value=params.get("category");
  const kindLabels={new:"新增場次",changed:"課程資訊異動",missing:"官方暫未列出",restored:"官方重新列出"};

  function render(){
    const now=new Date(),state=data?.state;
    $("#periods").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.period===mode)));
    const window=domain.range(mode,now,$("#courseMonth").value,$("#rangeFrom").value,$("#rangeThrough").value);
    $("#rangeLabel").textContent=window?.label||"請選擇月份";
    const events=domain.filterEvents(data?.events||[],{query:$("#courseSearch").value,category:$("#category").value,mode,month:$("#courseMonth").value,from:$("#rangeFrom").value,through:$("#rangeThrough").value,now});
    $("#resultCount").textContent=data?events.length:"—";
    const timestamp=state?.last_success_at?calendar.formatTaipeiTimestamp(state.last_success_at,{year:true}):"";
    const stale=timestamp&&Date.now()-new Date(state.last_success_at).getTime()>36*3600_000;
    $("#syncStatus").textContent=timestamp?`最後成功更新：${timestamp}（台北時間）${stale?" · 資料尚待更新":""}`:"尚未完成首次官方課表同步";
    $("#syncCatalog").hidden=!data?.canSync;
    if(state?.last_error&&!loadFailed){$("#catalogError").textContent=state.last_error;$("#catalogError").hidden=false;}
    let lastMonth="";
    $("#courseResults").innerHTML=events.map(event=>{
      const month=calendar.monthKey(event.start_at),day=calendar.dateInput(event.start_at).slice(8),week=calendar.formatTaipeiWeekday(event.start_at);
      let heading="";if(month!==lastMonth){heading=`<h3 class="month-heading">${month.slice(0,4)} 年 ${Number(month.slice(5))} 月</h3>`;lastMonth=month;}
      const missing=event.source_status==="missing",past=new Date(event.end_at)<now;
      const recent=Date.now()-new Date(event.updated_at).getTime()<7*86400_000;
      const changed=event.revision>1&&recent;
      let href="";try{href=domain.officialUrl(event.source_url);}catch{}
      return `${heading}<article class="course-card"><div class="date-tile"><strong>${Number(day)}</strong><span>${esc(week)}</span></div><div class="course-content"><div class="course-meta"><span>${esc(domain.CATEGORIES[event.category]||"其他培訓／活動")}</span>${/線上/.test(event.title)?'<span class="online">線上</span>':""}${past?'<span>已結束</span>':""}${missing?'<span class="missing">待確認</span>':changed?'<span class="changed">近期異動</span>':""}</div><h3>${esc(event.title)}</h3><p class="course-time">${esc(domain.eventTime(event))}</p>${missing?'<p class="missing-note">官方暫未列出此場次，是否取消或改期仍待確認。</p>':""}${href?`<a class="course-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">官方課程詳情 ↗</a>`:""}</div></article>`;
    }).join("");
    if(!events.length){
      const hasFilter=$("#courseSearch").value.trim()||$("#category").value;
      const startYear=Number(window?.start.slice(0,4)),endYear=Number(calendar.shiftDayKey(window?.end,-1).slice(0,4));
      const covered=state?.last_success_at&&[startYear,endYear].every(year=>state.synced_years?.includes(year));
      const title=!data?"課表暫時無法讀取":!state?.last_success_at?"課表尚待同步":hasFilter?"沒有符合條件的課程":!covered?"這個期間尚未同步":stale||state.last_error?"目前保存的課表沒有場次":"官方目前尚未公布這個期間的場次";
      $("#courseResults").innerHTML=`<div class="empty-state"><b>${esc(title)}</b><span>${hasFilter?"可縮短課名，或切換查詢期間。":"可查看官方行事曆，或稍後重新整理。"}</span>${mode!=="upcoming"?'<br><button type="button" id="showFuture">查看未來 12 個月</button>':""}</div>`;
      $("#showFuture")?.addEventListener("click",()=>{mode="upcoming";render();});
    }
    const firstImport=(data?.events||[]).map(event=>event.first_seen_at).filter(Boolean).sort()[0];
    const changes=(data?.changes||[]).filter(change=>change.change_kind!=="new"||change.after_event.first_seen_at!==firstImport).slice(0,12);
    $("#courseChanges").innerHTML=changes.length?changes.map(change=>`<details class="change-item"><summary><time>${esc(calendar.formatTaipeiTimestamp(change.changed_at,{year:true}))}</time><b>${esc(change.after_event.title)}</b>${esc(kindLabels[change.change_kind]||"課程異動")}</summary>${change.before_event?`<p>原場次：<del>${esc(domain.eventTime(change.before_event))}</del></p>`:""}<p>目前：${esc(domain.eventTime(change.after_event))}</p>${change.before_event?.title!==change.after_event.title?`<p>原名稱：${esc(change.before_event?.title)}</p>`:""}${change.change_kind==="missing"?"<p>暫未在官方課表找到，不代表已取消。</p>":""}</details>`).join(""):"<p>目前沒有已記錄的課程異動。</p>";
  }
  async function load(sync=false){
    if(busy)return;busy=true;loadFailed=false;
    $("#catalogError").hidden=true;
    $("#reloadCatalog").disabled=true;$("#syncCatalog").disabled=true;
    $("#syncStatus").textContent=sync?"正在核對今年與明年官方課表…":"正在讀取課表…";
    try{
      const response=await fetch("/api/training-catalog",sync?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync"})}:{cache:"no-store"});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||"課表讀取失敗");
      data=payload;render();
      if(payload.result?.skipped)$("#syncStatus").textContent+=" · "+payload.result.message;
    }catch(error){loadFailed=true;render();$("#catalogError").textContent=`${error.message}${data?" 畫面保留上次讀取的課表。":""}`;$("#catalogError").hidden=false;}
    finally{busy=false;$("#reloadCatalog").disabled=false;$("#syncCatalog").disabled=false;}
  }
  $("#searchForm").addEventListener("submit",event=>{event.preventDefault();render();});
  $("#courseSearch").addEventListener("input",render);
  $("#periods").addEventListener("click",event=>{const button=event.target.closest("[data-period]");if(button){mode=button.dataset.period;$("#courseMonth").value="";render();}});
  $("#courseMonth").addEventListener("change",()=>{mode=$("#courseMonth").value?"month":"upcoming";render();});
  $("#applyRange").addEventListener("click",()=>{const valid=domain.range("custom",new Date(),"",$("#rangeFrom").value,$("#rangeThrough").value);$("#rangeError").hidden=Boolean(valid);$("#rangeError").textContent="請填入有效的起訖日期，結束日不可早於開始日。";if(valid){mode="custom";$("#courseMonth").value="";render();}});
  $("#category").addEventListener("change",render);
  $("#clearFilters").addEventListener("click",()=>{$("#courseSearch").value="";$("#category").value="";$("#courseMonth").value="";mode="upcoming";render();});
  $("#reloadCatalog").addEventListener("click",()=>load());$("#syncCatalog").addEventListener("click",()=>load(true));
  load();
})();
