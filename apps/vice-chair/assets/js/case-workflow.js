const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const CASE_ID = new URLSearchParams(location.search).get("case");
if(!CASE_ID){location.replace("case-board.html");throw new Error("缺少案件編號，已返回案件中心");}
const caseDomain=window.FulianCaseDomain;
const calendarDomain=window.FulianCalendarDomain;
const STORAGE_KEY = caseDomain.workflowStorageKey(CASE_ID);
let sourceTask=null;
const authConfig=FulianAuth.getConfig(),authSession=FulianAuth.getSession();
const committee=[authConfig.vpName,...authConfig.committee];
const roles=Object.fromEntries(committee.map(name=>[name,name===authConfig.vpName?"副主席":"會員委員"]));
const steps = ["保存 Word", "通知回饋", "委員回饋", "回饋達標", "開啟投票", "通知投票", "形成決議", "三長群", "董顧確認", "結案存檔"];
const typeConfig = {
  renewal:{label:"續約", approve:"同意續約", reject:"不同意續約", prefix:"RE"},
  new:{label:"新申請", approve:"同意入會", reject:"不同意入會", prefix:"NM"},
  midterm:{label:"期中輔導", approve:"通過輔導建議", reject:"退回補充輔導", prefix:"MC"},
  industry:{label:"轉專業別", approve:"同意轉換", reject:"不同意轉換", prefix:"IC"},
  departure:{label:"離會訪談", approve:"確認離會程序", reject:"退回補充資料", prefix:"DP"}
};

const initialState = {
  wordSaved:false,
  wordName:"",
  wordReal:false,
  feedbackNotified:false,
  feedback:{},
  votingOpen:false,
  voteNoticeSent:false,
  voterSnapshot:[],
  votes:{},
  leadersSent:false,
  advisorStatus:"pending",
  advisorNote:"",
  closed:false,
  log:[]
};

let state = loadState();
let saveTimer;
let lastPersist=Promise.resolve();
let feedbackDirty=false;

function loadState(){
  try{return {...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")};}
  catch{return structuredClone(initialState);}
}

function cloneInitial(){return JSON.parse(JSON.stringify(initialState));}
function isVp(){return authSession.role==="vp";}
function currentUser(){return String(authSession.name||"").trim();}
function recusedApplicant(){return caseDomain.recusedApplicant(committee,$("#applicant").value);}
function eligibleMembers(){return caseDomain.eligibleMembers(committee,$("#applicant").value);}
function threshold(){return caseDomain.majorityThreshold(eligibleMembers().length);}
function feedbackCount(){return eligibleMembers().filter(name=>(state.feedback[name]||"").trim()).length;}
function voteEntries(){return Object.entries(state.votes).filter(([name])=>state.voterSnapshot.includes(name));}
function nowLabel(){return new Date().toLocaleString("zh-TW",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});}
function dateLabel(value){if(!value)return"未設定";const d=new Date(value);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function config(){return typeConfig[$("#caseType").value];}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
function toast(message){const show=text=>{const node=$("#toast");node.textContent=text;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2200)};if(/已(儲存|保存|開啟|記錄|結案)|狀態已|已模擬/.test(message)){lastPersist.then(()=>show(message)).catch(error=>show(error.message||"Supabase 保存失敗"));return}show(message);}
function addLog(text){state.log.unshift({text,time:nowLabel(),done:true});state.log=state.log.slice(0,20);}

function feedbackReady(){return feedbackCount()>=threshold();}
function voteDeadlineStatus(){return caseDomain.voteDeadlineStatus($("#voteDeadline").value);}
function voteDecision(){
  const entries=voteEntries();
  const quorum=Math.floor((state.voterSnapshot.length||eligibleMembers().length)/2)+1;
  const approve=entries.filter(([,vote])=>vote==="approve").length;
  const reject=entries.filter(([,vote])=>vote==="reject").length;
  if(entries.length<quorum)return{status:"waiting",title:"尚未達參與門檻",detail:`還需要 ${quorum-entries.length} 票`,approve,reject,total:entries.length,quorum};
  if(approve===reject)return{status:"tie",title:"目前票數同票",detail:"需等待下一位有資格委員投票",approve,reject,total:entries.length,quorum};
  return{status:approve>reject?"pass":"reject",title:approve>reject?"會員委員會表決通過":"會員委員會表決不通過",detail:`同意 ${approve} 票／不同意 ${reject} 票`,approve,reject,total:entries.length,quorum};
}

function currentStage(){
  const decision=voteDecision();
  if(state.closed)return 9;
  if(state.advisorStatus==="confirmed")return 9;
  if(state.leadersSent)return 8;
  if(decision.status==="pass"||decision.status==="reject")return 7;
  if(state.voteNoticeSent)return 6;
  if(state.votingOpen)return 5;
  if(feedbackReady())return 4;
  if(state.feedbackNotified||feedbackCount()>0)return 2;
  return state.wordSaved?1:0;
}

function populateSelects(){
  const options=committee.map(name=>`<option value="${name}">${name}（${roles[name]}）</option>`).join("");
  $("#leadInterviewer").innerHTML=options;
  $("#companionInterviewer").innerHTML=options;
  $("#leadInterviewer").value=sourceTask?.lead||authConfig.committee[0]||authConfig.vpName;
  $("#companionInterviewer").value=sourceTask?.companions?.[0]||authConfig.vpName;
}

function configureIdentity(){const role=authSession.role==="vp"?"vp":authSession.role==="committee"?"committee":"admin";$("#loginUser").innerHTML=`<option value="${authSession.name}" data-role="${role}">${authSession.name}（${role==="vp"?"副主席":role==="committee"?"會員委員":"系統開發人員 Admin"}）</option>`;$("#loginUser").disabled=true;}

function feedbackNotice(){
  const blankMembers=eligibleMembers().map(name=>`■ ${name} - ${state.feedback[name]||""}`).join("\n");
  return `@All 【 ${config().label}商訪表述&回饋 】\n請主、陪訪回饋與表述,並請委員們參照相簿中「訪談表」及「相關資料」回饋表述。各位為分會重要的守門員,請儘量給予回饋建議!\n------------------\n${$("#interviewDate").value.replaceAll("-","/")}\n地點: ZOOM\n申請者: ${$("#applicant").value}\n專業別: ${$("#profession").value}\n主訪：${$("#leadInterviewer").value} 陪訪：${$("#companionInterviewer").value}\n------------------\n${blankMembers}`;
}

function voteNotice(){
  return `@All 【 ${config().label}投票 】\n申請者: ${$("#applicant").value}\n專業別: ${$("#profession").value}\n\n請各位委員針對表述回饋及相關文件,開始進行投票!\n截止至${dateLabel($("#voteDeadline").value)}前\n會員委員及副主席擁有各一票投票權,董事顧問有最終裁量權。\n攸關團隊品質,請委員們參閱回饋務必投下這一票!\n***完成投票請tag回覆「已投」`;
}

function leadersMessage(){
  const decision=voteDecision();
  const result=decision.status==="pass"?"通過":"不通過";
  const d=new Date();
  const date=`${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`;
  let extra="";
  if($("#caseType").value==="renewal")extra=`\n\n過去一年培訓：${$("#annualTraining").value||"尚待填寫"}\n過去一年來賓：${$("#annualVisitors").value||"尚待填寫"}`;
  return `【${date}${config().label}會員投票結果】\n\n申請者: ${$("#applicant").value}\n專業別: ${$("#profession").value}\n\n商業訪談專業投票結果：${result}\n\n感謝委員們的付出，此結果須待董事顧問最終確認，才會正式公佈，請委員們維護團隊共識，不得外傳，感謝。\n@BNI / CC 董事顧問${extra}`;
}

function renderWorkflow(){
  const stage=currentStage();
  $("#workflowStrip").innerHTML=steps.map((name,index)=>`<div class="workflow-step ${state.closed||index<stage?"done":index===stage?"current":""}"><b>${index+1}</b><small>${name}</small></div>`).join("");
  const displayStage=Math.min(stage+1,10);
  $("#stageNumber").textContent=displayStage;
  $("#stageTitle").textContent=state.closed?"案件已結案":steps[Math.min(stage,9)];
  const progress=state.closed?100:Math.min(stage*10,100);
  $("#progressBar").style.width=`${progress}%`;
  $("#progressText").textContent=`${progress}%`;
}

function renderPermissions(){
  const allowed=isVp();
  $$(".vp-control").forEach(node=>{
    node.classList.toggle("permission-disabled",!allowed);
    if("disabled" in node && !allowed)node.disabled=true;
  });
  $$(".vp-only-section").forEach(node=>{
    node.hidden=!allowed;
  });
  $(".workspace-grid").classList.toggle("committee-view",!allowed);
  $("#permissionText").textContent=allowed?"目前可操作開票、通知、送三長群與結案。":"委員可填寫回饋及投票；開票、發送與結案由副主席操作。";
  $(".permission-note").classList.toggle("committee",!allowed);
}

function renderFeedback(){
  const eligible=eligibleMembers();
  const count=feedbackCount();
  const required=threshold();
  $("#feedbackCount").textContent=count;
  $("#eligibleCount").textContent=eligible.length;
  $("#feedbackThreshold").textContent=`${required} 人`;
  $("#feedbackResult").textContent=count>=required?"已達回饋門檻":"尚未達門檻";
  $("#feedbackResult").classList.toggle("ready",count>=required);
  $("#feedbackEditorName").textContent=`${currentUser()}的回饋`;
  $("#myFeedback").value=state.feedback[currentUser()]||"";
  $("#feedbackList").innerHTML=committee.map(name=>{
    const recused=!eligible.includes(name),content=state.feedback[name]||"";
    return `<article class="feedback-item ${content?"":"empty"}"><span class="avatar">${name.slice(-1)}</span><div><b>${name}・${roles[name]}${recused?"（迴避）":""}</b><p>${recused?"本案不參與回饋與投票":content||"尚未填寫回饋"}</p></div><em>${recused?"已迴避":content?"已回饋":"待回饋"}</em></article>`;
  }).join("");
  $("#openVoteTitle").textContent=count>=required?`已達 ${required} 人門檻，可開啟投票`:`尚差 ${required-count} 份回饋`;
  $("#openVote").disabled=!(isVp()&&count>=required&&!state.votingOpen&&!state.closed);
}

function renderVote(){
  const decision=voteDecision();
  const deadline=voteDeadlineStatus();
  $("#voteLocked").hidden=state.votingOpen;
  $("#voteWorkspace").hidden=!state.votingOpen;
  $("#approveLabel").textContent=config().approve;
  $("#rejectLabel").textContent=config().reject;
  $("#voteForName").textContent=`${currentUser()}的投票`;
  $("#voteSnapshot").textContent=`投票資格快照 ${state.voterSnapshot.length||eligibleMembers().length} 人`;
  $("#deadlineLabel").textContent=`截止 ${dateLabel($("#voteDeadline").value)}${deadline.expired?"・已截止":""}`;
  $("#deadlineLabel").classList.toggle("expired",deadline.expired);
  $("#voteCount").textContent=decision.total;
  $("#quorum").textContent=decision.quorum;
  $("#approveCount").textContent=decision.approve;
  $("#rejectCount").textContent=decision.reject;
  const box=$("#decisionBox");
  box.className=`decision-box ${decision.status==="pass"?"pass":decision.status==="reject"?"reject":""}`;
  box.innerHTML=`<small>目前判定</small><strong>${decision.title}</strong><span>${decision.detail}</span>`;
  $("#voterStatus").innerHTML=committee.map(name=>{
    const recused=state.votingOpen&&!state.voterSnapshot.includes(name),voted=Boolean(state.votes[name]);
    return `<span class="voter-chip ${recused?"recused":voted?"voted":""}">${name}・${recused?"迴避":voted?"已投":"未投"}</span>`;
  }).join("");
  const eligible=state.voterSnapshot.includes(currentUser());
  const canVote=state.votingOpen&&state.voteNoticeSent&&eligible&&!state.closed&&deadline.valid&&!deadline.expired;
  $("#submitVote").disabled=!canVote;
  $$("input[name=vote]").forEach(input=>input.disabled=!canVote);
  const hint=$("#voteActionHint");
  if(state.closed)hint.textContent="案件已結案，無法再投票。";
  else if(!eligible)hint.textContent="你不在本案投票資格快照中。";
  else if(!deadline.valid)hint.textContent="請副主席先設定有效的投票截止時間。";
  else if(deadline.expired)hint.textContent="投票期限已截止；請副主席先在案件基本資料更新截止時間，再重新通知委員。";
  else if(!state.voteNoticeSent)hint.textContent="請副主席先按上方「模擬 LINE Bot 通知投票」，通知完成後才會開放送出票。";
  else hint.textContent="請選擇一個投票選項，再按「確認送出票」。";
  hint.classList.toggle("warning",!canVote);
  const own=state.votes[currentUser()]||"";
  $$("input[name=vote]").forEach(input=>input.checked=input.value===own);
  $("#sendVoteNotice").disabled=!(isVp()&&state.votingOpen&&!state.voteNoticeSent&&!state.closed&&deadline.valid&&!deadline.expired);
  $("#sendVoteNotice").textContent=state.voteNoticeSent?"已通知委員":"模擬 LINE Bot 通知投票";
}

function renderResult(){
  const decision=voteDecision();
  const formed=decision.status==="pass"||decision.status==="reject";
  $("#renewalExtra").hidden=$("#caseType").value!=="renewal";
  $("#leadersPreview").textContent=formed?leadersMessage():"尚未形成會員委員會決議，三長群文案會在過半參與且形成多數後產生。";
  $("#copyLeaders").disabled=!formed;
  $("#sendLeaders").disabled=!(isVp()&&formed&&!state.leadersSent&&!state.closed);
  $("#sendLeaders").textContent=state.leadersSent?"已發送三長群":"模擬發送三長群";
  $("#advisorStatus").value=state.advisorStatus;
  $("#advisorNote").value=state.advisorNote;
  $("#advisorStatus").disabled=!(isVp()&&state.leadersSent&&!state.closed);
  $("#advisorNote").disabled=!(isVp()&&state.leadersSent&&!state.closed);
  $("#saveAdvisor").disabled=!(isVp()&&state.leadersSent&&!state.closed);
  $("#closeCase").disabled=!(isVp()&&state.advisorStatus==="confirmed"&&!state.closed);
  if(state.closed)$("#closeSection").innerHTML=`<div class="closed-banner">案件已結案存檔・${$("#caseId").textContent}</div>`;
}

function renderSummary(){
  const type=config();
  $("#caseId").textContent=CASE_ID==="standalone"?`${type.prefix}-未編號`:CASE_ID;
  $("#summaryApplicant").textContent=$("#applicant").value||"未填寫";
  $("#summaryBase").textContent=`${eligibleMembers().length} 人`;
  $("#summaryQuorum").textContent=`${threshold()} 人`;
  $("#recusedMember").value=recusedApplicant()||"無須迴避";
  $("#wordName").textContent=state.wordName||"尚未保存 Word";
  $("#wordStatus").textContent=state.wordReal?"檔案已保存於此瀏覽器，可下載確認":"尚未保存訪談 Word";
  $("#downloadWord").disabled=!state.wordReal;
  ["caseType","applicant","profession"].forEach(id=>$("#"+id).disabled=state.votingOpen);
  $("#feedbackNoticePreview").textContent=feedbackNotice();
  $("#sendFeedbackNotice").disabled=!(isVp()&&state.wordSaved&&!state.feedbackNotified&&!state.closed);
  $("#sendFeedbackNotice").textContent=state.feedbackNotified?"已通知委員":"模擬 LINE Bot 通知";
  $("#activityLog").innerHTML=state.log.map(item=>`<li class="${item.done?"done":""}"><b>${escapeHtml(item.text)}</b><span>${escapeHtml(item.time)}</span></li>`).join("");
}

function render(){
  renderPermissions();
  renderFeedback();
  renderVote();
  renderResult();
  renderWorkflow();
  renderSummary();
}

function collectForm(){
  return {
    caseType:$("#caseType").value,applicant:$("#applicant").value,profession:$("#profession").value,
    interviewDate:$("#interviewDate").value,leadInterviewer:$("#leadInterviewer").value,companionInterviewer:$("#companionInterviewer").value,
    voteDeadline:$("#voteDeadline").value,recusedMember:recusedApplicant(),annualTraining:$("#annualTraining").value,annualVisitors:$("#annualVisitors").value
  };
}

function annualPeriodLabel(source=""){
  const match=String(source).match(/palms_(\d{4}-\d{2})_(\d{4}-\d{2})_annual/i);
  return match?`${match[1]} 至 ${match[2]}`:"最近一年";
}

function autofillAnnualRenewalMetrics(snapshot,matched){
  const note=$("#annualDataSource");
  if($("#caseType").value!=="renewal"){note.hidden=true;return false;}
  const metrics=caseDomain.annualRenewalMetrics(matched);
  if(!metrics){note.hidden=false;note.textContent="找不到該會員的年度 PALMS 數據，請人工確認。";return false;}
  let changed=false;
  if(!$("#annualTraining").value.trim()){$("#annualTraining").value=`${metrics.education} 分`;changed=true;}
  if(!$("#annualVisitors").value.trim()){$("#annualVisitors").value=`${metrics.visitors} 位`;changed=true;}
  note.hidden=false;
  note.textContent=`年度 PALMS（${annualPeriodLabel(snapshot.memberData?.annualMetricsSource)}）：培訓 ${metrics.education} 分、來賓 ${metrics.visitors} 位；系統已自動帶入，仍可人工修正。`;
  return changed;
}

function restoreForm(){
  $("#interviewDate").value=calendarDomain.dateInput();
  $("#voteDeadline").value=calendarDomain.defaultVoteDeadline();
  if(sourceTask){
    $("#caseType").value=Object.prototype.hasOwnProperty.call(typeConfig,sourceTask.type)?sourceTask.type:"renewal";
    $("#applicant").value=sourceTask.member||"";
    $("#profession").value=sourceTask.profession||"";
    if(sourceTask.scheduledAt)$("#interviewDate").value=sourceTask.scheduledAt.slice(0,10);
    $("#leadInterviewer").value=sourceTask.lead||$("#leadInterviewer").value;
    $("#companionInterviewer").value=sourceTask.companions?.[0]||$("#companionInterviewer").value;
  }
  const form=state.form||{};
  Object.entries(form).forEach(([id,value])=>{if(id==="recusedMember"||id==="loginUser"||(sourceTask&&id==="caseType"))return;const node=$(`#${id}`);if(node&&value!==undefined)node.value=value;});
  $("#recusedMember").value=recusedApplicant()||"無須迴避";
  if(state.votingOpen&&!Object.keys(state.votes||{}).length){
    const corrected=eligibleMembers();
    if(JSON.stringify(state.voterSnapshot)!==JSON.stringify(corrected))state.voterSnapshot=corrected;
  }
}

function persistNow(){state.form=collectForm();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$("#saveState").textContent="正在同步 Supabase…";render();lastPersist=window.FulianCaseStateStore.flush().then(()=>{$("#saveState").textContent="案件資料已保存至 Supabase";$("#saveTime").textContent=`最後同步 ${new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`}).catch(error=>{$("#saveState").textContent="Supabase 保存失敗";throw error});return lastPersist;}
function scheduleSave(){$("#saveState").textContent="儲存中…";clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,180);render();}

async function storeWord(file){await window.FulianCaseFiles.saveGeneratedWord({caseId:CASE_ID,caseType:sourceTask?.type||"",blob:file,fileName:file.name,sourceLabel:"案件流程頁",domain:caseDomain,storage:localStorage,indexedDb:indexedDB,FileClass:File});state=loadState();}
async function getWord(){return window.FulianCaseFiles.getCaseFile({caseId:CASE_ID,indexedDb:indexedDB});}

function bindEvents(){
  $$('[data-save]').forEach(node=>{node.addEventListener("change",scheduleSave);node.addEventListener("input",scheduleSave);});
  $("#myFeedback").addEventListener("input",()=>{feedbackDirty=true;});
  $("#voteDeadline").addEventListener("change",()=>{
    if(!state.voteNoticeSent)return;
    state.voteNoticeSent=false;
    addLog("投票截止時間已更新，需重新通知委員");
    persistNow();
    toast("截止時間已更新，請重新通知委員投票");
  });
  $("#wordFile").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{await storeWord(file);render();toast("Word 已保存至 Supabase Private Storage")}catch(error){toast(error.message||"Word 保存失敗")}});
  $("#downloadWord").addEventListener("click",async()=>{const file=await getWord();if(!file)return toast("目前只有示範檔名，請先上傳真實 Word");const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $("#copyFeedbackNotice").addEventListener("click",async()=>{await navigator.clipboard.writeText(feedbackNotice());toast("回饋通知已複製");});
  $("#sendFeedbackNotice").addEventListener("click",()=>{if(!isVp())return;state.feedbackNotified=true;addLog("已模擬發送委員回饋通知至會員委員會群");persistNow();toast("已模擬通知委員");});
  $("#saveFeedback").addEventListener("click",async()=>{const text=$("#myFeedback").value.trim(),user=currentUser();if(!text)return toast("請先填寫回饋內容");if(!user)return toast("登入身份載入失敗，請重新登入後再試");if(!eligibleMembers().includes(user))return toast(`${user}是本案申請者，依規則須迴避回饋與投票`);$("#saveState").textContent="正在保存你的回饋…";lastPersist=window.FulianCaseStateStore.saveFeedback(CASE_ID,text);try{await lastPersist;feedbackDirty=false;state=loadState();render();$("#saveState").textContent="你的回饋已保存至 Supabase";toast("回饋已儲存")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"回饋保存失敗")}});
  $("#openVote").addEventListener("click",async()=>{if(!isVp()||!feedbackReady())return;const deadline=voteDeadlineStatus();if(!deadline.valid)return toast("請先設定有效的投票截止時間");if(deadline.expired)return toast("投票期限已截止，請先更新截止時間");const proposed={...state,form:collectForm(),votingOpen:true};$("#saveState").textContent="正在建立投票資格快照…";lastPersist=window.FulianCaseStateStore.openVote(CASE_ID,proposed);try{await lastPersist;state=loadState();render();$("#saveState").textContent="投票已開啟並保存資格快照";toast("系統投票已開啟")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"投票開啟失敗")}});
  $("#sendVoteNotice").addEventListener("click",async()=>{if(!isVp())return;const deadline=voteDeadlineStatus();if(!deadline.valid)return toast("請先設定有效的投票截止時間");if(deadline.expired)return toast("投票期限已截止，請先更新截止時間");await navigator.clipboard.writeText(voteNotice());state.voteNoticeSent=true;addLog("已模擬 LINE Bot 通知委員投票");persistNow();toast("投票通知已模擬發送並複製");});
  $("#submitVote").addEventListener("click",async()=>{const deadline=voteDeadlineStatus();if(!state.voteNoticeSent)return toast("請先通知委員投票");if(!deadline.valid)return toast("請先設定有效的投票截止時間");if(deadline.expired)return toast("投票期限已截止");const selected=$("input[name=vote]:checked");if(!selected)return toast("請選擇投票選項");if(!state.voterSnapshot.includes(currentUser()))return toast("你不在本案投票資格快照中");$("#saveState").textContent="正在送出你的投票…";lastPersist=window.FulianCaseStateStore.saveVote(CASE_ID,selected.value);try{await lastPersist;state=loadState();render();$("#saveState").textContent="你的投票已安全記錄";toast("投票已記錄")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"投票失敗")}});
  $("#copyLeaders").addEventListener("click",async()=>{if(!isVp())return;await navigator.clipboard.writeText(leadersMessage());toast("三長群文案已複製");});
  $("#sendLeaders").addEventListener("click",()=>{if(!isVp())return;state.leadersSent=true;addLog("投票結果已模擬發送至三長群");persistNow();toast("已模擬發送三長群");});
  $("#saveAdvisor").addEventListener("click",()=>{if(!isVp())return;state.advisorStatus=$("#advisorStatus").value;state.advisorNote=$("#advisorNote").value.trim();addLog(state.advisorStatus==="confirmed"?"董事顧問已同意會員委員會決議":state.advisorStatus==="returned"?"董事顧問退回補充資料":"董事顧問確認仍待回覆");persistNow();toast("董顧確認狀態已保存");});
  $("#closeCase").addEventListener("click",async()=>{if(!isVp()||state.advisorStatus!=="confirmed")return;state.closed=true;addLog("案件已由副主席確認結案存檔");if(sourceTask){const tasks=JSON.parse(localStorage.getItem(caseDomain.TASK_STORAGE_KEY)||"[]");const target=tasks.find(item=>item.id===CASE_ID);if(target){target.completed=true;target.completedAt=new Date().toISOString();target.stage="已結案";localStorage.setItem(caseDomain.TASK_STORAGE_KEY,JSON.stringify(tasks));}}try{await persistNow();await window.FulianTaskStore.flush();toast("案件已結案存檔")}catch(error){toast(error.message||"案件結案同步失敗")}});
  $("#resetCase").addEventListener("click",async()=>{if(!isVp())return toast("只有副主席可以重設案件");if(!confirm("要重設這個案件嗎？目前的回饋、投票與流程紀錄會清除。"))return;$("#saveState").textContent="正在重設案件…";try{await window.FulianCaseStateStore.reset(CASE_ID);location.reload()}catch(error){$("#saveState").textContent="重設失敗";toast(error.message||"案件重設失敗")}});
  window.addEventListener("fulian:data-changed",event=>{
    if(event.detail?.source!=="supabase-case-state"||event.detail?.taskId!==CASE_ID)return;
    const pendingFeedback=feedbackDirty?$("#myFeedback").value:"";
    state=loadState();
    render();
    if(feedbackDirty)$("#myFeedback").value=pendingFeedback;
  });
}

async function init(){
  await window.FulianTaskStore.ready;
  await window.FulianCaseStateStore.ready;
  state=loadState();
  try{sourceTask=(JSON.parse(localStorage.getItem(caseDomain.TASK_STORAGE_KEY)||"[]")||[]).find(item=>item.id===CASE_ID)||null}catch{}
  configureIdentity();
  populateSelects();
  restoreForm();
  if($("#applicant").value){
    try{
      const response=await fetch("/api/bni-analysis",{cache:"no-store"}),snapshot=await response.json(),matched=(snapshot.members||[]).find(item=>item.name===$("#applicant").value);
      if(matched?.profession&&!$("#profession").value)$("#profession").value=matched.profession;
      if(autofillAnnualRenewalMetrics(snapshot,matched)){
        state.form=collectForm();
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
        $("#saveState").textContent="年度 PALMS 已自動帶入";
        $("#saveTime").textContent=`最後儲存 ${new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
      }
    }catch{$("#annualDataSource").hidden=false;$("#annualDataSource").textContent="年度 PALMS 載入失敗，請重新整理或人工確認。";}
  }
  try{$("#downloadWord").disabled=!(await getWord());}catch{$("#downloadWord").disabled=true;}
  bindEvents();
  render();
}

init();
