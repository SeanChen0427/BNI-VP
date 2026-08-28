(async function(){
await window.FulianMemberDirectory.ready;
const session=FulianAuth.getSession();let config=FulianAuth.getConfig();const AUDIT_KEY="fulian-auth-audit-v1",memberDirectory=window.FulianMemberDirectory?.members||[];let audit=JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");const $=s=>document.querySelector(s);
const taipeiDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1800)}
function log(text){audit.unshift({text,time:new Date().toLocaleString("zh-TW")});audit=audit.slice(0,20);localStorage.setItem(AUDIT_KEY,JSON.stringify(audit));}
function memberOptions(excluded=[]){const blocked=new Set(excluded);return memberDirectory.filter(name=>!blocked.has(name)).map(name=>`<option value="${name}"></option>`).join("")}
function renderMemberPickers(){$("#vpMemberOptions").innerHTML=memberOptions(config.committee);$("#committeeMemberOptions").innerHTML=memberOptions([config.vpName,...config.committee]);}
function render(){
  const admin=session.role==="admin",manager=FulianAuth.can("manageCommittee");
  $("#credentialsCard").hidden=!admin;$("#auditCard").hidden=!admin;
  $("#committeeTotal").textContent=config.committee.length;$("#vpName").value=config.vpName;$("#vpName").disabled=!admin;$("#saveVp").disabled=!admin;
  $("#newMember").disabled=!manager;$("#addMember").disabled=!manager;
  $("#committeeList").innerHTML=config.committee.map(name=>`<article class="committee-member"><i>${name.slice(-1)}</i><div><b>${name}</b><small>會員委員・可使用共用委員帳號</small></div><button data-remove="${name}" ${manager?"":"disabled"}>移除</button></article>`).join("");
  $("#credentialFields").innerHTML=admin?[['admin','系統開發人員 Admin'],['vp','副主席共用帳號'],['committee','委員共用帳號']].map(([key,label])=>`<div class="credential-box"><b>${label}</b><label>帳號<input id="${key}Username" value="${config.accounts[key].username}" readonly></label><label>設定新密碼<input id="${key}Password" type="password" autocomplete="new-password" minlength="12" placeholder="至少 12 個字元"></label></div>`).join(""):"";
  $("#saveCredentials").hidden=!admin;
  $("#auditLog").innerHTML=admin?(audit.length?audit:[{text:"尚無設定異動",time:""}]).map(item=>`<li><b>${item.text}</b><span>${item.time}</span></li>`).join(""):"";
  renderMemberPickers();
  document.querySelectorAll("[data-remove]").forEach(button=>button.onclick=()=>{const name=button.dataset.remove;if(!manager)return;config.committee=config.committee.filter(x=>x!==name);FulianAuth.saveConfig(config);log(`${session.name}移除會員委員：${name}`);render();toast("委員已移除");});
}
$("#saveVp").onclick=()=>{if(session.role!=="admin")return;const name=$("#vpName").value.trim();if(!name)return toast("請選擇副主席");if(!memberDirectory.includes(name))return toast("請從現有會員名單中選擇");config.vpName=name;config.committee=config.committee.filter(x=>x!==name);FulianAuth.saveConfig(config);log(`Admin指定副主席：${name}`);render();toast("副主席已更新")};
$("#addMember").onclick=()=>{if(!FulianAuth.can("manageCommittee"))return;const name=$("#newMember").value.trim();if(!name)return toast("請選擇會員");if(!memberDirectory.includes(name))return toast("請從現有會員名單中選擇");if(name===config.vpName||config.committee.includes(name))return toast("此姓名已在名單中");config.committee.push(name);FulianAuth.saveConfig(config);log(`${session.name}新增會員委員：${name}`);$("#newMember").value="";render();toast("委員已新增")};
$("#saveCredentials").onclick=async()=>{
  if(session.role!=="admin")return;
  const passwords={};
  for(const key of ["admin","vp","committee"]){
    passwords[key]=$("#"+key+"Password").value;
    if(passwords[key].length<12)return toast("三組新密碼都必須至少 12 個字元");
  }
  const button=$("#saveCredentials");
  button.disabled=true;
  button.textContent="正在安全更新…";
  try{
    await FulianAuth.updateSharedPasswords(passwords);
    log("Admin更新三組登入密碼");
    ["admin","vp","committee"].forEach(key=>{$("#"+key+"Password").value=""});
    toast("密碼已更新，請用新密碼重新登入");
    setTimeout(()=>FulianAuth.logout(),1500);
  }catch(error){
    toast(error.message||"密碼更新失敗");
    button.disabled=false;
    button.textContent="更新三組密碼";
  }
};
const TEST_RESET_CONFIRMATION="清除測試資料",canResetTestData=session.role==="admin";
function resetIdentity(){return`${session.role}:${session.name}`}
async function resetServerSummary(){
  const response=await fetch(`/api/test-data-reset?identity=${encodeURIComponent(resetIdentity())}`,{cache:"no-store"}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||"無法讀取月會測試資料");
  return data;
}
async function loadTestDataSummary(){
  if(!canResetTestData)return;
  $("#testResetResult").textContent="正在統計目前資料…";
  try{
    const [browserSummary,serverSummary]=await Promise.all([
      window.FulianTestDataReset.summary({storage:localStorage,indexedDb:indexedDB}),
      resetServerSummary()
    ]);
    $("#resetTaskCount").textContent=serverSummary.tasks;
    $("#resetWorkflowCount").textContent=browserSummary.workflows;
    $("#resetDraftCount").textContent=browserSummary.drafts;
    $("#resetAttachmentCount").textContent=serverSummary.files;
    $("#resetMeetingCount").textContent=serverSummary.meetings;
    const total=serverSummary.tasks+browserSummary.workflows+browserSummary.drafts+serverSummary.files+serverSummary.meetings;
    $("#testResetResult").textContent=total?`目前共有 ${total} 筆／份測試流程資料可清除。`:"目前沒有可清除的測試流程資料。";
  }catch(error){
    $("#testResetResult").textContent=`統計失敗：${error.message}`;
  }
}
async function resetAllTestData(){
  if(!canResetTestData||$("#testResetConfirmation").value.trim()!==TEST_RESET_CONFIRMATION)return;
  if(!confirm("最後確認：要清除全部月會、案件、訪談、回饋、投票與案件附件嗎？此操作無法復原。"))return;
  const button=$("#resetTestData");button.disabled=true;button.textContent="正在清除…";$("#testResetResult").textContent="正在清除伺服器與瀏覽器測試資料…";
  try{
    const response=await fetch("/api/test-data-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identity:resetIdentity(),confirmation:"RESET_FULIAN_TEST_DATA"})}),serverResult=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(serverResult.message||"月會測試資料清除失敗");
    const browserResult=await window.FulianTestDataReset.reset({storage:localStorage,indexedDb:indexedDB});
    log(`${session.name}清除測試流程資料`);
    $("#testResetConfirmation").value="";
    window.dispatchEvent(new CustomEvent("fulian:data-changed",{detail:{source:"test-data-reset"}}));
    await loadTestDataSummary();
    const protectedNote=serverResult.protectedNewMemberCases?` 已保留 ${serverResult.protectedNewMemberCases} 筆新會員登錄及其來源結案。`:"";
    $("#testResetResult").textContent=`清除完成：${serverResult.tasks} 筆伺服器案件、${browserResult.workflows} 筆本機流程、${browserResult.drafts} 份本機草稿、${serverResult.files} 份 Private Storage 附件、${serverResult.meetings} 筆月會紀錄。${protectedNote}`;
    toast("測試流程資料已全部清除");
  }catch(error){
    $("#testResetResult").textContent=`清除失敗：${error.message}`;
    toast("測試資料清除失敗");
  }finally{
    button.textContent="清除全部測試流程資料";
    button.disabled=$("#testResetConfirmation").value.trim()!==TEST_RESET_CONFIRMATION;
  }
}
function initTestDataReset(){
  if(!canResetTestData)return;
  $("#testDataResetCard").hidden=false;
  $("#refreshTestDataSummary").onclick=loadTestDataSummary;
  $("#testResetConfirmation").oninput=event=>{$("#resetTestData").disabled=event.target.value.trim()!==TEST_RESET_CONFIRMATION};
  $("#resetTestData").onclick=resetAllTestData;
  loadTestDataSummary();
}
const canManageNewMembers=["admin","vp"].includes(session.role);
let newMemberRegistrationState={eligibleCases:[],registrations:[],officialCount:0,pendingCount:0,operationalCount:0};
function newMemberIdentity(){return`${session.role}:${session.name}`}
async function newMemberRegistrationApi(method="GET",payload=null){
  const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
  if(payload)options.body=JSON.stringify({identity:newMemberIdentity(),...payload});
  const suffix=method==="GET"?`?identity=${encodeURIComponent(newMemberIdentity())}`:"";
  const response=await fetch(`/api/new-member-registration${suffix}`,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||"新會員登錄服務無法使用");
  return data;
}
function selectedNewMemberCase(){return newMemberRegistrationState.eligibleCases.find(item=>item.taskId===$("#newMemberCase").value)||null}
function refreshNewMemberRegistrationForm(){
  const selected=selectedNewMemberCase();
  $("#newMemberRegistrationName").value=selected?.name||"";
  if(document.activeElement!==$("#newMemberProfession"))$("#newMemberProfession").value=selected?.profession||"";
  const confirmed=$("#newMemberConfirmName").value.trim().replace(/\s+/g,"")===String(selected?.name||"").replace(/\s+/g,"");
  $("#registerNewMember").disabled=!(selected&&$("#newMemberProfession").value.trim()&&$("#newMemberJoinedOn").value&&confirmed);
  const sameName=(newMemberRegistrationState.registrations||[]).filter(item=>item.status==="pending_palms"&&item.name===selected?.name);
  $("#newMemberRegistrationNote").innerHTML=sameName.length
    ?`<b>同名提醒：</b>目前另有 ${sameName.map(item=>escapeHtml(item.profession)).join("、")} 的同名待確認會員。本次不同專業別可登錄，但 PALMS 沒有專業別，下一次對帳將停止自動升格並要求人工確認，絕不猜測。`
    :`<b>資料來源分工：</b>登錄後立即加入每週點名與 LINE 公告人數；不會進入續約、期中關懷、會員儀表板或正式分析。下一份半年 PALMS 能唯一對上姓名時，才升格正式會員；同名時系統不會猜測。`;
}
function renderNewMemberRegistrationState(){
  const state=newMemberRegistrationState;
  $("#officialMemberCount").textContent=state.officialCount;
  $("#pendingMemberCount").textContent=state.pendingCount;
  $("#operationalMemberCount").textContent=state.operationalCount;
  $("#newMemberCase").innerHTML=`<option value="">請選擇已完成案件</option>${(state.eligibleCases||[]).map(item=>`<option value="${escapeHtml(item.taskId)}">${escapeHtml(item.name)}${item.profession?`・${escapeHtml(item.profession)}`:""}</option>`).join("")}`;
  const labels={pending_palms:"待 PALMS",promoted:"已升格正式會員",cancelled:"已撤銷"};
  $("#newMemberRegistrationList").innerHTML=(state.registrations||[]).length
    ?state.registrations.map(item=>`<article><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.profession)}</span><span>入會 ${escapeHtml(item.joinedOn)}</span><em>${labels[item.status]||escapeHtml(item.status)}</em>${item.status==="pending_palms"?`<button type="button" data-cancel-new-member="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">撤銷誤登錄</button>`:""}</article>`).join("")
    :`<article><span>目前沒有新會員登錄紀錄。</span></article>`;
  document.querySelectorAll("[data-cancel-new-member]").forEach(button=>button.onclick=()=>cancelNewMemberRegistration(button.dataset.cancelNewMember,button.dataset.name));
  refreshNewMemberRegistrationForm();
}
async function loadNewMemberRegistrationState(){
  $("#newMemberRegistrationStatus").textContent="正在載入新會員案件…";
  try{
    newMemberRegistrationState=await newMemberRegistrationApi();
    renderNewMemberRegistrationState();
    $("#newMemberRegistrationStatus").textContent=newMemberRegistrationState.eligibleCases.length?"請選擇已完成案件":"目前沒有待登錄的已結案新會員案件";
  }catch(error){$("#newMemberRegistrationStatus").textContent=`載入失敗：${error.message}`}
}
async function registerNewMemberFlow(){
  const selected=selectedNewMemberCase();
  if(!selected)return;
  const profession=$("#newMemberProfession").value.trim();
  if(!confirm(`最後確認：將「${selected.name}｜${profession}」加入每週點名名單？\n正式分析仍須等待 PALMS 對帳。`))return;
  const button=$("#registerNewMember");button.disabled=true;$("#newMemberRegistrationStatus").textContent="登錄中…";
  try{
    const data=await newMemberRegistrationApi("POST",{action:"register",taskId:selected.taskId,profession,joinedOn:$("#newMemberJoinedOn").value,confirmName:$("#newMemberConfirmName").value.trim()});
    newMemberRegistrationState=data.state;
    $("#newMemberConfirmName").value="";
    renderNewMemberRegistrationState();
    $("#newMemberRegistrationStatus").textContent=data.message;
    log(`${session.name}登錄新會員：${selected.name}｜${profession}`);toast("新會員已加入點名名單");
  }catch(error){$("#newMemberRegistrationStatus").textContent=error.message;toast("新會員登錄失敗")}
  refreshNewMemberRegistrationForm();
}
async function cancelNewMemberRegistration(id,name){
  const typed=prompt(`撤銷「${name}」的新會員登錄：請重新輸入完整姓名確認`);
  if(typed===null)return;
  try{
    const data=await newMemberRegistrationApi("POST",{action:"cancel",id,confirmName:typed.trim()});
    newMemberRegistrationState=data.state;renderNewMemberRegistrationState();
    $("#newMemberRegistrationStatus").textContent=data.message;log(`${session.name}撤銷新會員登錄：${name}`);toast("已撤銷新會員登錄");
  }catch(error){$("#newMemberRegistrationStatus").textContent=error.message;toast("撤銷失敗")}
}
function initNewMemberRegistration(){
  if(!canManageNewMembers)return;
  $("#newMemberRegistrationCard").hidden=false;
  $("#newMemberJoinedOn").value=taipeiDay();
  $("#newMemberCase").onchange=()=>{$("#newMemberConfirmName").value="";refreshNewMemberRegistrationForm()};
  ["newMemberProfession","newMemberJoinedOn","newMemberConfirmName"].forEach(id=>$("#"+id).addEventListener("input",refreshNewMemberRegistrationForm));
  $("#registerNewMember").onclick=registerNewMemberFlow;
  loadNewMemberRegistrationState();
}
const canManageDeparture=["admin","vp"].includes(session.role);
const DEPARTURE_PREVIEW_LIMIT=5;
let departureState={currentMembers:[],departed:[]};
let departureHistoryExpanded=false;
function departureIdentity(){return`${session.role}:${session.name}`}
function sortedDepartures(){
  return departureState.departed
    .map((record,index)=>({...record,_sourceIndex:index}))
    .sort((a,b)=>String(b.confirmedAt||"").localeCompare(String(a.confirmedAt||""))||a._sourceIndex-b._sourceIndex);
}
function renderDepartureState(){
  const departed=sortedDepartures();
  const visible=departureHistoryExpanded?departed:departed.slice(0,DEPARTURE_PREVIEW_LIMIT);
  const interviewLabels={optional:"離會訪談未安排（選擇性）",scheduled:"離會訪談已排定",completed:"離會訪談已完成",waived:"已標記不安排訪談"};
  $("#departureMemberOptions").innerHTML=departureState.currentMembers.map(m=>`<option value="${escapeHtml(m.name)}">${escapeHtml(m.profession||"")}</option>`).join("");
  $("#departedList").innerHTML=visible.length
    ?visible.map(d=>{
      const status=d.interviewStatus||"optional";
      const action=status==="optional"
        ?`<a href="case-board.html?new=departure&amp;memberId=${encodeURIComponent(d.memberId||"")}">安排離會訪談</a><button type="button" data-departure-interview-disposition="waived" data-member-id="${escapeHtml(d.memberId||"")}" data-member-name="${escapeHtml(d.name)}">不安排</button>`
        :status==="waived"
          ?`<button type="button" data-departure-interview-disposition="optional" data-member-id="${escapeHtml(d.memberId||"")}" data-member-name="${escapeHtml(d.name)}">改為可安排</button>`
          :status==="scheduled"
            ?`<a href="case-board.html#active">查看排程</a>`
            :`<a href="case-archive.html?case=${encodeURIComponent(d.interviewTaskId||"")}">查看訪談紀錄</a>`;
      const timing=status==="scheduled"&&d.interviewScheduledAt?`・${new Date(d.interviewScheduledAt).toLocaleString("zh-TW")}`:status==="completed"&&d.interviewCompletedAt?`・${new Date(d.interviewCompletedAt).toLocaleString("zh-TW")}`:"";
      return`<article><div class="departure-record-copy"><b>${escapeHtml(d.name)}</b><span>離會確認日 ${escapeHtml(d.confirmedAt||"—")}・${escapeHtml(d.profession||"未設定專業別")}</span><span>${escapeHtml(d.note||"—")}</span><em data-status="${escapeHtml(status)}">${escapeHtml(interviewLabels[status]||status)}${escapeHtml(timing)}</em></div><div class="departure-record-actions">${action}<button type="button" data-undo-departure="${escapeHtml(d.name)}">撤銷離會</button></div></article>`;
    }).join("")
    :`<article><span>目前離會名單沒有紀錄。</span></article>`;
  $("#departureHistorySummary").textContent=departed.length>DEPARTURE_PREVIEW_LIMIT&&!departureHistoryExpanded
    ?`顯示最近 ${DEPARTURE_PREVIEW_LIMIT} 人・共 ${departed.length} 人`
    :`共 ${departed.length} 人`;
  const toggle=$("#toggleDepartureHistory");
  toggle.hidden=departed.length<=DEPARTURE_PREVIEW_LIMIT;
  toggle.textContent=departureHistoryExpanded?"收合歷史紀錄":`查看全部歷史紀錄（${departed.length} 人）`;
  toggle.setAttribute("aria-expanded",String(departureHistoryExpanded));
  document.querySelectorAll("[data-undo-departure]").forEach(button=>button.onclick=()=>undoDepartureFlow(button.dataset.undoDeparture));
  document.querySelectorAll("[data-departure-interview-disposition]").forEach(button=>button.onclick=()=>setDepartureInterviewDisposition(button.dataset.memberId,button.dataset.memberName,button.dataset.departureInterviewDisposition));
}
async function loadDepartureState(){
  try{
    const response=await fetch(`/api/member-departure?identity=${encodeURIComponent(departureIdentity())}`,{cache:"no-store"}),data=await response.json();
    if(!response.ok)throw new Error(data.message||"無法讀取名單");
    departureState=data;renderDepartureState();$("#departureStatus").textContent="";
  }catch(error){$("#departureStatus").textContent=`名單載入失敗：${error.message}`}
}
function departureWarnings(name){
  const warnings=[];
  if(name===config.vpName)warnings.push("此會員是現任副主席：離會前必須先由 Admin 指定新副主席。");
  if(config.committee.includes(name))warnings.push("此會員是會員委員：登記後請到上方委員名單移除，其委員登入將失效。");
  try{const plan=localStorage.getItem("fulian-work-plan-v1")||"";if(plan.includes(name))warnings.push("此會員出現在案件資料中：請確認其進行中案件已結案或移轉負責人（系統不會自動處理案件）。")}catch{}
  return warnings;
}
function refreshDepartureForm(){
  const name=$("#departureName").value.trim(),confirmName=$("#departureConfirmName").value.trim();
  const known=departureState.currentMembers.some(m=>m.name===name);
  const warnings=known?departureWarnings(name):[];
  $("#departureWarnings").hidden=!warnings.length;
  $("#departureWarnings").innerHTML=warnings.map(w=>`<span>⚠ ${w}</span>`).join("");
  $("#registerDeparture").disabled=!(known&&confirmName===name&&$("#departureDate").value);
}
async function departurePost(payload){
  const response=await fetch("/api/member-departure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identity:departureIdentity(),...payload})}),data=await response.json();
  if(!response.ok)throw new Error(data.message||"操作失敗");
  return data;
}
async function registerDepartureFlow(){
  const name=$("#departureName").value.trim();
  if(!confirm(`最後確認：登記「${name}」離會？\n分析排除名單、會員主檔與會員選單會同步更新。`))return;
  const button=$("#registerDeparture");button.disabled=true;$("#departureStatus").textContent="登記中…";
  try{
    const data=await departurePost({action:"register",name,confirmName:$("#departureConfirmName").value.trim(),confirmedAt:$("#departureDate").value,note:$("#departureNote").value.trim()});
    departureState=data.state;renderDepartureState();
    $("#departureName").value="";$("#departureConfirmName").value="";$("#departureNote").value="";
    $("#departureStatus").textContent=data.message;log(`${session.name}登記離會：${name}`);toast("離會登記完成");
  }catch(error){$("#departureStatus").textContent=error.message;toast("離會登記失敗")}
  refreshDepartureForm();
}
async function undoDepartureFlow(name){
  const typed=prompt(`撤銷「${name}」的離會登記：請重新輸入完整姓名確認`);
  if(typed===null)return;
  try{
    const data=await departurePost({action:"undo",name,confirmName:typed.trim()});
    departureState=data.state;renderDepartureState();
    $("#departureStatus").textContent=data.message;log(`${session.name}撤銷離會登記：${name}`);toast("已撤銷離會登記");
  }catch(error){$("#departureStatus").textContent=error.message;toast("撤銷失敗")}
}
async function setDepartureInterviewDisposition(memberId,name,disposition){
  if(disposition==="waived"&&!confirm(`確認暫不安排「${name}」的離會訪談？\n這不影響離會狀態，之後仍可改回可安排。`))return;
  try{
    const data=await departurePost({action:"set-interview-disposition",memberId,disposition});
    departureState=data.state;renderDepartureState();
    $("#departureStatus").textContent=data.message;log(`${session.name}${disposition==="waived"?"標記不安排":"恢復可安排"}離會訪談：${name}`);toast(data.message);
  }catch(error){$("#departureStatus").textContent=error.message;toast("離會訪談設定失敗")}
}
function initDeparture(){
  if(!canManageDeparture)return;
  $("#departureCard").hidden=false;
  $("#departureDate").value=taipeiDay();
  ["departureName","departureConfirmName","departureDate"].forEach(id=>{$("#"+id).addEventListener("input",refreshDepartureForm)});
  $("#registerDeparture").onclick=registerDepartureFlow;
  $("#toggleDepartureHistory").onclick=()=>{departureHistoryExpanded=!departureHistoryExpanded;renderDepartureState()};
  loadDepartureState();
}
const canManageLineGroups=["admin","vp"].includes(session.role);
const LINE_ROUTE_LABELS={attendance:"每週出席公告",committee:"會員委員會通知",leadership:"三長／董顧通知",exchange:"交流群常態通知"};
const LINE_ROUTE_CHANNELS={attendance:"vice_chair",committee:"committee",leadership:"vice_chair",exchange:"vice_chair"};
const LINE_CHANNEL_LABELS={vice_chair:"副主席秘書Bot",committee:"會員委員秘書Bot"};
let lineGroupsState={configured:false,channels:{viceChair:false,committee:false},targets:[]};
function lineGroupIdentity(){return`${session.role}:${session.name}`}
async function lineGroupsApi(method="GET",payload=null){
  const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
  if(payload)options.body=JSON.stringify({identity:lineGroupIdentity(),...payload});
  const suffix=method==="GET"?`?identity=${encodeURIComponent(lineGroupIdentity())}`:"";
  const response=await fetch(`/api/line-groups${suffix}`,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||"LINE 群組服務無法使用");
  return data;
}
function renderLineGroups(){
  const targets=lineGroupsState.targets||[];
  const active=targets.filter(item=>item.status==="active");
  const candidates=targets.filter(item=>item.availableForAssignment&&item.status!=="active");
  const environments=[{key:"test",label:"測試群"},{key:"production",label:"正式群"}];
  $("#lineGroupRoutes").innerHTML=Object.entries(LINE_ROUTE_LABELS).flatMap(([routeKey,label])=>environments.map(environment=>{
    const target=active.find(item=>item.routeKey===routeKey&&item.environment===environment.key);
    return target
      ?`<article class="line-group-route"><div><b>${escapeHtml(label)}・${environment.label}</b><small>${escapeHtml(target.displayName)}・${escapeHtml(target.oaName||LINE_CHANNEL_LABELS[target.oaChannel]||"LINE 助理")}</small></div><em>${environment.label}</em><button type="button" data-disable-line-group="${escapeHtml(target.id)}" data-name="${escapeHtml(target.displayName)}">停用</button></article>`
      :`<article class="line-group-route"><div><b>${escapeHtml(label)}・${environment.label}</b><small>尚未指定群組・應由${escapeHtml(LINE_CHANNEL_LABELS[LINE_ROUTE_CHANNELS[routeKey]])}</small></div><em>未啟用</em></article>`;
  })).join("");
  $("#lineGroupDiscovered").innerHTML=candidates.length?candidates.map(item=>{
    const routeOptions=Object.entries(LINE_ROUTE_LABELS).filter(([routeKey])=>LINE_ROUTE_CHANNELS[routeKey]===item.oaChannel).map(([routeKey,label])=>`<option value="${escapeHtml(routeKey)}">${escapeHtml(label)}</option>`).join("");
    return`<article class="line-group-candidate"><div><b>${escapeHtml(item.displayName)}</b><small>${escapeHtml(item.oaName||LINE_CHANNEL_LABELS[item.oaChannel]||"LINE 助理")}・${item.status==="disabled"?"已停用，可直接重新指定":`最近收到群組事件 ${item.lastEventAt?new Date(item.lastEventAt).toLocaleString("zh-TW"):"—"}`}</small></div><select data-line-route="${escapeHtml(item.id)}" aria-label="群組用途">${routeOptions}</select><select data-line-environment="${escapeHtml(item.id)}" aria-label="群組環境"><option value="test">測試群</option><option value="production">正式群</option></select><button type="button" data-assign-line-group="${escapeHtml(item.id)}" data-name="${escapeHtml(item.displayName)}">${item.status==="disabled"?"重新啟用":"確認加入"}</button></article>`
  }).join(""):`<div class="line-group-empty">目前沒有可指定群組。邀請對應的 LINE 助理後，請在群內傳一則普通訊息。</div>`;
  document.querySelectorAll("[data-assign-line-group]").forEach(button=>button.onclick=()=>assignLineGroup(button.dataset.assignLineGroup,button.dataset.name));
  document.querySelectorAll("[data-disable-line-group]").forEach(button=>button.onclick=()=>disableLineGroup(button.dataset.disableLineGroup,button.dataset.name));
  const channels=lineGroupsState.channels||{};
  $("#lineGroupStatus").textContent=`目前已啟用 ${active.length}/8 個「用途＋環境」群組。副主席秘書Bot${channels.viceChair?"已設定":"待設定"}；會員委員秘書Bot${channels.committee?"已設定":"待設定"}。`;
}
async function loadLineGroups(){
  $("#lineGroupStatus").textContent="正在讀取 LINE Bot 狀態…";
  try{lineGroupsState=await lineGroupsApi();renderLineGroups()}catch(error){$("#lineGroupStatus").textContent=`載入失敗：${error.message}`}
}
async function assignLineGroup(id,name){
  const routeKey=document.querySelector(`[data-line-route="${id}"]`)?.value||"";
  const environment=document.querySelector(`[data-line-environment="${id}"]`)?.value||"test";
  const label=LINE_ROUTE_LABELS[routeKey]||routeKey;
  if(!confirm(`確認將「${name}」指定為「${label}」${environment==="test"?"測試群":"正式群"}？\n\n只有相同「用途＋環境」的原群組會被停用；測試群與正式群可同時保留。`))return;
  $("#lineGroupStatus").textContent="正在向 LINE 核對群組…";
  try{const result=await lineGroupsApi("POST",{action:"assign",targetId:id,routeKey,environment});log(`${session.name}確認 LINE 群組：${name}｜${label}`);toast(result.message);await loadLineGroups();await loadVoteTest(true)}catch(error){$("#lineGroupStatus").textContent=error.message;toast("LINE 群組確認失敗")}
}
async function disableLineGroup(id,name){
  if(!confirm(`停用「${name}」的系統發送權限？\n\nBot 不會被踢出 LINE 群組，但系統將無法再發送到該群。`))return;
  $("#lineGroupStatus").textContent="正在停用群組…";
  try{const result=await lineGroupsApi("POST",{action:"disable",targetId:id});log(`${session.name}停用 LINE 群組：${name}`);toast(result.message);await loadLineGroups();await loadVoteTest(true)}catch(error){$("#lineGroupStatus").textContent=error.message;toast("停用失敗")}
}
function initLineGroups(){
  if(!canManageLineGroups)return;
  $("#lineBotGroups").hidden=false;
  loadLineGroups();
}
let voteTestState={configured:false,target:null,subjects:[],latest:null};
let voteTestCallText="";
let voteTestPoll=null;
function voteTestIdentity(){return`${session.role}:${session.name}`}
async function voteTestApi(method="GET",payload=null){
  const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
  if(payload)options.body=JSON.stringify({identity:voteTestIdentity(),...payload});
  const suffix=method==="GET"?`?identity=${encodeURIComponent(voteTestIdentity())}`:"";
  const response=await fetch(`/api/vote-test${suffix}`,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||"投票測試服務無法使用");
  return data;
}
function voteTestStatusLabel(status){
  return({awaiting_reply:"等待把完整文案貼到測試群",replying:"Bot 正在回覆圖卡",replied:"Bot 已回覆圖卡，可從 LINE 開啟投票",reply_failed:"Bot 回覆失敗，請將相同完整文案再貼一次",expired:"測試已逾時",revoked:"測試已被新版取代"})[status]||status||"尚未建立";
}
function renderVoteTest(){
  const selected=$("#voteTestSubject").value;
  $("#voteTestSubject").innerHTML=`<option value="">請選擇一位現任會員</option>${(voteTestState.subjects||[]).map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}・${escapeHtml(item.profession||"未設定專業別")}</option>`).join("")}`;
  if((voteTestState.subjects||[]).some(item=>item.id===selected))$("#voteTestSubject").value=selected;
  $("#voteTestTarget").textContent=voteTestState.target?`${voteTestState.target.displayName}・會員委員秘書Bot`:"尚未指定會員委員會測試群";
  $("#prepareVoteTest").disabled=!(voteTestState.configured&&voteTestState.target&&$("#voteTestSubject").value);
  const latest=voteTestState.latest;
  const current=$("#voteTestCurrent");
  current.dataset.status=latest?.status||"";
  current.textContent=latest?`${latest.applicant}・${voteTestStatusLabel(latest.status)}・已投 ${latest.voteCount||0} 票`:"尚未建立測試投票。";
  $("#deleteVoteTest").disabled=!latest;
  $("#voteTestActions").hidden=!(voteTestCallText||latest);
  if(!voteTestCallText)$("#copyVoteTest").disabled=true;
  const waiting=["awaiting_reply","replying","reply_failed"].includes(latest?.status);
  clearInterval(voteTestPoll);voteTestPoll=null;
  if(waiting)voteTestPoll=setInterval(()=>{if(!document.hidden)loadVoteTest(true)},5000);
}
async function loadVoteTest(silent=false){
  if(!silent)$("#voteTestStatus").textContent="正在讀取投票測試器…";
  try{
    const previous=voteTestState.latest?.status;
    voteTestState=await voteTestApi();renderVoteTest();
    if(!silent)$("#voteTestStatus").textContent=voteTestState.target?"選擇會員後產生文案，再完整貼到測試群。":"請先在上方指定會員委員會測試群。";
    if(silent&&previous!==voteTestState.latest?.status&&voteTestState.latest?.status==="replied"){$("#voteTestStatus").textContent="Bot 已成功回覆投票圖卡，現在可到 LINE 點圖卡測試。";toast("測試圖卡已回覆")}
  }catch(error){$("#voteTestStatus").textContent=`載入失敗：${error.message}`}
}
async function copyVoteTestText(){
  if(!voteTestCallText)return toast("請重新產生測試呼喚");
  try{await navigator.clipboard.writeText(voteTestCallText);$("#voteTestStatus").textContent="完整文案已複製，請原樣貼到會員委員會測試群。";toast("測試呼喚已複製")}
  catch{$("#voteTestPreview").focus();$("#voteTestStatus").textContent="瀏覽器未允許自動複製，請長按或全選下方完整文案後複製。";toast("請手動複製文案")}
}
async function prepareVoteTest(){
  const subjectId=$("#voteTestSubject").value;
  if(!subjectId)return;
  const button=$("#prepareVoteTest");button.disabled=true;button.textContent="正在建立…";$("#voteTestStatus").textContent="正在建立獨立測試投票…";
  try{
    const data=await voteTestApi("POST",{action:"prepare",subjectId});
    voteTestState=data;voteTestCallText=data.callText||"";
    $("#voteTestPreview").textContent=voteTestCallText;$("#voteTestPreview").hidden=!voteTestCallText;$("#copyVoteTest").disabled=!voteTestCallText;
    renderVoteTest();await copyVoteTestText();
  }catch(error){$("#voteTestStatus").textContent=error.message;toast("測試呼喚建立失敗")}
  button.textContent="產生並複製測試呼喚";renderVoteTest();
}
async function deleteVoteTest(){
  const latest=voteTestState.latest;if(!latest)return;
  if(!confirm(`清除「${latest.applicant}」這筆獨立測試投票與所有測試票數？\n\n正式案件與正式票數不受影響。`))return;
  try{
    voteTestState=await voteTestApi("POST",{action:"delete",callId:latest.id});voteTestCallText="";
    $("#voteTestPreview").textContent="";$("#voteTestPreview").hidden=true;renderVoteTest();$("#voteTestStatus").textContent="測試投票已清除。";toast("測試資料已清除");
  }catch(error){$("#voteTestStatus").textContent=error.message;toast("測試清除失敗")}
}
function initVoteTest(){
  if(!canManageLineGroups)return;
  $("#voteTestCard").hidden=false;
  $("#voteTestSubject").onchange=renderVoteTest;
  $("#prepareVoteTest").onclick=prepareVoteTest;
  $("#copyVoteTest").onclick=copyVoteTestText;
  $("#deleteVoteTest").onclick=deleteVoteTest;
  loadVoteTest();
}
if(!FulianAuth.can("view")){location.href="login.html"}else{render();initTestDataReset();initNewMemberRegistration();initDeparture();initLineGroups();initVoteTest()}
})();
