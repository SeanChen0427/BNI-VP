(function(){
  const panel=document.querySelector("#monthlyAwards"),session=window.FulianAuth?.getSession();
  if(!panel||session?.role!=="vp")return;
  const D=window.FulianMonthlyAwardsDomain;
  const month=panel.querySelector("#monthlyAwardsMonth"),results=panel.querySelector("#monthlyAwardsResults"),
    status=panel.querySelector("#monthlyAwardsStatus"),copy=panel.querySelector("#monthlyAwardsCopy"),
    refresh=panel.querySelector("#monthlyAwardsRefresh"),preview=panel.querySelector("#monthlyAwardsPreview"),
    text=panel.querySelector("#monthlyAwardsText");
  let requestId=0,catalog=[],current=null;
  const identity=`${session.role}:${session.name}`;
  async function read(suffix=""){
    const response=await fetch(`/api/monthly-awards?identity=${encodeURIComponent(identity)}${suffix}`,{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||"公告資料讀取失敗，請重新整理");
    return data;
  }
  function clear(){
    current=null;copy.disabled=true;results.replaceChildren();text.value="";preview.open=false;
  }
  function render(data){
    if(data.schema!=="fulian.monthly-awards.v1"||data.month!==month.value||!Array.isArray(data.awards)||data.awards.length!==4)throw new Error("公告資料不完整，請重新整理");
    const nodes=data.awards.map(award=>{
      const card=document.createElement("article"),title=document.createElement("h3"),value=document.createElement("strong"),names=document.createElement("p");
      card.className="monthly-data-item";
      title.textContent=`${award.label}第一名`;
      value.textContent=award.status==="no-records"?"本月無紀錄":`${Number(award.value).toLocaleString("zh-TW")} ${award.unit}`;
      names.textContent=award.status==="no-records"?"本月未列第一名":`${award.winners.join("、")}${award.winners.length>1?"（並列）":""}`;
      card.append(title,value,names);return card;
    });
    const announcement=D.announcement(data);
    results.replaceChildren(...nodes);text.value=announcement;current=data;copy.disabled=false;
    status.textContent=`${data.period.start} 至 ${data.period.end}・僅評比目前仍在會且當月有資料的 ${data.memberCount} 位會員。${data.missingMemberCount?`另有 ${data.missingMemberCount} 位現役會員當月無資料，未列入評比。`:""}`;
  }
  async function load({reloadCatalog=false}={}){
    const id=++requestId,previous=month.value,followLatest=!previous||previous===catalog[0]?.month;
    clear();status.textContent="正在讀取每月績優資料…";
    try{
      if(reloadCatalog){
        month.disabled=true;
        const data=await read();if(id!==requestId)return;
        if(!Array.isArray(data.months))throw new Error("月份清單讀取失敗，請重新整理");
        catalog=data.months;
        const options=catalog.map(item=>{
          const option=document.createElement("option");option.value=item.month;option.textContent=D.monthLabel(item.month);return option;
        });
        month.replaceChildren(...options);
        month.value=(!followLatest&&catalog.some(item=>item.month===previous)?previous:catalog[0]?.month)||"";
      }
      month.disabled=!catalog.length;
      if(!month.value){status.textContent="尚未匯入完整單月 PALMS，請先在上方更新資料。";return;}
      const data=await read(`&month=${encodeURIComponent(month.value)}`);
      if(id!==requestId)return;
      render(data);
    }catch(error){
      if(id!==requestId)return;
      clear();status.textContent=error.message||"無法讀取公告，請重新整理。";
      month.disabled=!catalog.length;
    }
  }
  month.addEventListener("change",()=>load());
  refresh.addEventListener("click",()=>load({reloadCatalog:true}));
  copy.addEventListener("click",async()=>{
    if(!current)return;
    const id=requestId,content=text.value;copy.disabled=true;
    try{
      if(!navigator.clipboard?.writeText)throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(content);
      if(id===requestId)status.textContent="已複製公告，可貼到 LINE 群。";
    }catch{
      if(id!==requestId)return;
      preview.open=true;text.focus();text.select();
      status.textContent="瀏覽器無法自動複製，已選取公告文字，請長按或按 Ctrl／⌘＋C 複製。";
    }finally{if(id===requestId)copy.disabled=!current;}
  });
  window.addEventListener("fulian:monthly-data-status",()=>load({reloadCatalog:true}));
  load({reloadCatalog:true});
})();
