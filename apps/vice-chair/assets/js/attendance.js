(async function(){
  await window.FulianMemberDirectory.ready;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const LOCAL_DRAFT_KEY="fulian-attendance-prototype-v1";
  const LOCAL_HISTORY_KEY="fulian-attendance-history-v1";
  const HISTORY_MIGRATION_KEY="fulian-attendance-history-supabase-v1";
  const authSession=FulianAuth.getSession();
  const AttendanceDomain=window.FulianAttendanceDomain;
  let members=[];
  let rows=[];
  let timer=null;
  let palmsReady=false;
  let palmsPeriod="最新 PALMS 尚未載入";
  let confirmed=false;
  let storedAnnouncement="";
  let history=[];
  const priorLate={};
  const priorProxy={};
  const priorAbsence={};

  function escapeHtml(text){return String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
  function defaultState(member){return{attendanceId:member.attendanceId,name:member.name,profession:member.profession||"",provisional:Boolean(member.provisional),at630:false,at700:false,late:false,early:false,proxy:false,absent:false,speech:false,badge:false,pin:false,suit:false,camera:false,note:""}}
  function isLeadership(){return["vp","admin"].includes(authSession.role)}
  function canFinalConfirm(){return isLeadership()}
  function toast(message){const node=$("#toast");node.textContent=message;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2600)}
  function apiIdentity(){return`${authSession.role}:${authSession.name}`}
  async function api(method="GET",body=null,date=""){
    const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
    if(body)options.body=JSON.stringify({identity:apiIdentity(),...body});
    const query=date?`?date=${encodeURIComponent(date)}&identity=${encodeURIComponent(apiIdentity())}`:`?identity=${encodeURIComponent(apiIdentity())}`;
    const response=await fetch(`/api/attendance${method==="GET"?query:""}`,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||"每週點名服務無法使用");
    return data;
  }
  function configureIdentity(){
    const role=authSession.role;
    const config=FulianAuth.getConfig();
    const recorders=[config.vpName,...config.committee].filter(Boolean);
    const options=`<option value="">請選擇</option>${recorders.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    $("#loginUser").innerHTML=`<option value="${escapeHtml(authSession.name)}" data-role="${role}">${escapeHtml(authSession.name)}（${role==="vp"?"副主席":role==="committee"?"會員委員":"系統開發人員 Admin"}）</option>`;
    $("#loginUser").disabled=true;
    $("#primaryRecorder").innerHTML=options;
    $("#assistantRecorder").innerHTML=options;
    if(recorders.includes(authSession.name))$("#primaryRecorder").value=authSession.name;
  }
  function currentLate(row){return!row.absent&&!row.proxy&&(row.late||row.early)}
  function currentAbsence(row){return AttendanceDomain.isOperationalAbsence(row)}
  function cumulative(row){return AttendanceDomain.cumulativeFor(row,{late:priorLate[row.attendanceId],proxy:priorProxy[row.attendanceId],absence:priorAbsence[row.attendanceId]})}
  function proxyTotal(row){return cumulative(row).proxy}
  function absenceTotal(row){return cumulative(row).absence}
  function lateRemainder(row){return cumulative(row).lateRemainder}
  function list(items){return items.length?items.join("、"):""}
  function groupedLines(label,getCount){
    const groups=new Map();
    for(const row of rows){
      const count=getCount(row);
      if(count<=0)continue;
      if(!groups.has(count))groups.set(count,[]);
      groups.get(count).push(row.name);
    }
    return[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([count,members])=>
      label==="遲到"
        ?`*遲到累計${count}次：${members.join("、")}`
        :`*${label}累計(${count}次)：${members.join("、")}`
    ).join("\n");
  }
  function dateLabel(){
    const value=$("#meetingDate").value;
    if(!value)return"____/__/__";
    const date=new Date(`${value}T00:00:00`);
    return`${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
  }
  function buildAnnouncement(){
    if(confirmed&&storedAnnouncement)return storedAnnouncement;
    const weeklyLate=rows.filter(currentLate).map(row=>row.name);
    const weeklyProxy=rows.filter(row=>row.proxy).map(row=>row.name);
    const weeklyAbsence=rows.filter(currentAbsence).map(row=>row.name);
    return`${palmsReady?"":`【系統提醒：${palmsPeriod}，以下累計不可作為正式公告】\n\n`}【會員委員會公告 】
${dateLabel()} 出席狀況

■ 本日全程會議
富聯會員總人數${rows.length}人
06：30 到${rows.filter(row=>row.at630).length}人
07：00 到${rows.filter(row=>row.at700).length}人
------------------
■本週遲到(${weeklyLate.length}位)：${list(weeklyLate)}
${groupedLines("遲到",lateRemainder)}
------------------
■本週代理人(${weeklyProxy.length}位)：${list(weeklyProxy)}
${groupedLines("代理人",proxyTotal)}
------------------
■本週缺席(${weeklyAbsence.length}位)：${list(weeklyAbsence)}
${groupedLines("缺席",absenceTotal)}
------------------
【 出缺席地基-6個月內連動】
■累積3次遲到+早退轉1次缺席
■缺席最多3次，第4次則需開放專業別
■未進行${$("#speechSeconds").value}秒視同缺席
■限8次代理，第9次則開放專業別
■中心區決議：已無病假，如確診請找代理人代理出席`;
  }
  function applyPermissions(){
    const box=$("#vpConfirmed"),label=$("#vpConfirmLabel"),note=$("#vpPermissionNote"),reopen=$("#reopenWeek");
    if(!canFinalConfirm()&&box.checked)box.checked=false;
    box.disabled=!canFinalConfirm()||confirmed;
    reopen.hidden=!(confirmed&&canFinalConfirm());
    label.classList.toggle("permission-locked",!canFinalConfirm());
    note.textContent=confirmed?(canFinalConfirm()?"可重新開啟修改":"本週已確認"):canFinalConfirm()?"副主席權限已開啟":"僅副主席可操作";
    $$("[data-save], [data-bulk], #clearWeek").forEach(node=>{
      if(node.id==="loginUser")return;
      node.disabled=confirmed;
    });
  }
  function renderRows(){
    $("#memberRows").innerHTML=rows.map((row,index)=>`<tr data-index="${index}"><td><b>${escapeHtml(row.name)}</b>${row.profession?`<small>${escapeHtml(row.profession)}</small>`:""}${row.provisional?`<em>新會員・待 PALMS</em>`:""}</td>${["at630","at700","late","early","proxy","absent","speech","badge","pin","suit","camera"].map(field=>`<td><input type="checkbox" data-field="${field}" ${row[field]?"checked":""} ${confirmed?"disabled":""} aria-label="${escapeHtml(row.name)} ${field}"></td>`).join("")}<td><input type="text" data-field="note" value="${escapeHtml(row.note)}" ${confirmed?"disabled":""} aria-label="${escapeHtml(row.name)}備註"></td></tr>`).join("");
    bindTable();
  }
  function bindTable(){
    $$("#memberRows [data-field]").forEach(element=>element.addEventListener(element.type==="checkbox"?"change":"input",event=>{
      if(confirmed)return;
      const row=rows[Number(event.target.closest("tr").dataset.index)];
      const field=event.target.dataset.field;
      row[field]=event.target.type==="checkbox"?event.target.checked:event.target.value;
      if(field==="absent"&&row.absent){row.at630=false;row.at700=false;row.proxy=false;row.speech=false}
      if(field==="proxy"&&row.proxy){row.absent=false;row.speech=true}
      if((field==="at630"||field==="at700")&&row[field])row.absent=false;
      if(event.target.type==="checkbox")renderRows();
      scheduleSave();
    }));
  }
  function renderHistory(){
    const select=$("#historySession");
    select.innerHTML=`<option value="">選擇已保存週次</option>${history.map(item=>`<option value="${item.meetingDate}">${item.meetingDate}・${item.status==="confirmed"?"已確認":"草稿"}</option>`).join("")}`;
    const date=$("#meetingDate").value;
    if(history.some(item=>item.meetingDate===date))select.value=date;
  }
  function update(){
    applyPermissions();
    const weeklyLate=rows.filter(currentLate),weeklyProxy=rows.filter(row=>row.proxy),weeklyAbsence=rows.filter(currentAbsence);
    $("#totalCount").textContent=rows.length;
    $("#count630").textContent=rows.filter(row=>row.at630).length;
    $("#count700").textContent=rows.filter(row=>row.at700).length;
    $("#lateCount").textContent=weeklyLate.length;
    $("#proxyCount").textContent=weeklyProxy.length;
    $("#absenceCount").textContent=weeklyAbsence.length;
    $("#speechHeader").textContent=`${$("#speechSeconds").value}秒`;
    $("#announcementPreview").textContent=buildAnnouncement();
    $$("#memberRows tr").forEach((tableRow,index)=>{
      tableRow.classList.toggle("alert",currentAbsence(rows[index])||absenceTotal(rows[index])>=4||proxyTotal(rows[index])>=8);
      tableRow.classList.toggle("proxy",rows[index].proxy);
    });
    const ready=palmsReady&&$("#recorderConfirmed").checked&&$("#vpConfirmed").checked&&!confirmed;
    const state=$("#sendState"),button=$("#confirmWeek");
    button.disabled=!ready;
    state.className=`send-state${confirmed?" sent":ready?" ready":""}`;
    state.querySelector("span").textContent=confirmed
      ?"本週紀錄已確認並鎖定"
      :!palmsReady
        ?"最新 PALMS 尚未完成對帳，不能確認正式公告"
        :ready
          ?"雙重確認完成，可以鎖定本週紀錄"
          :"尚未達到確認條件";
  }
  function payload(){
    return{
      meetingDate:$("#meetingDate").value,
      primaryRecorder:$("#primaryRecorder").value,
      assistantRecorder:$("#assistantRecorder").value,
      speechSeconds:$("#speechSeconds").value,
      recorderConfirmed:$("#recorderConfirmed").checked,
      vpConfirmed:canFinalConfirm()&&$("#vpConfirmed").checked,
      rows,
      announcement:buildAnnouncement()
    };
  }
  function saveLocalDraft(){
    const snapshot={...payload(),savedAt:new Date().toISOString(),savedBy:authSession.name};
    localStorage.setItem(LOCAL_DRAFT_KEY,JSON.stringify(snapshot));
    return snapshot;
  }
  async function saveDraft(){
    if(confirmed)return;
    const snapshot=saveLocalDraft();
    $("#saveState").textContent="正在保存至 Supabase…";
    try{
      await api("POST",{action:"save-draft",...snapshot});
      const now=new Date();
      $("#saveState").textContent="草稿與日期紀錄已保存";
      $("#saveTime").textContent=`Supabase 最後保存 ${now.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
    }catch(error){
      $("#saveState").textContent="Supabase 保存失敗";
      $("#saveTime").textContent=`本機草稿已保留・${error.message}`;
    }
    update();
  }
  function scheduleSave(){
    if(confirmed)return;
    storedAnnouncement="";
    $("#saveState").textContent="編輯中…";
    clearTimeout(timer);
    timer=setTimeout(saveDraft,650);
    update();
  }
  function applyTotals(state){
    for(const member of members){
      const official=state.palms.official?.[member.attendanceId]||{};
      const overlay=state.overlay.totals?.[member.attendanceId]||{};
      const merged=AttendanceDomain.mergeTotals(official,overlay);
      priorLate[member.attendanceId]=merged.late;
      priorProxy[member.attendanceId]=merged.proxy;
      priorAbsence[member.attendanceId]=merged.absence;
    }
    palmsReady=Boolean(state.palms.ready);
    palmsPeriod=palmsReady
      ?`正式基準 ${state.palms.periodStart} 至 ${state.palms.periodEnd}・其後已確認 ${state.overlay.sessionCount} 週`
      :`PALMS 與現任會員未完成對帳：缺少 ${state.palms.missing?.join("、")||"未知會員"}`;
    $("#palmsPeriod").textContent=palmsPeriod;
  }
  async function loadDate(date){
    clearTimeout(timer);
    $("#saveState").textContent="正在讀取 Supabase 週次…";
    $("#saveTime").textContent=date;
    try{
      const state=await api("GET",null,date);
      members=state.members||[];
      applyTotals(state);
      history=state.history||[];
      const session=state.session;
      confirmed=session?.status==="confirmed";
      storedAnnouncement=session?.announcementSnapshot||"";
      const byAttendanceId=new Map((session?.rows||[]).map(row=>[row.attendanceId,row]));
      rows=members.map(member=>({...defaultState(member),...(byAttendanceId.get(member.attendanceId)||{})}));
      const canUseSessionName=[...$("#primaryRecorder").options].some(option=>option.value===authSession.name);
      $("#primaryRecorder").value=session?.primaryRecorder||(canUseSessionName?authSession.name:"");
      $("#assistantRecorder").value=session?.assistantRecorder||"";
      $("#recorderConfirmed").checked=Boolean(session?.recorderConfirmed);
      $("#vpConfirmed").checked=Boolean(session?.vpConfirmed);
      renderRows();
      renderHistory();
      $("#saveState").textContent=confirmed?"已載入確認紀錄":session?"已載入 Supabase 草稿":"新週次尚未保存";
      $("#saveTime").textContent=confirmed&&session.confirmedAt
        ?`${session.confirmedBy||"副主席"}・${new Date(session.confirmedAt).toLocaleString("zh-TW")}`
        :`${state.palms.source}`;
    }catch(error){
      palmsReady=false;
      palmsPeriod=`PALMS／週次讀取失敗：${error.message}`;
      $("#palmsPeriod").textContent=palmsPeriod;
      rows=members.map(defaultState);
      renderRows();
      $("#saveState").textContent="資料載入失敗";
      $("#saveTime").textContent=error.message;
    }
    update();
  }
  async function migrateConfirmedLocalHistory(){
    if(!isLeadership()||localStorage.getItem(HISTORY_MIGRATION_KEY))return;
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY)||"{}")||{}}catch{}
    const confirmedHistory=Object.values(saved).filter(item=>item?.meetingDate&&item?.recorderConfirmed&&item?.vpConfirmed);
    if(!confirmedHistory.length){
      localStorage.setItem(HISTORY_MIGRATION_KEY,new Date().toISOString());
      return;
    }
    try{
      const result=await api("POST",{action:"import-history",history:confirmedHistory});
      localStorage.setItem(HISTORY_MIGRATION_KEY,new Date().toISOString());
      toast(result.message);
    }catch(error){
      console.warn("既有點名歷史尚未搬移",error);
    }
  }
  async function confirmWeek(){
    if(!canFinalConfirm()||confirmed)return;
    if(!confirm("確認本週點名與 LINE 公告內容？確認後此週將鎖定，後續週次會把它列入 PALMS 截止日後的暫時累計。"))return;
    clearTimeout(timer);
    $("#confirmWeek").disabled=true;
    $("#saveState").textContent="正在確認本週紀錄…";
    try{
      const result=await api("POST",{action:"confirm",...payload()});
      confirmed=true;
      storedAnnouncement=buildAnnouncement();
      $("#saveState").textContent="本週紀錄已確認";
      $("#saveTime").textContent=new Date(result.session.confirmed_at).toLocaleString("zh-TW");
      toast(result.message);
      await loadDate($("#meetingDate").value);
    }catch(error){
      $("#saveState").textContent="確認失敗";
      $("#saveTime").textContent=error.message;
      toast(error.message);
    }
    update();
  }
  async function reopenWeek(){
    if(!canFinalConfirm()||!confirmed)return;
    if(!confirm("要重新開啟這一週的點名紀錄嗎？重新開啟後請修正內容，並再次完成主要紀錄與副主席確認。"))return;
    $("#reopenWeek").disabled=true;
    $("#saveState").textContent="正在重新開啟本週紀錄…";
    try{
      const result=await api("POST",{action:"reopen",meetingDate:$("#meetingDate").value});
      confirmed=false;
      storedAnnouncement="";
      toast(result.message);
      await loadDate($("#meetingDate").value);
    }catch(error){
      $("#saveState").textContent="重新開啟失敗";
      $("#saveTime").textContent=error.message;
      toast(error.message);
    }finally{
      $("#reopenWeek").disabled=false;
    }
    update();
  }
  async function copyAnnouncement(){
    const text=buildAnnouncement();
    try{
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
    }catch{
      const textarea=document.createElement("textarea");
      textarea.value=text;
      textarea.setAttribute("readonly","");
      textarea.style.cssText="position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied=document.execCommand("copy");
      textarea.remove();
      if(!copied)return toast("瀏覽器無法自動複製，請長按預覽文字後選擇複製");
    }
    toast(confirmed?"已複製確認版公告，可貼到 LINE 群組":"公告已複製；本週尚未由副主席確認");
  }
  async function init(){
    const now=new Date(),pad=value=>String(value).padStart(2,"0");
    configureIdentity();
    $("#meetingDate").value=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    await migrateConfirmedLocalHistory();
    await loadDate($("#meetingDate").value);
    $$("[data-save]").forEach(element=>{
      if(element.id==="meetingDate")element.addEventListener("change",()=>loadDate(element.value));
      else{
        element.addEventListener("change",scheduleSave);
        element.addEventListener("input",scheduleSave);
      }
    });
    $("#historySession").onchange=event=>{
      if(!event.target.value)return;
      $("#meetingDate").value=event.target.value;
      loadDate(event.target.value);
    };
    $$("[data-bulk]").forEach(button=>button.onclick=()=>{
      if(confirmed)return;
      const type=button.dataset.bulk;
      if(type==="appearance")rows.forEach(row=>{row.badge=row.pin=row.suit=row.camera=true});
      else rows.forEach(row=>row[type]=true);
      renderRows();
      scheduleSave();
    });
    $("#clearWeek").onclick=()=>{
      if(confirmed)return;
      if(confirm("要清除本週點名狀態嗎？PALMS 正式累計與其他已確認週次不會清除。")){
        rows=members.map(defaultState);
        renderRows();
        scheduleSave();
      }
    };
    $("#copyAnnouncement").onclick=copyAnnouncement;
    $("#reopenWeek").onclick=reopenWeek;
    $("#confirmWeek").onclick=confirmWeek;
    update();
  }
  init();
})();
