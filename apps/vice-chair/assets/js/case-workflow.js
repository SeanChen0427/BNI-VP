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
const steps = ["保存 Word", "通知回饋", "委員回饋", "回饋達標", "開啟投票", "通知投票", "形成決議", "三長群", "董顧確認", "公告群", "結案存檔"];
const typeConfig = {
  renewal:{label:"續約", voteLabel:"續約", approve:"同意續約", reject:"不同意續約", prefix:"RE"},
  new:{label:"新申請", voteLabel:"新申請", approve:"同意入會", reject:"不同意入會", prefix:"NM"},
  midterm:{label:"期中輔導", approve:"通過輔導建議", reject:"退回補充輔導", prefix:"MC"},
  industry:{label:"轉專業別", voteLabel:"轉換行業別", approve:"同意轉換", reject:"不同意轉換", prefix:"IC"},
  departure:{label:"離會訪談", approve:"確認離會程序", reject:"退回補充資料", prefix:"DP"}
};

const initialState = {
  wordSaved:false,
  wordName:"",
  wordReal:false,
  feedbackNotified:false,
  feedbackNoticeSentAt:"",
  feedbackNoticeTargetName:"",
  feedbackNoticeDeliveryId:"",
  feedbackCallId:"",
  feedbackCallStatus:"",
  feedbackCallCreatedAt:"",
  feedbackCallRepliedAt:"",
  feedbackCallFailedAt:"",
  feedbackCallError:"",
  feedbackCallTargetName:"",
  feedbackCallEnvironment:"production",
  feedback:{},
  feedbackMeta:{},
  votingOpen:false,
  voteNoticeSent:false,
  voteNoticeSentAt:"",
  voteNoticeTargetName:"",
  voteNoticeDeliveryId:"",
  voteNoticeCopiedAt:"",
  voteNoticeCopiedBy:"",
  voteNoticeCopiedDeadline:"",
  voteCallId:"",
  voteCallStatus:"",
  voteCallCreatedAt:"",
  voteCallRepliedAt:"",
  voteCallFailedAt:"",
  voteCallError:"",
  voteCallDeadline:"",
  voteCallTargetName:"",
  voteCallEnvironment:"production",
  voterSnapshot:[],
  voterRoster:[],
  votes:{},
  votedVoters:[],
  voteTally:null,
  leadersSent:false,
  advisorStatus:"pending",
  advisorNote:"",
  resultAnnouncementSent:false,
  resultAnnouncementSentAt:"",
  resultAnnouncementTargetName:"",
  resultAnnouncementDeliveryId:"",
  closed:false,
  log:[]
};

let state = loadState();
let saveTimer;
let lastPersist=Promise.resolve();
let feedbackDirty=false;
let feedbackEditorTarget=currentUser();
let announcementMembers=[];
let activeFeedbackCallText="";
let selectedFeedbackEnvironment=["test","production"].includes(state.feedbackCallEnvironment)?state.feedbackCallEnvironment:"production";
let feedbackEnvironmentTouched=false;
let activeVoteCallText="";
let selectedVoteEnvironment=["test","production"].includes(state.voteCallEnvironment)?state.voteCallEnvironment:"production";
let voteEnvironmentTouched=false;

function loadState(){
  try{return {...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")};}
  catch{return structuredClone(initialState);}
}

function cloneInitial(){return JSON.parse(JSON.stringify(initialState));}
function isVp(){return authSession.role==="vp";}
function canViewNamedVotes(){return ["vp","admin"].includes(authSession.role);}
function currentUser(){return String(authSession.name||"").trim();}
function recusedApplicant(){return caseDomain.recusedApplicant(committee,$("#applicant").value);}
function eligibleMembers(){return caseDomain.eligibleMembers(committee,$("#applicant").value);}
function threshold(){return caseDomain.majorityThreshold(eligibleMembers().length);}
function feedbackCount(){return eligibleMembers().filter(name=>(state.feedback[name]||"").trim()).length;}
function selectedFeedbackAuthor(){
  if(!isVp())return currentUser();
  return eligibleMembers().includes(feedbackEditorTarget)?feedbackEditorTarget:currentUser();
}
function nowLabel(){return new Date().toLocaleString("zh-TW",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});}
function dateLabel(value){if(!value)return"未設定";const d=new Date(value);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function voteDeadlineLineLabel(value,now=new Date()){
  const deadline=new Date(value);
  if(!Number.isFinite(deadline.getTime()))return"截止時間尚未設定";
  const dateKey=date=>`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
  const tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);
  const hour=deadline.getHours(),minute=deadline.getMinutes(),period=hour<12?"上午":hour===12?"中午":hour<18?"下午":"晚上",displayHour=hour===0?12:hour>12?hour-12:hour;
  const time=`${period}${displayHour}${minute?`:${String(minute).padStart(2,"0")}`:"點"}`;
  if(dateKey(deadline)===dateKey(tomorrow))return`明天${time}`;
  if(dateKey(deadline)===dateKey(now))return`今天${time}`;
  return`${deadline.getFullYear()}/${deadline.getMonth()+1}/${deadline.getDate()} ${time}`;
}
function config(){return typeConfig[$("#caseType").value];}
function caseDraft(){
  if(!sourceTask)return{};
  try{return JSON.parse(localStorage.getItem(caseDomain.draftStorageKey(sourceTask))||"{}");}
  catch{return{};}
}
function announcementDate(value=new Date()){
  const parts=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"numeric",day:"numeric"}).formatToParts(value);
  const get=type=>Number(parts.find(part=>part.type===type)?.value||0);
  return`${get("year")}.${get("month")}.${get("day")}`;
}
function resultAnnouncementText(){
  const type=$("#caseType").value,name=$("#applicant").value.trim(),profession=$("#profession").value.trim(),date=announcementDate();
  if(type==="new"){
    const referrer=$("#resultReferrerName").value.trim();
    return`【 ${date} 新會員入會投票結果 】\n\n申請者：${name}\n專業別：${profession}\n推薦人：${referrer||"尚未選擇"}\n\n商業訪談投票結果：通過\n----------------------\n以上經董事顧問確認後，特此公告，\n感謝邀請人、會員委員的付出協助！\n\n（只讀不回）`;
  }
  if(type==="renewal")return`【 ${date} 續約會員投票結果 】\n\n申請者：${name}\n專業別：${profession}\n\n商業訪談投票結果：通過\n----------------------\n以上經董事顧問確認後，特此公告，\n感謝會員委員的付出協助！\n\n（只讀不回）`;
  const draft=caseDraft(),oldProfession=String(draft.currentProfession||state.form?.currentProfession||"").trim();
  return`【 ${date} 轉換專業別投票結果 】\n\n申請者：${name}\n原專業別：${oldProfession||"尚未保存"}\n欲轉專業別：${profession}\n\n商訪專業別轉換投票結果：通過。\n\n「${oldProfession||"原專業別尚未保存"}」已開放專業別，歡迎夥伴邀約。\n----------------------\n\n以上經董事顧問確認後，特此公告。\n\n（只讀不回）`;
}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
function toast(message){const show=text=>{const node=$("#toast");node.textContent=text;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2200)};if(/已(儲存|保存|開啟|記錄|結案)|狀態已|已模擬/.test(message)){lastPersist.then(()=>show(message)).catch(error=>show(error.message||"Supabase 保存失敗"));return}show(message);}
function addLog(text){state.log.unshift({text,time:nowLabel(),done:true});state.log=state.log.slice(0,20);}

function feedbackReady(){return feedbackCount()>=threshold();}
function voteAccessReady(){return caseDomain.voteAccessReady(state);}
function voteDeadlineStatus(){return caseDomain.voteDeadlineStatus($("#voteDeadline").value);}
function voteDecision(){
  const summary=caseDomain.voteSummary(state,eligibleMembers().length);
  if(summary.status==="waiting")return{...summary,title:"尚未達參與門檻",detail:`還需要 ${summary.quorum-summary.total} 票`};
  if(summary.status==="tie")return{...summary,title:"目前票數同票",detail:"需等待下一位有資格委員投票"};
  return{...summary,title:summary.status==="pass"?"會員委員會表決通過":"會員委員會表決不通過",detail:`同意 ${summary.approve} 票／不同意 ${summary.reject} 票`};
}

function voteResultReport(){
  return window.FulianVoteResultImage.createReport({
    state,
    caseType:$("#caseType").value,
    applicant:$("#applicant").value,
    profession:$("#profession").value,
    deadlineAt:$("#voteDeadline").value,
    approveLabel:config().approve,
    rejectLabel:config().reject,
    baseFallback:eligibleMembers().length,
  });
}

function currentStage(){
  const decision=voteDecision();
  if(state.closed)return 10;
  if(state.resultAnnouncementSent)return 10;
  if(state.advisorStatus==="confirmed")return decision.status==="reject"?10:9;
  if(state.leadersSent)return 8;
  if(decision.status==="pass"||decision.status==="reject")return 7;
  if(voteAccessReady())return 6;
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

function populateResultReferrers(){
  const select=$("#resultReferrerName"),desired=String(state.form?.referrerName||caseDraft().referrerName||"").trim();
  select.replaceChildren(new Option("請選擇正式會員", ""));
  announcementMembers
    .filter(member=>member?.name&&member.name!==$("#applicant").value)
    .sort((left,right)=>left.name.localeCompare(right.name,"zh-Hant"))
    .forEach(member=>{
      const option=new Option(member.name,member.name);
      option.dataset.memberId=String(member.memberId||member.id||member.personId||member.name);
      select.add(option);
    });
  if([...select.options].some(option=>option.value===desired))select.value=desired;
}

function configureIdentity(){const role=authSession.role==="vp"?"vp":authSession.role==="committee"?"committee":"admin";$("#loginUser").innerHTML=`<option value="${authSession.name}" data-role="${role}">${authSession.name}（${role==="vp"?"副主席":role==="committee"?"會員委員":"系統開發人員 Admin"}）</option>`;$("#loginUser").disabled=true;}

function feedbackNotice(){
  return activeFeedbackCallText||"按下「啟動回饋流程並複製文案」後，系統會在這裡產生含一次性回饋網址的完整 LINE 呼喚。請勿自行修改文字，Bot 只會回覆完全相符的文案。";
}

function voteNotice(){
  return activeVoteCallText||"按下「啟動投票流程並複製文案」後，系統會在這裡產生含一次性投票網址的完整 LINE 呼喚。請勿自行修改文字，Bot 只會回覆完全相符的文案。";
}

function voteEnvironmentLabel(environment=selectedVoteEnvironment){return environment==="test"?"測試群":"正式群";}
function feedbackEnvironmentLabel(environment=selectedFeedbackEnvironment){return environment==="test"?"測試群":"正式群";}

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
  const displayStage=Math.min(stage+1,steps.length);
  $("#stageNumber").textContent=displayStage;
  $("#stageTitle").textContent=state.closed?"案件已結案":steps[Math.min(stage,steps.length-1)];
  const progress=state.closed?100:Math.min(Math.round(stage/(steps.length-1)*100),100);
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
  $("#permissionText").textContent=allowed?"目前可操作開票、通知、送三長群、正式公告與結案。":"委員可填寫回饋及投票；開票、發送與結案由副主席操作。";
  $(".permission-note").classList.toggle("committee",!allowed);
}

function renderFeedback(){
  const eligible=eligibleMembers();
  const count=feedbackCount();
  const required=threshold();
  if(!eligible.includes(feedbackEditorTarget))feedbackEditorTarget=currentUser();
  const target=selectedFeedbackAuthor();
  const proxy=isVp()&&target!==currentUser();
  const proxyControl=$("#feedbackProxyControl");
  proxyControl.hidden=!isVp();
  if(isVp()){
    const authorSelect=$("#feedbackAuthor");
    authorSelect.innerHTML=eligible.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}${name===currentUser()?"（本人）":"（會員委員）"}</option>`).join("");
    authorSelect.value=target;
  }
  $("#feedbackCount").textContent=count;
  $("#eligibleCount").textContent=eligible.length;
  $("#feedbackThreshold").textContent=`${required} 人`;
  $("#feedbackResult").textContent=count>=required?"已達回饋門檻":"尚未達門檻";
  $("#feedbackResult").classList.toggle("ready",count>=required);
  $("#feedbackEditorName").textContent=proxy?`代填 ${target} 的回饋`:`${target}的回饋`;
  $("#feedbackProxyHint").textContent=proxy
    ? `目前由 ${currentUser()} 代替 ${target} 填寫；系統會保留代填者紀錄，投票仍須由 ${target} 本人完成。`
    : "選擇本人，或選擇提供 LINE 回饋內容的會員委員。代填會保留副主席操作紀錄。";
  $("#saveFeedback").textContent=proxy?`代填並保存給 ${target}`:"儲存我的回饋";
  if(!feedbackDirty)$("#myFeedback").value=state.feedback[target]||"";
  $("#feedbackList").innerHTML=committee.map(name=>{
    const recused=!eligible.includes(name),content=state.feedback[name]||"";
    const meta=state.feedbackMeta?.[name]||{};
    const byline=content&&meta.delegated?`<small class="feedback-byline">由副主席 ${escapeHtml(meta.submittedBy||currentUser())} 代填</small>`:"";
    return `<article class="feedback-item ${content?"":"empty"}"><span class="avatar">${escapeHtml(name.slice(-1))}</span><div><b>${escapeHtml(name)}・${escapeHtml(roles[name])}${recused?"（迴避）":""}</b><p>${recused?"本案不參與回饋與投票":escapeHtml(content)||"尚未填寫回饋"}</p>${byline}</div><em>${recused?"已迴避":content?"已回饋":"待回饋"}</em></article>`;
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
  const votedNames=new Set(Array.isArray(state.votedVoters)?state.votedVoters:Object.keys(state.votes||{}));
  $("#voterStatus").innerHTML=committee.map(name=>{
    const recused=state.votingOpen&&!state.voterSnapshot.includes(name),voted=votedNames.has(name);
    return `<span class="voter-chip ${recused?"recused":voted?"voted":""}">${name}・${recused?"迴避":voted?"已投":"未投"}</span>`;
  }).join("");
  const privateVisible=canViewNamedVotes();
  const privateSection=$("#namedVoteDetails"),privateTools=$("#voteResultTools");
  privateSection.hidden=!privateVisible;
  privateTools.hidden=!privateVisible;
  if(privateVisible){
    const roster=Array.isArray(state.voterRoster)&&state.voterRoster.length
      ? state.voterRoster
      : committee.map(name=>({name,isRecused:state.votingOpen&&!state.voterSnapshot.includes(name)}));
    $("#namedVoteList").innerHTML=roster.map(item=>{
      const name=String(item.name||"").trim(),choice=state.votes?.[name];
      const status=item.isRecused?"recused":choice==="approve"?"approve":choice==="reject"?"reject":"pending";
      const label=item.isRecused?"迴避":choice==="approve"?config().approve:choice==="reject"?config().reject:"尚未投票";
      return `<span class="named-vote-row ${status}"><b>${escapeHtml(name)}<small>${escapeHtml(roles[name]||"投票資格者")}</small></b><em>${escapeHtml(label)}</em></span>`;
    }).join("")||'<span class="named-vote-empty">投票資格快照建立後會顯示逐人票向。</span>';
    const formed=["pass","reject"].includes(decision.status);
    $("#downloadVoteResult").disabled=!formed;
    $("#voteResultImageHint").textContent=formed
      ?`目前圖面會顯示已投 ${decision.total}／${decision.base} 人及同意、不同意票數；不列具名票向。`
      :"形成決議後可下載 PNG；圖面只含票數統計，不含具名票向。";
  }
  const eligible=state.voterSnapshot.includes(currentUser());
  const accessReady=voteAccessReady();
  const callStatus=state.voteCallStatus||"";
  const recordedCallEnvironment=["test","production"].includes(state.voteCallEnvironment)?state.voteCallEnvironment:selectedVoteEnvironment;
  const canPromoteVoteCall=callStatus==="replied"&&recordedCallEnvironment==="test";
  if(canPromoteVoteCall){selectedVoteEnvironment="production";voteEnvironmentTouched=false;}
  else if(!voteEnvironmentTouched&&state.voteCallId)selectedVoteEnvironment=recordedCallEnvironment;
  const callEnvironment=recordedCallEnvironment;
  const selectedGroupLabel=voteEnvironmentLabel(selectedVoteEnvironment);
  const callGroupLabel=voteEnvironmentLabel(callEnvironment);
  const environmentSelect=$("#voteCallEnvironment"),environmentHint=$("#voteCallEnvironmentHint");
  environmentSelect.value=selectedVoteEnvironment;
  environmentSelect.disabled=!isVp()||Boolean(activeVoteCallText)||["replying","replied"].includes(callStatus);
  environmentHint.textContent=canPromoteVoteCall
    ?"測試群圖卡已回覆；現在只可單向改發正式群，既有正式票會完整保留。"
    :selectedVoteEnvironment==="test"
    ?"測試群只改變圖卡發布位置；所有送票仍列入本案正式紀錄。"
    :"預設發布到正式群；所有送票都列入本案正式紀錄。";
  environmentHint.classList.toggle("warning",canPromoteVoteCall||selectedVoteEnvironment==="test");
  const canVote=state.votingOpen&&accessReady&&eligible&&!state.closed&&deadline.valid&&!deadline.expired;
  $("#submitVote").disabled=!canVote;
  $$("input[name=vote]").forEach(input=>input.disabled=!canVote);
  const hint=$("#voteActionHint");
  if(state.closed)hint.textContent="案件已結案，無法再投票。";
  else if(!eligible)hint.textContent="你不在本案投票資格快照中。";
  else if(!deadline.valid)hint.textContent="請副主席先設定有效的投票截止時間。";
  else if(deadline.expired)hint.textContent="投票期限已截止；請副主席先在案件基本資料更新截止時間，再重新通知委員。";
  else if(!accessReady)hint.textContent=`請等會員委員秘書Bot在${callGroupLabel}回覆投票圖卡。`;
  else hint.textContent="請選擇一個投票選項，再按「確認送出票」。";
  hint.classList.toggle("warning",!canVote);
  const own=state.votes[currentUser()]||"";
  $$("input[name=vote]").forEach(input=>input.checked=input.value===own);
  $("#voteNoticePreview").textContent=voteNotice();
  $("#copyVoteNotice").disabled=!(isVp()&&state.votingOpen&&!state.closed&&deadline.valid&&!deadline.expired&&(callStatus!=="replied"||canPromoteVoteCall));
  $("#copyVoteNotice").textContent=canPromoteVoteCall
    ?"改發正式群並複製新文案"
    :callStatus==="replied"
    ?"Bot 已回覆投票圖卡"
    :activeVoteCallText
      ?"再次複製完整投票文案"
      :state.voteCallId
        ?"重新產生並複製投票文案"
        :"啟動投票流程並複製文案";
  const lineState=$("#voteLineState");
  lineState.classList.toggle("sent",callStatus==="replied"||(!state.voteCallId&&accessReady));
  lineState.textContent=callStatus==="replied"
    ?canPromoteVoteCall
      ?`會員委員秘書Bot 已於 ${dateLabel(state.voteCallRepliedAt)} 在「${state.voteCallTargetName||callGroupLabel}」回覆測試群圖卡。確認圖卡無誤後，可改發正式群；測試連結會失效，既有正式票保留。`
      :`會員委員秘書Bot 已於 ${dateLabel(state.voteCallRepliedAt)} 在「${state.voteCallTargetName||callGroupLabel}」回覆投票圖卡；送票會寫入本案正式紀錄。`
    :callStatus==="replying"
      ?"Bot 已收到完整呼喚，正在回覆投票圖卡…"
      :callStatus==="reply_failed"
        ?`Bot 上次回覆失敗${state.voteCallError?`：${state.voteCallError}`:""}。請將相同完整文案再貼一次；若已重新整理，請重新產生文案。`
        :callStatus==="awaiting_reply"
          ?`完整文案已建立，等待貼到「${state.voteCallTargetName||callGroupLabel}」。Bot 只會在本次指定的${callGroupLabel}回覆完全相符的內容。`
          :callStatus==="revoked"
            ?"先前投票連結已失效，請重新產生完整文案。"
            :state.voteNoticeSent||state.voteNoticeCopiedAt
              ?"這是舊版人工通知紀錄；既有案件仍可投票，新呼喚請使用上方按鈕。"
              :`按下後會建立一次性投票網址；請將完整文案原樣貼到${selectedGroupLabel}，等待 Bot 回覆圖卡。所有送票都是正式票。`;
}

function renderResult(){
  const decision=voteDecision();
  const formed=decision.status==="pass"||decision.status==="reject";
  const approved=decision.status==="pass",rejected=decision.status==="reject",isNew=$("#caseType").value==="new";
  $("#renewalExtra").hidden=$("#caseType").value!=="renewal";
  $("#leadersPreview").textContent=formed?leadersMessage():"尚未形成會員委員會決議，三長群文案會在過半參與且形成多數後產生。";
  $("#copyLeaders").disabled=!formed;
  $("#sendLeaders").disabled=!(isVp()&&formed&&!state.leadersSent&&!state.closed);
  $("#sendLeaders").textContent=state.leadersSent?"已發送三長群":"模擬發送三長群";
  $("#advisorStatus").value=state.advisorStatus;
  $("#advisorNote").value=state.advisorNote;
  const advisorEditable=isVp()&&state.leadersSent&&!state.resultAnnouncementSent&&!state.closed;
  $("#advisorStatus").disabled=!advisorEditable;
  $("#advisorNote").disabled=!advisorEditable;
  $("#saveAdvisor").disabled=!advisorEditable;
  $("#resultReferrerRow").hidden=!isNew;
  $("#resultReferrerName").disabled=!(isVp()&&isNew&&!state.resultAnnouncementSent&&!state.closed);
  const oldProfession=String(caseDraft().currentProfession||state.form?.currentProfession||"").trim();
  const referrerValid=!isNew||[...$("#resultReferrerName").options].some(option=>option.value===$("#resultReferrerName").value&&option.dataset.memberId);
  const fieldsValid=Boolean($("#applicant").value.trim()&&$("#profession").value.trim()&&referrerValid&&($("#caseType").value!=="industry"||oldProfession));
  $("#resultAnnouncementPreview").textContent=rejected?"本案表決不通過，依現行規則不發布公告群。":formed?resultAnnouncementText():"尚未形成會員委員會決議。";
  $("#copyResultAnnouncement").disabled=!(approved&&fieldsValid);
  $("#sendResultAnnouncement").disabled=!(isVp()&&approved&&state.advisorStatus==="confirmed"&&fieldsValid&&!state.resultAnnouncementSent&&!state.closed);
  $("#sendResultAnnouncement").textContent=state.resultAnnouncementSent?"已發布正式公告":"發送正式公告群";
  const announcementState=$("#resultAnnouncementState");
  announcementState.classList.toggle("sent",Boolean(state.resultAnnouncementSent));
  announcementState.textContent=state.resultAnnouncementSent
    ? `已於 ${dateLabel(state.resultAnnouncementSentAt)} 發送至「${state.resultAnnouncementTargetName||"正式公告群"}」，系統已鎖定避免重複發送。`
    : rejected
      ? "此案不通過，不需要也不能發布公告。"
      : !formed
        ? "等待會員委員會形成通過決議。"
        : state.advisorStatus!=="confirmed"
          ? "等待董事顧問確認後，才可人工發布。"
          : !fieldsValid
            ? isNew?"請先從正式會員名單選擇引薦人。":"公告欄位不完整，請回到訪談資料確認。"
            : "已可發布；按下按鈕後仍會顯示正式群警告與完整文案，確認後才送出。";
  const mayClose=state.advisorStatus==="confirmed"&&(rejected||(approved&&state.resultAnnouncementSent));
  $("#closeCase").disabled=!(isVp()&&mayClose&&!state.closed);
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
  $("#caseType").disabled=true;
  $("#applicant").readOnly=true;
  $("#profession").readOnly=true;
  const feedbackCallStatus=state.feedbackCallStatus||"";
  const recordedFeedbackEnvironment=["test","production"].includes(state.feedbackCallEnvironment)?state.feedbackCallEnvironment:selectedFeedbackEnvironment;
  const canPromoteFeedbackCall=feedbackCallStatus==="replied"&&recordedFeedbackEnvironment==="test";
  if(canPromoteFeedbackCall){selectedFeedbackEnvironment="production";feedbackEnvironmentTouched=false;}
  else if(!feedbackEnvironmentTouched&&state.feedbackCallId)selectedFeedbackEnvironment=recordedFeedbackEnvironment;
  const feedbackCallEnvironment=recordedFeedbackEnvironment;
  const selectedFeedbackGroupLabel=feedbackEnvironmentLabel(selectedFeedbackEnvironment);
  const feedbackCallGroupLabel=feedbackEnvironmentLabel(feedbackCallEnvironment);
  const feedbackEnvironmentSelect=$("#feedbackCallEnvironment"),feedbackEnvironmentHint=$("#feedbackCallEnvironmentHint");
  feedbackEnvironmentSelect.value=selectedFeedbackEnvironment;
  feedbackEnvironmentSelect.disabled=!isVp()||Boolean(activeFeedbackCallText)||["replying","replied"].includes(feedbackCallStatus);
  feedbackEnvironmentHint.textContent=canPromoteFeedbackCall
    ?"測試群圖卡已回覆；現在只可單向改發正式群，既有正式回饋會完整保留。"
    :selectedFeedbackEnvironment==="test"
    ?"測試群只改變圖卡發布位置；所有回饋仍直接寫入本案正式紀錄。"
    :"預設發布到正式群；所有回饋都直接寫入本案正式紀錄。";
  feedbackEnvironmentHint.classList.toggle("warning",canPromoteFeedbackCall||selectedFeedbackEnvironment==="test");
  $("#feedbackNoticePreview").textContent=feedbackNotice();
  $("#copyFeedbackNotice").disabled=!(isVp()&&state.wordSaved&&!state.closed&&(feedbackCallStatus!=="replied"||canPromoteFeedbackCall));
  $("#copyFeedbackNotice").textContent=canPromoteFeedbackCall
    ?"改發正式群並複製新文案"
    :feedbackCallStatus==="replied"
    ?"Bot 已回覆回饋圖卡"
    :activeFeedbackCallText
      ?"再次複製完整回饋文案"
      :state.feedbackCallId
        ?"重新產生並複製回饋文案"
        :"啟動回饋流程並複製文案";
  const feedbackLineState=$("#feedbackLineState");
  feedbackLineState.classList.toggle("sent",feedbackCallStatus==="replied"||(!state.feedbackCallId&&Boolean(state.feedbackNoticeDeliveryId)));
  feedbackLineState.textContent=feedbackCallStatus==="replied"
    ?canPromoteFeedbackCall
      ?`會員委員秘書Bot 已於 ${dateLabel(state.feedbackCallRepliedAt)} 在「${state.feedbackCallTargetName||feedbackCallGroupLabel}」回覆測試群圖卡。確認圖卡無誤後，可改發正式群；測試連結會失效，既有正式回饋保留。`
      :`會員委員秘書Bot 已於 ${dateLabel(state.feedbackCallRepliedAt)} 在「${state.feedbackCallTargetName||feedbackCallGroupLabel}」回覆免登入回饋圖卡；委員打開即可查看目前所有回饋。`
    :feedbackCallStatus==="replying"
      ?"Bot 已收到完整呼喚，正在回覆回饋圖卡…"
      :feedbackCallStatus==="reply_failed"
        ?`Bot 上次回覆失敗${state.feedbackCallError?`：${state.feedbackCallError}`:""}。請將相同完整文案再貼一次；若已重新整理，請重新產生文案。`
        :feedbackCallStatus==="awaiting_reply"
          ?`完整文案已建立，等待貼到「${state.feedbackCallTargetName||feedbackCallGroupLabel}」。Bot 只會在本次指定的${feedbackCallGroupLabel}回覆完全相符的內容。`
          :feedbackCallStatus==="revoked"
            ?"先前回饋連結已失效，請重新產生完整文案。"
            :state.feedbackNotified
              ?"本案已有舊版 LINE 回饋通知紀錄；仍可建立免登入回饋圖卡，貼文前請確認群組不會重複收到相同通知。"
              :`按下後會建立一次性回饋網址；請將完整文案原樣貼到${selectedFeedbackGroupLabel}，等待 Bot 回覆圖卡。`;
  $("#resetCase").hidden=state.closed||state.resultAnnouncementSent;
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
  const draft=caseDraft();
  return {
    caseType:sourceTask?.type||$("#caseType").value,
    applicant:sourceTask?.member||$("#applicant").value,
    profession:sourceTask?.profession||$("#profession").value,
    interviewDate:$("#interviewDate").value,leadInterviewer:$("#leadInterviewer").value,companionInterviewer:$("#companionInterviewer").value,
    voteDeadline:$("#voteDeadline").value,recusedMember:recusedApplicant(),annualTraining:$("#annualTraining").value,annualVisitors:$("#annualVisitors").value,
    referrerName:$("#caseType").value==="new"?$("#resultReferrerName").value:"",
    currentProfession:$("#caseType").value==="industry"?String(draft.currentProfession||state.form?.currentProfession||"").trim():""
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
  const taskBoundFields=new Set(["caseType","applicant","profession"]);
  Object.entries(form).forEach(([id,value])=>{if(id==="recusedMember"||id==="loginUser"||(sourceTask&&taskBoundFields.has(id)))return;const node=$(`#${id}`);if(node&&value!==undefined)node.value=value;});
  if($("#caseType").value==="new")$("#resultReferrerName").value=form.referrerName||caseDraft().referrerName||"";
  $("#recusedMember").value=recusedApplicant()||"無須迴避";
  if(state.votingOpen&&!caseDomain.voteCount(state)){
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
  $("#feedbackCallEnvironment").addEventListener("change",event=>{
    selectedFeedbackEnvironment=event.target.value==="test"?"test":"production";
    feedbackEnvironmentTouched=true;
    renderSummary();
  });
  $("#voteCallEnvironment").addEventListener("change",event=>{
    selectedVoteEnvironment=event.target.value==="test"?"test":"production";
    voteEnvironmentTouched=true;
    renderVote();
  });
  $("#myFeedback").addEventListener("input",()=>{feedbackDirty=true;});
  $("#feedbackAuthor").addEventListener("change",event=>{
    const next=event.target.value;
    if(feedbackDirty&&!confirm("切換回饋歸屬會捨棄目前尚未儲存的文字，確定切換嗎？")){
      event.target.value=feedbackEditorTarget;
      return;
    }
    feedbackDirty=false;
    feedbackEditorTarget=next;
    renderFeedback();
  });
  $("#voteDeadline").addEventListener("change",()=>{
    if(!voteAccessReady()&&!state.voteCallId)return;
    activeVoteCallText="";
    state.voteNoticeSent=false;
    delete state.voteNoticeSentAt;
    delete state.voteNoticeTargetName;
    delete state.voteNoticeDeliveryId;
    delete state.voteNoticeCopiedAt;
    delete state.voteNoticeCopiedBy;
    delete state.voteNoticeCopiedDeadline;
    delete state.voteCallId;
    delete state.voteCallStatus;
    delete state.voteCallCreatedAt;
    delete state.voteCallRepliedAt;
    delete state.voteCallFailedAt;
    delete state.voteCallError;
    delete state.voteCallDeadline;
    delete state.voteCallTargetName;
    delete state.voteCallEnvironment;
    selectedVoteEnvironment="production";
    voteEnvironmentTouched=false;
    addLog("投票截止時間已更新，需重新通知委員");
    persistNow();
    toast("截止時間已更新，請重新通知委員投票");
  });
  $("#wordFile").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{await storeWord(file);render();toast("Word 已保存至 Supabase Private Storage")}catch(error){toast(error.message||"Word 保存失敗")}});
  $("#downloadWord").addEventListener("click",async()=>{const file=await getWord();if(!file)return toast("目前只有示範檔名，請先上傳真實 Word");const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $("#copyFeedbackNotice").addEventListener("click",async()=>{
    if(!isVp()||!state.wordSaved||state.closed)return;
    const promotingToProduction=state.feedbackCallStatus==="replied"&&state.feedbackCallEnvironment==="test";
    const feedbackEnvironment=promotingToProduction?"production":selectedFeedbackEnvironment==="test"?"test":"production";
    const groupLabel=feedbackEnvironmentLabel(feedbackEnvironment);
    if(activeFeedbackCallText&&!promotingToProduction){
      try{await navigator.clipboard.writeText(activeFeedbackCallText);$("#saveState").textContent=`完整回饋文案已再次複製；等待貼到${groupLabel}`;return toast(`請將完整文案原樣貼到委員會${groupLabel}`)}
      catch{$("#feedbackNoticePreview").focus();return toast("請手動全選下方完整文案後複製")}
    }
    if(promotingToProduction&&!confirm(`即將把「${$("#applicant").value.trim()||"本案申請者"}」的回饋圖卡由測試群改發正式群。\n\n改發後：\n・測試群舊連結會失效\n・已收到的正式回饋全部保留\n・系統會建立一份新的正式群文案\n\n確定改發正式群？`))return;
    if(!promotingToProduction&&feedbackEnvironment==="test"&&!confirm(`你選擇的是「測試群」。\n\n這只改變回饋圖卡的發布位置；委員送出的內容仍會直接寫入「${$("#applicant").value.trim()||"本案申請者"}」這筆正式案件，並列入回饋門檻。\n\n測試群回覆後，仍可單向改發正式群。確定先用測試群啟動這筆正式回饋？`))return;
    const button=$("#copyFeedbackNotice");button.disabled=true;button.textContent="正在建立回饋連結…";
    clearTimeout(saveTimer);
    state.form=collectForm();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    $("#saveState").textContent="正在確認案件欄位與 LINE 群組…";
    try{await window.FulianCaseStateStore.flush()}catch(error){state=loadState();render();$("#saveState").textContent="案件欄位尚未同步";return toast(error.message||"請先完成案件資料同步");}
    button.disabled=true;button.textContent="正在建立回饋連結…";
    $("#saveState").textContent="正在建立一次性回饋連結…";
    lastPersist=window.FulianCaseStateStore.prepareFeedbackCall(CASE_ID,feedbackEnvironment);
    try{
      const result=await lastPersist;
      activeFeedbackCallText=result.callText||"";selectedFeedbackEnvironment=result.feedbackEnvironment==="test"?"test":"production";feedbackEnvironmentTouched=false;state=loadState();render();
      try{await navigator.clipboard.writeText(activeFeedbackCallText);$("#saveState").textContent=`完整回饋文案已複製；等待貼到${groupLabel}`;toast(result.message||`請將完整文案貼到委員會${groupLabel}`)}
      catch{$("#feedbackNoticePreview").focus();$("#saveState").textContent="回饋文案已建立，請手動全選下方內容複製";toast("瀏覽器未允許自動複製，請手動複製完整文案")}
    }catch(error){
      state=loadState();render();
      $("#saveState").textContent="回饋流程尚未啟動";
      toast(error.message||"回饋呼喚建立失敗");
    }
  });
  $("#saveFeedback").addEventListener("click",async()=>{const text=$("#myFeedback").value.trim(),user=currentUser(),target=selectedFeedbackAuthor(),proxy=isVp()&&target!==user;if(!text)return toast("請先填寫回饋內容");if(!user)return toast("登入身份載入失敗，請重新登入後再試");if(!eligibleMembers().includes(target))return toast(`${target||user}是本案申請者，依規則須迴避回饋與投票`);if(target!==user&&!isVp())return toast("只有副主席可以代填會員委員回饋");$("#saveState").textContent=proxy?`正在代填 ${target} 的回饋…`:"正在保存你的回饋…";lastPersist=window.FulianCaseStateStore.saveFeedback(CASE_ID,text,target);try{await lastPersist;feedbackDirty=false;state=loadState();render();$("#saveState").textContent=proxy?`${target} 的代填回饋已保存至 Supabase`:"你的回饋已保存至 Supabase";toast(proxy?`已代填 ${target} 的回饋`:"回饋已儲存")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"回饋保存失敗")}});
  $("#openVote").addEventListener("click",async()=>{if(!isVp()||!feedbackReady())return;const deadline=voteDeadlineStatus();if(!deadline.valid)return toast("請先設定有效的投票截止時間");if(deadline.expired)return toast("投票期限已截止，請先更新截止時間");const proposed={...state,form:collectForm(),votingOpen:true};$("#saveState").textContent="正在建立投票資格快照…";lastPersist=window.FulianCaseStateStore.openVote(CASE_ID,proposed);try{await lastPersist;state=loadState();render();$("#saveState").textContent="投票已開啟並保存資格快照";toast("系統投票已開啟")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"投票開啟失敗")}});
  $("#copyVoteNotice").addEventListener("click",async()=>{
    if(!isVp())return;
    const deadline=voteDeadlineStatus();
    if(!deadline.valid)return toast("請先設定有效的投票截止時間");
    if(deadline.expired)return toast("投票期限已截止，請先更新截止時間");
    const promotingToProduction=state.voteCallStatus==="replied"&&state.voteCallEnvironment==="test";
    const voteEnvironment=promotingToProduction?"production":selectedVoteEnvironment==="test"?"test":"production";
    const groupLabel=voteEnvironmentLabel(voteEnvironment);
    if(activeVoteCallText&&!promotingToProduction){
      try{await navigator.clipboard.writeText(activeVoteCallText);$("#saveState").textContent=`完整投票文案已再次複製；等待貼到${groupLabel}`;return toast(`請將完整文案原樣貼到委員會${groupLabel}`)}
      catch{$("#voteNoticePreview").focus();return toast("請手動全選下方完整文案後複製")}
    }
    if(promotingToProduction&&!confirm(`即將把「${$("#applicant").value.trim()||"本案申請者"}」的投票圖卡由測試群改發正式群。\n\n改發後：\n・測試群舊連結會失效\n・已收到的正式票全部保留\n・尚未投票者可從正式群新圖卡繼續投票\n\n確定改發正式群？`))return;
    if(!promotingToProduction&&voteEnvironment==="test"&&!confirm(`你選擇的是「測試群」。\n\n這只改變投票圖卡的發布位置；委員送出的票仍會直接寫入「${$("#applicant").value.trim()||"本案申請者"}」這筆正式案件，並影響票數、決議與結案。\n\n測試群回覆後，仍可單向改發正式群。確定先用測試群啟動這筆正式投票？`))return;
    const button=$("#copyVoteNotice");button.disabled=true;button.textContent="正在記錄複製通知…";
    $("#saveState").textContent="正在建立一次性投票連結…";
    lastPersist=window.FulianCaseStateStore.prepareVoteCall(CASE_ID,voteEnvironment);
    try{
      const result=await lastPersist;activeVoteCallText=result.callText||"";selectedVoteEnvironment=result.voteEnvironment==="test"?"test":"production";voteEnvironmentTouched=false;state=loadState();render();
      try{await navigator.clipboard.writeText(activeVoteCallText);$("#saveState").textContent=`完整投票文案已複製；等待貼到${groupLabel}`;toast(result.message||`請將完整文案貼到委員會${groupLabel}`)}
      catch{$("#voteNoticePreview").focus();$("#saveState").textContent="投票文案已建立，請手動全選下方內容複製";toast("瀏覽器未允許自動複製，請手動複製完整文案")}
    }catch(error){state=loadState();render();$("#saveState").textContent="投票流程尚未啟動";toast(error.message||"投票呼喚建立失敗")}
  });
  $("#submitVote").addEventListener("click",async()=>{const deadline=voteDeadlineStatus();if(!voteAccessReady())return toast(`請等會員委員秘書Bot在${voteEnvironmentLabel(state.voteCallEnvironment)}回覆投票圖卡`);if(!deadline.valid)return toast("請先設定有效的投票截止時間");if(deadline.expired)return toast("投票期限已截止");const selected=$("input[name=vote]:checked");if(!selected)return toast("請選擇投票選項");if(!state.voterSnapshot.includes(currentUser()))return toast("你不在本案投票資格快照中");$("#saveState").textContent="正在送出你的投票…";lastPersist=window.FulianCaseStateStore.saveVote(CASE_ID,selected.value);try{await lastPersist;state=loadState();render();$("#saveState").textContent="你的投票已安全記錄";toast("投票已記錄")}catch(error){$("#saveState").textContent="Supabase 保存失敗";toast(error.message||"投票失敗")}});
  $("#downloadVoteResult").addEventListener("click",async()=>{
    if(!canViewNamedVotes()||!["pass","reject"].includes(voteDecision().status))return;
    const button=$("#downloadVoteResult"),original=button.textContent;
    button.disabled=true;button.textContent="正在產生 PNG…";
    try{await window.FulianVoteResultImage.download(voteResultReport());toast("投票結果圖已下載");}
    catch(error){toast(error.message||"投票結果圖下載失敗");}
    finally{button.textContent=original;renderVote();}
  });
  $("#copyLeaders").addEventListener("click",async()=>{if(!isVp())return;await navigator.clipboard.writeText(leadersMessage());toast("三長群文案已複製");});
  $("#sendLeaders").addEventListener("click",()=>{if(!isVp())return;state.leadersSent=true;addLog("投票結果已模擬發送至三長群");persistNow();toast("已模擬發送三長群");});
  $("#saveAdvisor").addEventListener("click",()=>{if(!isVp())return;state.advisorStatus=$("#advisorStatus").value;state.advisorNote=$("#advisorNote").value.trim();addLog(state.advisorStatus==="confirmed"?"董事顧問已同意會員委員會決議":state.advisorStatus==="returned"?"董事顧問退回補充資料":"董事顧問確認仍待回覆");persistNow();toast("董顧確認狀態已保存");});
  $("#copyResultAnnouncement").addEventListener("click",async()=>{if(voteDecision().status!=="pass")return;await navigator.clipboard.writeText(resultAnnouncementText());toast("正式公告文案已複製");});
  $("#sendResultAnnouncement").addEventListener("click",async()=>{
    if(!isVp()||voteDecision().status!=="pass"||state.advisorStatus!=="confirmed")return;
    const text=resultAnnouncementText();
    if(!confirm(`即將發送到正式公告群，所有會員都會看到。\n此公告不會標註 @所有人，且同一案件成功送出後不能重複發送。\n\n${text}\n\n確定立即發送？`))return;
    const button=$("#sendResultAnnouncement");button.disabled=true;button.textContent="正式 LINE 發送中…";
    $("#saveState").textContent="正在等待 LINE 確認送達…";
    lastPersist=window.FulianCaseStateStore.sendResultAnnouncement(CASE_ID);
    try{
      const result=await lastPersist;
      state=loadState();render();
      $("#saveState").textContent="正式公告已送達並保存至 Supabase";
      toast(result.message||"正式公告已送達公告群");
    }catch(error){
      state=loadState();render();
      $("#saveState").textContent="正式公告尚未完成";
      toast(error.message||"正式公告發送失敗");
    }
  });
  $("#closeCase").addEventListener("click",async()=>{const decision=voteDecision(),mayClose=state.advisorStatus==="confirmed"&&(decision.status==="reject"||(decision.status==="pass"&&state.resultAnnouncementSent));if(!isVp()||!mayClose)return;const proposed={...state,form:collectForm(),closed:true,log:[{text:"案件已由副主席確認結案存檔",time:nowLabel(),done:true},...(state.log||[])].slice(0,20)};$("#saveState").textContent="正在確認 Supabase 正式結案…";lastPersist=window.FulianCaseStateStore.saveWorkflow(CASE_ID,proposed);try{await lastPersist;state=loadState();render();await window.FulianTaskStore.refresh();sourceTask=window.FulianTaskStore.all().find(item=>item.id===CASE_ID)||sourceTask;$("#saveState").textContent="案件已正式結案並保存至 Supabase";toast("案件已結案存檔")}catch(error){$("#saveState").textContent="Supabase 結案失敗，案件仍維持原狀";render();toast(error.message||"案件結案同步失敗")}});
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
  if(!sourceTask||!caseDomain.requiresDecisionWorkflow(sourceTask)){
    document.querySelector("main").hidden=true;
    alert("找不到適用的正式決議案件，請由進行中案件重新開啟。");
    location.replace("case-board.html");
    return;
  }
  configureIdentity();
  populateSelects();
  restoreForm();
  if($("#applicant").value){
    try{
      const response=await fetch("/api/bni-analysis",{cache:"no-store"});
      if(!response.ok)throw new Error(`正式會員資料載入失敗：HTTP ${response.status}`);
      const snapshot=await response.json(),matched=(snapshot.members||[]).find(item=>item.name===$("#applicant").value);
      announcementMembers=snapshot.members||[];
      populateResultReferrers();
      if(matched?.profession&&!$("#profession").value)$("#profession").value=matched.profession;
      if(autofillAnnualRenewalMetrics(snapshot,matched)){
        state.form=collectForm();
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
        $("#saveState").textContent="年度 PALMS 已自動帶入";
        $("#saveTime").textContent=`最後儲存 ${new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
      }
    }catch{if($("#caseType").value==="renewal"){$("#annualDataSource").hidden=false;$("#annualDataSource").textContent="年度 PALMS 載入失敗，請重新整理或人工確認。";}else if($("#caseType").value==="new"){$("#resultAnnouncementState").textContent="正式會員名單載入失敗，請重新整理後再選擇引薦人。";}}
  }
  try{$("#downloadWord").disabled=!(await getWord());}catch{$("#downloadWord").disabled=true;}
  bindEvents();
  render();
}

init();
