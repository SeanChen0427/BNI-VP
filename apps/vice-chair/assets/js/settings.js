(async function(){
await window.FulianMemberDirectory.ready;
const session=FulianAuth.getSession();let config=FulianAuth.getConfig();const AUDIT_KEY="fulian-auth-audit-v1",memberDirectory=window.FulianMemberDirectory?.members||[];let audit=JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");const $=s=>document.querySelector(s);
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1800)}
function log(text){audit.unshift({text,time:new Date().toLocaleString("zh-TW")});audit=audit.slice(0,20);localStorage.setItem(AUDIT_KEY,JSON.stringify(audit));}
function memberOptions(excluded=[]){const blocked=new Set(excluded);return memberDirectory.filter(name=>!blocked.has(name)).map(name=>`<option value="${name}"></option>`).join("")}
function renderMemberPickers(){$("#vpMemberOptions").innerHTML=memberOptions(config.committee);$("#committeeMemberOptions").innerHTML=memberOptions([config.vpName,...config.committee]);}
function render(){
  const admin=session.role==="admin",manager=FulianAuth.can("manageCommittee");
  $("#committeeTotal").textContent=config.committee.length;$("#vpName").value=config.vpName;$("#vpName").disabled=!admin;$("#saveVp").disabled=!admin;
  $("#newMember").disabled=!manager;$("#addMember").disabled=!manager;
  $("#committeeList").innerHTML=config.committee.map(name=>`<article class="committee-member"><i>${name.slice(-1)}</i><div><b>${name}</b><small>會員委員・可使用共用委員帳號</small></div><button data-remove="${name}" ${manager?"":"disabled"}>移除</button></article>`).join("");
  $("#credentialFields").innerHTML=admin?[['admin','系統開發人員 Admin'],['vp','副主席共用帳號'],['committee','委員共用帳號']].map(([key,label])=>`<div class="credential-box"><b>${label}</b><label>帳號<input id="${key}Username" value="${config.accounts[key].username}" readonly></label><label>設定新密碼<input id="${key}Password" type="password" autocomplete="new-password" minlength="12" placeholder="至少 12 個字元"></label></div>`).join(""):`<div class="credentials-locked">只有系統開發人員 Admin 可以更新三組登入密碼。</div>`;
  $("#saveCredentials").hidden=!admin;
  $("#auditLog").innerHTML=(audit.length?audit:[{text:"尚無設定異動",time:""}]).map(item=>`<li><b>${item.text}</b><span>${item.time}</span></li>`).join("");
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
const TEST_RESET_CONFIRMATION="清除測試資料",canResetTestData=["admin","vp"].includes(session.role);
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
    $("#testResetResult").textContent=`清除完成：${serverResult.tasks} 筆伺服器案件、${browserResult.workflows} 筆本機流程、${browserResult.drafts} 份本機草稿、${serverResult.files} 份 Private Storage 附件、${serverResult.meetings} 筆月會紀錄。`;
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
const canManageDeparture=["admin","vp"].includes(session.role);
let departureState={currentMembers:[],departed:[]};
function departureIdentity(){return`${session.role}:${session.name}`}
function renderDepartureState(){
  $("#departureMemberOptions").innerHTML=departureState.currentMembers.map(m=>`<option value="${m.name}">${m.profession||""}</option>`).join("");
  $("#departedList").innerHTML=departureState.departed.length
    ?departureState.departed.map(d=>`<article><b>${d.name}</b><span>離會確認日 ${d.confirmedAt}</span><span>${d.note||"—"}</span><button data-undo-departure="${d.name}">撤銷</button></article>`).join("")
    :`<article><span>目前離會名單沒有紀錄。</span></article>`;
  document.querySelectorAll("[data-undo-departure]").forEach(button=>button.onclick=()=>undoDepartureFlow(button.dataset.undoDeparture));
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
function initDeparture(){
  if(!canManageDeparture)return;
  $("#departureCard").hidden=false;
  $("#departureDate").value=new Date().toISOString().slice(0,10);
  ["departureName","departureConfirmName","departureDate"].forEach(id=>{$("#"+id).addEventListener("input",refreshDepartureForm)});
  $("#registerDeparture").onclick=registerDepartureFlow;
  loadDepartureState();
}
if(!FulianAuth.can("view")){location.href="login.html"}else{render();initTestDataReset();initDeparture()}
})();
