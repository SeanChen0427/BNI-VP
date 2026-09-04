(function(){
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const session=FulianAuth.getSession(),identity=`${session.role}:${session.name}`,canManage=["vp","admin"].includes(session.role),TASK_KEY=FulianCaseDomain.TASK_STORAGE_KEY;
  const {isNewMemberReview,latestRenewalDecisionAmendment,effectiveCareDisposition,isConfirmedNonRenewal,hasRenewalDecisionCorrection,requiresCareAssignment,missingCareAssignments}=FulianMonthlyMeetingDomain;
  const editableIds=["meetingMonth","meetingDate","reportMonth","recorder","attendanceMemberCount","absenceActual","absenceList","lateActual","lateList","proxyActual","proxyList","attendanceNotes","chapterTarget","lostCount","applicationCount","growthCount","approvedCount","conditionalCount","pendingReviewCount","growthNotes","careActions","memberAssistance","motions","conclusion","followUps"];
  let store={settings:{chapterSizeTarget:51},records:[]},record=null,saveTimer=null,snapshot=null,renewalCorrectionRequest=null;
  const pad=value=>String(value).padStart(2,"0"),isoDate=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
  function toast(message){const node=$("#toast");node.textContent=message;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2200)}
  function currentMonth(){const now=new Date();return`${now.getFullYear()}-${pad(now.getMonth()+1)}`}
  function previousMonth(value){const [year,month]=String(value||currentMonth()).split("-").map(Number),date=new Date(year,month-2,1);return`${date.getFullYear()}-${pad(date.getMonth()+1)}`}
  function defaultMeetingDate(month){const [year,m]=month.split("-").map(Number),date=new Date(year,m-1,1),offset=(2-date.getDay()+7)%7;date.setDate(1+offset);return isoDate(date)}
  function meetingId(month){return`meeting-${month}`}
  function emptyRecord(month=currentMonth()){return{id:meetingId(month),meetingMonth:month,meetingDate:defaultMeetingDate(month),reportMonth:previousMonth(month),recorder:session.name,attendees:[session.name],status:"draft",attendance:{memberCount:0,absenceActual:0,absenceList:"",lateActual:0,lateList:"",proxyActual:0,proxyList:"",notes:"",source:"正在讀取上月單月 PALMS",periodStart:"",periodEnd:""},growth:{chapterTarget:store.settings.chapterSizeTarget||51,chapterActual:0,lostCount:0,applicationCount:0,growthCount:0,approvedCount:0,conditionalCount:0,pendingReviewCount:0,notes:""},care:{members:"",actions:""},memberAssistance:"",motions:"",conclusion:"",followUps:""}}
  async function api(method="GET",body=null){const options={method,headers:{"Content-Type":"application/json"},cache:"no-store"};if(body)options.body=JSON.stringify(body);const url=`/api/committee-meetings${method==="GET"?`?identity=${encodeURIComponent(identity)}`:""}`,response=await fetch(url,options),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"月會紀錄服務無法使用");return data}
  async function attendanceContext(month){
    const response=await fetch(`/api/bni-monthly-attendance?month=${encodeURIComponent(month)}`,{cache:"no-store"}),data=await response.json();
    if(!response.ok)throw new Error(data.message||"BNI Connect 單月 PALMS 無法讀取");
    return{...data,source:`${data.source}・${new Date(data.fetchedAt).toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} 更新`};
  }
  function loadTasks(){try{const list=JSON.parse(localStorage.getItem(TASK_KEY)||"[]");return Array.isArray(list)?list:[]}catch{return[]}}
  function workflow(task){return FulianCaseDomain.readWorkflow(localStorage,task.id)||{}}
  function isClosedTask(task){return FulianCaseDomain.isClosed(task,workflow(task))}
  function inMonth(value,month){return String(value||"").slice(0,7)===month}
  function caseContext(month){
    const tasks=loadTasks(),applications=tasks.filter(task=>task.type==="new"&&inMonth(task.createdAt,month)),departures=tasks.filter(task=>task.type==="departure"&&isClosedTask(task)&&inMonth(task.completedAt,month));
    const newCases=tasks.filter(task=>task.type==="new"),approved=newCases.filter(task=>{const state=workflow(task),result=FulianCaseDomain.voteSummary(state);return isClosedTask(task)&&inMonth(task.completedAt,month)&&result.status==="pass"});
    const pending=newCases.filter(task=>!isClosedTask(task));
    const care=tasks.filter(task=>!isClosedTask(task)&&["renewal","midterm","special"].includes(task.type)).map(task=>({id:task.id,member:task.member,taskType:task.type,type:task.type==="renewal"?"續約／終期輔導":task.type==="midterm"?"期中輔導":"特定關懷",stage:task.stage||"待處理",lead:task.lead||"",companion:task.companions?.[0]||"",scheduledAt:task.scheduledAt||"",notes:task.notes||"",source:task.source||""}));
    return{lostCount:departures.length,applicationCount:applications.length,growthCount:approved.length-departures.length,approvedCount:approved.length,conditionalCount:0,pendingReviewCount:pending.length,taskCareMembers:care,taskIds:tasks.map(task=>task.id),completedTaskIds:tasks.filter(isClosedTask).map(task=>task.id)};
  }
  async function loadBni(){try{const response=await fetch("/api/bni-analysis",{cache:"no-store"});if(response.ok)snapshot=await response.json()}catch{}}
  const careStates={pending:"待討論",scheduled:"已排定",active:"追蹤中",done:"已完成"},careDispositions={follow_up:"排定後續工作",non_renewal:"確認不續約"};
  function careStateLabel(item){return isConfirmedNonRenewal(item)?"確認不續約":careStates[item.state]||"待討論"}
  function identityName(value){const parts=String(value||"").split(":");return parts.length>1?parts.slice(1).join(":"):String(value||"")}
  function correctionTime(value){const date=new Date(value);return Number.isNaN(date.getTime())?String(value||""):date.toLocaleString("zh-TW")}
  function careId(category,title){return`${category}-${title}`.replace(/\s+/g,"").replace(/[^\p{Letter}\p{Number}\-↔／]/gu,"").slice(0,100)}
  function memberFromCard(card){return String(card?.title||"").trim().split(/[｜|\s]/)[0]}
  function daysUntil(value){const target=new Date(`${value}T00:00:00`),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Number.isNaN(target.getTime())?null:Math.ceil((target-today)/86400000)}
  function dashboardCareItems(context=caseContext($("#reportMonth")?.value||previousMonth(currentMonth())),existing=[]){
    const items=[],section=title=>snapshot?.sections?.find(item=>item.title.includes(title)),push=(category,title,detail,action,defaults={})=>items.push({id:careId(category,title),category,title,detail,action,state:"pending",owner:"",companion:"",dueDate:"",note:"",assignmentRequired:true,...defaults});
    const renewal=section("續約雷達")?.tables?.[0];
    for(const row of renewal?.rows||[]){const remaining=daysUntil(row[2]);if(remaining!==null&&remaining<=30)push("續約追蹤",row[0],`燈號 ${row[1]}｜續約截止 ${row[2]}｜${remaining<0?`已逾期 ${Math.abs(remaining)} 天`:`剩餘 ${remaining} 天`}｜${row[4]}`,row[5],{member:row[0],taskType:"renewal",disposition:"follow_up"})}
    const cards=(title,label,taskType)=>{for(const card of section(title)?.cards||[]){if(isNewMemberReview(card))continue;push(label,card.title,card.detail,card.action,{member:memberFromCard(card),taskType})}};
    cards("燈號關懷","需輔導會員","special");
    cards("期中關懷到點","期中關懷到點","midterm");
    for(const task of context.taskCareMembers||[]){
      const matched=items.find(item=>item.member===task.member&&item.taskType===task.taskType);
      const assignment={taskId:task.id,member:task.member,taskType:task.taskType,state:"scheduled",owner:task.lead,companion:task.companion,dueDate:String(task.scheduledAt).slice(0,10),note:task.notes,taskCreatedByMeeting:task.source==="monthly-meeting",...(task.taskType==="renewal"?{disposition:"follow_up"}:{})};
      if(matched)Object.assign(matched,assignment);
      else push("已排定關懷案件",task.member,`${task.type}｜${task.stage}`,task.lead?`已由 ${task.lead} 負責`:"尚未指派負責人",assignment);
    }
    for(const saved of existing||[])if(isConfirmedNonRenewal(saved)&&!items.some(item=>item.id===saved.id))items.push({...saved});
    const previous=new Map((existing||[]).map(item=>[item.id,item])),liveTaskIds=new Set(context.taskIds||[]),completedTaskIds=new Set(context.completedTaskIds||[]);
    return items.map(item=>{
      const saved=previous.get(item.id);if(!saved)return item;
      if(isConfirmedNonRenewal(saved)){const taskId=[item.taskId,saved.taskId].find(id=>id&&liveTaskIds.has(id))||"";return{...item,disposition:"non_renewal",assignmentRequired:false,state:"done",owner:"",companion:"",dueDate:"",note:saved.note||"",taskId,taskCreatedByMeeting:Boolean(taskId&&(item.taskCreatedByMeeting||saved.taskCreatedByMeeting)),syncMissing:false,taskDeleted:false}}
      if(item.taskId)return{...item,disposition:item.disposition||saved.disposition,state:completedTaskIds.has(item.taskId)?"done":item.state};
      const savedTaskExists=saved.taskId&&liveTaskIds.has(saved.taskId);
      const staleSchedule=saved.taskId&&!savedTaskExists&&["scheduled","active"].includes(saved.state);
      const disposition=saved.disposition||item.disposition;
      return{...item,disposition,assignmentRequired:disposition==="follow_up"?true:saved.assignmentRequired??item.assignmentRequired,state:staleSchedule?"pending":completedTaskIds.has(saved.taskId)?"done":saved.state||item.state,owner:saved.owner||item.owner,companion:saved.companion||item.companion,dueDate:saved.dueDate||item.dueDate,note:saved.note||item.note||"",taskId:savedTaskExists?saved.taskId:"",taskCreatedByMeeting:savedTaskExists&&Boolean(saved.taskCreatedByMeeting),syncMissing:Boolean(staleSchedule||saved.syncMissing),taskDeleted:Boolean(saved.taskDeleted)};
    });
  }
  function careMembersText(items=[]){
    if(!items.length)return"目前會員關懷儀表板與進行中案件均無待討論名單。";
    const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);const nonRenewal=isConfirmedNonRenewal(item),correction=latestRenewalDecisionAmendment(item),decision=nonRenewal?"會議決議：確認不續約":correction?"原會議決議：確認不續約｜結案後更正：恢復續約追蹤":`建議：${item.action}`,management=[careStateLabel(item),nonRenewal&&"無需建立新工作排程",nonRenewal&&item.taskId&&"既有工作待另行確認",item.owner&&`負責：${item.owner}`,item.companion&&`陪訪：${item.companion}`,item.dueDate&&`排定：${item.dueDate}`,correction&&`更正原因：${correction.reason}`,correction&&`更正人：${identityName(correction.correctedBy)}`,correction&&`更正時間：${correctionTime(correction.correctedAt)}`,item.note&&`紀錄：${item.note}`].filter(Boolean).join("｜");groups.get(item.category).push(`${item.title}｜${item.detail}｜${decision}｜處理：${management}`)}
    return[...groups].map(([category,rows])=>`【${category}】\n${rows.join("\n")}`).join("\n\n");
  }
  function renewalCorrectionsText(items=[]){
    const rows=items.map(item=>({item,correction:latestRenewalDecisionAmendment(item)})).filter(entry=>entry.correction).map(({item,correction})=>`${item.title}｜原決議：確認不續約｜更正：恢復續約追蹤｜原因：${correction.reason}｜負責：${correction.owner}${correction.companion?`｜陪訪：${correction.companion}`:""}｜排定：${correction.dueDate}｜更正人：${identityName(correction.correctedBy)}｜更正時間：${correctionTime(correction.correctedAt)}`);
    return rows.join("\n");
  }
  function renderCareSummary(items=[]){
    const actionable=items.filter(requiresCareAssignment),nonRenewal=items.filter(isConfirmedNonRenewal),pending=actionable.filter(item=>item.state==="pending").length,active=actionable.filter(item=>["scheduled","active"].includes(item.state)).length,done=actionable.filter(item=>item.state==="done").length+nonRenewal.length,total=actionable.length+nonRenewal.length,percent=total?Math.round(done/total*100):0;
    $("#carePendingCount").textContent=pending;$("#careActiveCount").textContent=active;$("#careDoneCount").textContent=done;$("#careProgressBar").style.width=`${percent}%`;$("#careProgressText").textContent=`${percent}%`;
  }
  async function syncCareTask(item){
    if(!canManage||!item.member||!item.taskType)return null;
    let tasks=loadTasks();
    const referenced=item.taskId?tasks.find(task=>task.id===item.taskId):null;
    if(referenced&&!FulianCaseDomain.sameTaskIdentity(referenced,item)){
      item.taskId="";
      item.taskCreatedByMeeting=false;
    }
    let existing=(referenced&&FulianCaseDomain.sameTaskIdentity(referenced,item)&&!isClosedTask(referenced)?referenced:null)
      ||tasks.find(task=>!isClosedTask(task)&&FulianCaseDomain.sameTaskIdentity(task,item));
    if(!requiresCareAssignment(item)){
      item.taskDeleted=false;item.syncMissing=false;
      if(existing){item.taskId=existing.id;item.taskCreatedByMeeting=existing.source==="monthly-meeting"&&existing.sourceCareId===item.id;return"existing"}
      item.taskId="";item.taskCreatedByMeeting=false;return null;
    }
    if(item.taskDeleted)return"deleted";
    if(!item.owner||!item.dueDate){
      if(existing?.source==="monthly-meeting"&&existing.sourceCareId===item.id){
        await window.FulianTaskStore.remove(existing.id);item.taskId="";item.taskCreatedByMeeting=false;window.dispatchEvent(new CustomEvent("fulian:data-changed",{detail:{source:"monthly-meeting"}}));return"removed";
      }
      return null;
    }
    const profession=snapshot?.members?.find(member=>member.name===item.member)?.profession||existing?.profession||"",created=!existing,id=existing?.id||FulianCaseDomain.createTaskId(tasks),scheduledAt=String(item.dueDate).includes("T")?item.dueDate:`${item.dueDate}T19:00`,provenance=created?{source:"monthly-meeting",sourceMeetingId:record.id,sourceCareId:item.id}:{};
    const task={...existing,id,type:item.taskType,member:item.member,profession,scheduledAt,lead:item.owner,companions:item.companion?[item.companion]:[],priority:item.taskType==="midterm"?"normal":"high",stage:item.taskType==="renewal"?"續約訪談已排定":item.taskType==="midterm"?"期中關懷已排定":"會員關懷已排定",notes:item.note||existing?.notes||item.action||"",completed:false,createdAt:existing?.createdAt||new Date().toISOString(),createdBy:existing?.createdBy||session.name,...provenance};
    if(existing)tasks.splice(tasks.indexOf(existing),1,task);else tasks.push(task);
    localStorage.setItem(TASK_KEY,JSON.stringify(tasks));await window.FulianTaskStore.flush();item.taskId=id;item.taskCreatedByMeeting=task.source==="monthly-meeting";if(item.state==="pending")item.state="scheduled";window.dispatchEvent(new CustomEvent("fulian:data-changed",{detail:{source:"monthly-meeting"}}));return created?"created":"updated";
  }
  function careAssignmentControls(item,people){
    const correction=latestRenewalDecisionAmendment(item),disposition=effectiveCareDisposition(item)||"follow_up",decision=item.taskType==="renewal"?`<label class="full care-disposition">${correction?"目前有效處理":"本次月會決議"}<select class="care-control" data-field="disposition"><option value="follow_up" ${disposition==="follow_up"?"selected":""}>${careDispositions.follow_up}</option><option value="non_renewal" ${disposition==="non_renewal"?"selected":""}>${careDispositions.non_renewal}（不建立工作）</option></select></label>`:"",amendment=correction?`<div class="care-amendment-note"><b>結案後已更正</b><span>原決議「確認不續約」完整保留；${escapeHtml(identityName(correction.correctedBy))} 於 ${escapeHtml(correctionTime(correction.correctedAt))} 更正為恢復續約追蹤。</span><small>原因：${escapeHtml(correction.reason)}</small></div>`:"";
    if(isConfirmedNonRenewal(item))return`${decision}<div class="care-non-renewal-note"><b>已確認不續約</b><span>本項只保留月會決議，不要求追蹤委員或排定日期，也不建立新工作。這不會自動變更會員主檔或離會狀態。</span></div>${item.taskId?`<div class="care-existing-task-note"><b>已有工作仍保留</b><span>為避免誤刪訪談或案件紀錄，請至工作總覽另行確認處理。</span></div>`:""}<label class="full">決議備註（選填）<textarea class="care-control" data-field="note" placeholder="例如：會員於本次月會確認不續約">${escapeHtml(item.note||"")}</textarea></label>`;
    if(!requiresCareAssignment(item))return`${decision}<div class="care-non-renewal-note"><b>無需排定</b><span>本項為資訊紀錄，不需建立後續工作。</span></div><label class="full">備註（選填）<textarea class="care-control" data-field="note">${escapeHtml(item.note||"")}</textarea></label>`;
    return`${decision}${amendment}<label>追蹤委員（必填）<select class="care-control" data-field="owner" required><option value="">請選擇追蹤委員</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${item.owner===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}</select></label><label>陪訪委員（選填）<select class="care-control" data-field="companion"><option value="">不指定陪訪</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${item.companion===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}</select></label><label>處理狀態<select class="care-control" data-field="state">${Object.entries(careStates).map(([value,label])=>`<option value="${value}" ${item.state===value?"selected":""}>${label}</option>`).join("")}</select></label><label>排定日期（必填）<input class="care-control" data-field="dueDate" type="date" required value="${escapeHtml(item.dueDate||"")}"></label><label class="full">${correction?"原決議備註":"工作備註"}<textarea class="care-control" data-field="note" placeholder="儲存後同步到首頁工作排定">${escapeHtml(item.note||"")}</textarea></label>`;
  }
  function renewalCorrectionAction(item){return canManage&&record?.status==="final"&&isConfirmedNonRenewal(item)?`<div class="care-correction-action"><div><b>會員後來改為續約？</b><span>新增一筆更正，不會覆蓋原決議，也不會開啟整份月會編輯。</span></div><button type="button" data-amend-renewal="${escapeHtml(item.id)}">更正為繼續續約</button></div>`:""}
  async function handleCareControl(card,control){
    const item=record.care.items.find(value=>value.id===card.dataset.careId);if(!item)return;
    const index=record.care.items.indexOf(item),previous={...item},field=control.dataset.field;
    if(field==="disposition"){
      const disposition=control.value==="non_renewal"?"non_renewal":"follow_up";
      if(disposition==="non_renewal"&&!confirm(`確認在本次月會將「${item.title}」記錄為不續約？\n此項不再要求或建立新的工作排定；為避免誤刪紀錄，已存在的工作會保留供你另行確認。`)){control.value=previous.disposition||"follow_up";return}
      item.disposition=disposition;item.assignmentRequired=disposition!=="non_renewal";
      if(disposition==="non_renewal"){item.state="done";item.owner="";item.companion="";item.dueDate=""}
      else if(isConfirmedNonRenewal(previous)){
        item.state="pending";item.taskDeleted=false;item.syncMissing=false;
        const existing=loadTasks().find(task=>!isClosedTask(task)&&((item.taskId&&task.id===item.taskId)||FulianCaseDomain.sameTaskIdentity(task,item)));
        if(existing){item.owner=existing.lead||"";item.companion=existing.companions?.[0]||"";item.dueDate=String(existing.scheduledAt||"").slice(0,10);item.state="scheduled";item.taskId=existing.id;item.taskCreatedByMeeting=existing.source==="monthly-meeting"&&existing.sourceCareId===item.id}
      }
    }else{
      if(field==="companion"&&control.value===item.owner){control.value=item.companion||"";return toast("陪訪委員不能與追蹤委員相同")}
      if(field==="owner"&&control.value===item.companion)item.companion="";
      item[field]=control.value;
    }
    try{
      const synced=await syncCareTask(item);record.care.members=careMembersText(record.care.items);$("#careMembers").value=record.care.members;renderCareBoard(record.care.items);scheduleSave();
      if(field==="disposition"&&isConfirmedNonRenewal(item))toast(synced==="existing"?"已記錄不續約；既有工作仍保留待確認":"已記錄確認不續約，不需排定工作");
      else if(field==="disposition")toast("已恢復為需排定後續工作");
      else if(synced==="created")toast("已同步建立首頁工作排定");
    }catch(error){record.care.items[index]=previous;record.care.members=careMembersText(record.care.items);$("#careMembers").value=record.care.members;renderCareBoard(record.care.items);toast(error.message||"工作排定同步失敗")}
  }
  function renderCareBoard(items=[]){
    const board=$("#careVisualBoard"),config=FulianAuth.getConfig(),people=[config.vpName,...config.committee].filter(Boolean),groups=new Map();
    for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item)}
    board.innerHTML=items.length?[...groups].map(([category,rows],index)=>`<details class="care-group" ${index<2?"open":""}><summary><b>${escapeHtml(category)}</b><span>${rows.length} 項</span></summary><div class="care-card-grid">${rows.map(item=>`<article class="care-manage-card ${requiresCareAssignment(item)&&(!item.owner||!item.dueDate)?"missing-owner":""} ${item.taskDeleted&&requiresCareAssignment(item)?"deleted-schedule":""}" data-care-id="${escapeHtml(item.id)}" data-state="${escapeHtml(item.state)}" data-disposition="${escapeHtml(effectiveCareDisposition(item)||"")}"><div class="care-card-head"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></div><span class="care-state-badge">${escapeHtml(careStateLabel(item))}</span></div><p class="care-card-detail">${escapeHtml(item.detail)}</p><p class="care-card-action">${isConfirmedNonRenewal(item)?"會議決議：確認不續約":hasRenewalDecisionCorrection(item)?"結案後更正：恢復續約追蹤":`建議：${escapeHtml(item.action)}`}</p>${item.taskDeleted&&requiresCareAssignment(item)?`<div class="care-sync-warning"><div><b>原工作排程已刪除</b><span>月會紀錄與原分工仍保留；系統不會自動復活案件。</span></div>${canManage&&record.status!=="final"?`<button type="button" data-recreate-care="${escapeHtml(item.id)}">重新建立工作排程</button>`:""}</div>`:""}<div class="care-card-controls">${careAssignmentControls(item,people)}</div>${renewalCorrectionAction(item)}</article>`).join("")}</div></details>`).join(""):(record.care?.members?`<pre class="care-legacy-record">${escapeHtml(record.care.members)}</pre>`:`<div class="history-empty">目前沒有需要討論或排定的續約及輔導項目</div>`);
    renderCareSummary(items);
    board.querySelectorAll("[data-amend-renewal]").forEach(button=>button.onclick=()=>openRenewalCorrection(button.dataset.amendRenewal));
    if(!canManage||record.status==="final")return;
    board.querySelectorAll("[data-care-id]").forEach(card=>card.querySelectorAll(".care-control").forEach(control=>control.onchange=()=>handleCareControl(card,control)));
    board.querySelectorAll("[data-recreate-care]").forEach(button=>button.onclick=async()=>{const item=record.care.items.find(value=>value.id===button.dataset.recreateCare);if(!item)return;if(!confirm(`確認依原分工與日期，重新建立「${item.title}」的工作排程？`))return;button.disabled=true;try{item.taskDeleted=false;item.syncMissing=false;item.taskId="";const synced=await syncCareTask(item);record.care.members=careMembersText(record.care.items);scheduleSave();renderCareBoard(record.care.items);toast(synced==="created"?"已重新建立工作排程":"已連結現有工作排程")}catch(error){item.taskDeleted=true;item.syncMissing=true;button.disabled=false;toast(error.message||"重新建立工作排程失敗")}});
  }
  function newCorrectionId(){try{return`renewal-${crypto.randomUUID()}`}catch{return`renewal-${Date.now()}-${Math.random().toString(36).slice(2)}`}}
  function closeRenewalCorrection(){const dialog=$("#renewalCorrectionDialog");if(dialog?.open)dialog.close();renewalCorrectionRequest=null}
  function openRenewalCorrection(itemId){
    const item=record?.care?.items?.find(value=>value.id===itemId);if(!canManage||record?.status!=="final"||!isConfirmedNonRenewal(item))return toast("只有已結案且目前確認不續約的項目可以新增更正");
    const people=[FulianAuth.getConfig().vpName,...FulianAuth.getConfig().committee].filter(Boolean),existing=loadTasks().find(task=>!isClosedTask(task)&&((item.taskId&&task.id===item.taskId)||FulianCaseDomain.sameTaskIdentity(task,item))),owner=existing?.lead||"",companion=existing?.companions?.[0]||"",dueDate=String(existing?.scheduledAt||"").slice(0,10);
    renewalCorrectionRequest={meetingId:record.id,itemId:item.id,id:newCorrectionId()};
    $("#renewalCorrectionMember").textContent=item.title;$("#renewalCorrectionOwner").innerHTML=`<option value="">請選擇追蹤委員</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${owner===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}`;$("#renewalCorrectionCompanion").innerHTML=`<option value="">不指定陪訪</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${companion===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}`;$("#renewalCorrectionDueDate").value=dueDate;$("#renewalCorrectionReason").value="";$("#renewalCorrectionError").textContent="";$("#renewalCorrectionDialog").showModal();
  }
  async function submitRenewalCorrection(event){
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
    const request=renewalCorrectionRequest,item=record?.care?.items?.find(value=>value.id===request?.itemId);if(!request||record?.id!==request.meetingId||record?.status!=="final"||!isConfirmedNonRenewal(item))return closeRenewalCorrection();
    const owner=$("#renewalCorrectionOwner").value,companion=$("#renewalCorrectionCompanion").value,dueDate=$("#renewalCorrectionDueDate").value,reason=$("#renewalCorrectionReason").value.trim(),submit=$("#submitRenewalCorrection");
    if(owner===companion&&companion){$("#renewalCorrectionError").textContent="陪訪委員不能與追蹤委員相同";return}
    if(!confirm(`確認將「${item.title}」追加更正為繼續續約，並建立或更新工作排程？\n原本的「確認不續約」決議仍會完整保留。`))return;
    submit.disabled=true;$("#renewalCorrectionError").textContent="";
    try{
      const result=await api("POST",{identity,action:"amend-renewal-decision",meetingId:request.meetingId,careItemId:request.itemId,correction:{id:request.id,reason,owner,companion,dueDate}});record=result.record;const index=store.records.findIndex(value=>value.id===record.id);if(index>=0)store.records[index]=record;else store.records.push(record);
      let taskWarning=false;if(result.taskSyncRequired){const corrected=record.care?.items?.find(value=>value.id===request.itemId);try{if(corrected)await syncCareTask(corrected)}catch(error){taskWarning=true;console.error("更正後工作同步失敗",error)}}else await window.FulianTaskStore.refresh().catch(error=>console.error("更正後工作重新整理失敗",error));
      closeRenewalCorrection();renderRecord();renderHistory();$("#saveState").textContent="正式紀錄已追加更正";$("#saveMeta").textContent=`${session.name}・${new Date(record.updatedAt).toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}`;toast(taskWarning?"更正已保存；工作同步待重新整理確認":"已保留原決議並追加續約更正與工作排程");
    }catch(error){$("#renewalCorrectionError").textContent=error.message||"續約決議更正失敗"}
    finally{submit.disabled=false}
  }
  function collect(){
    const careItems=record.care?.items||[],careText=careItems.length?careMembersText(careItems):record.care?.members||"";
    return{...record,id:meetingId($("#meetingMonth").value),meetingMonth:$("#meetingMonth").value,meetingDate:$("#meetingDate").value,reportMonth:$("#reportMonth").value,recorder:$("#recorder").value,attendees:$$('#attendeeOptions input:checked').map(input=>input.value),attendance:{memberCount:Number($("#attendanceMemberCount").value)||0,absenceActual:Number($("#absenceActual").value)||0,absenceList:$("#absenceList").value.trim(),lateActual:Number($("#lateActual").value)||0,lateList:$("#lateList").value.trim(),proxyActual:Number($("#proxyActual").value)||0,proxyList:$("#proxyList").value.trim(),notes:$("#attendanceNotes").value.trim(),source:record.attendance?.source||"",periodStart:record.attendance?.periodStart||"",periodEnd:record.attendance?.periodEnd||""},growth:{chapterTarget:Number($("#chapterTarget").value)||51,chapterActual:Number(record.growth?.chapterActual)||0,lostCount:Number($("#lostCount").value)||0,applicationCount:Number($("#applicationCount").value)||0,growthCount:Number($("#growthCount").value)||0,approvedCount:Number($("#approvedCount").value)||0,conditionalCount:Number($("#conditionalCount").value)||0,pendingReviewCount:Number($("#pendingReviewCount").value)||0,notes:$("#growthNotes").value.trim()},care:{members:careText,items:careItems,actions:$("#careActions").value.trim()},memberAssistance:$("#memberAssistance").value.trim(),motions:$("#motions").value.trim(),conclusion:$("#conclusion").value.trim(),followUps:$("#followUps").value.trim()};
  }
  async function save(status=record.status||"draft",silent=false){
    if(!canManage)return toast("會員委員只能查閱歷史會議紀錄");
    record={...collect(),status};$("#saveState").textContent="正在儲存…";
    try{const result=await api("POST",{identity,record});record=result.record;const index=store.records.findIndex(item=>item.id===record.id);if(index>=0)store.records[index]=record;else store.records.push(record);$("#saveState").textContent=record.status==="final"?"正式紀錄已保存":"草稿已保存";$("#saveMeta").textContent=`${record.updatedBy?.split(":").slice(1).join(":")||session.name}・${new Date(record.updatedAt).toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}`;renderHistory();renderStatus();if(!silent)toast(record.status==="final"?"會議已結案並保存":"月會草稿已保存")}catch(error){$("#saveState").textContent="儲存失敗";$("#saveMeta").textContent=error.message;if(!silent)toast(error.message)}
  }
  function scheduleSave(){if(!canManage||record.status==="final")return;$("#saveState").textContent="編輯中…";clearTimeout(saveTimer);saveTimer=setTimeout(()=>save("draft",true),900);updateGap()}
  function renderAttendees(selected=[]){const config=FulianAuth.getConfig(),current=[config.vpName,...config.committee].filter(Boolean),currentSet=new Set(current),people=[...new Set([...current,...selected.filter(Boolean)])];$("#attendeeOptions").innerHTML=people.map(name=>`<label><input type="checkbox" value="${escapeHtml(name)}" ${selected.includes(name)?"checked":""}>${escapeHtml(name)}${currentSet.has(name)?"":"（歷史出席）"}</label>`).join("")}
  function setValue(id,value){const node=$("#"+id);if(node)node.value=value??""}
  function renderRecord(){
    setValue("meetingMonth",record.meetingMonth);setValue("meetingDate",record.meetingDate);setValue("reportMonth",record.reportMonth);setValue("recorder",record.recorder||session.name);renderAttendees(record.attendees||[]);
    setValue("attendanceMemberCount",record.attendance?.memberCount);setValue("absenceActual",record.attendance?.absenceActual);setValue("absenceList",record.attendance?.absenceList);setValue("lateActual",record.attendance?.lateActual);setValue("lateList",record.attendance?.lateList);setValue("proxyActual",record.attendance?.proxyActual);setValue("proxyList",record.attendance?.proxyList);setValue("attendanceNotes",record.attendance?.notes);
    $("#attendanceMeetingCount").textContent=record.attendance?.periodStart&&record.attendance?.periodEnd?`單月 PALMS 期間 ${record.attendance.periodStart} 至 ${record.attendance.periodEnd}`:"尚未載入正式 PALMS";$("#attendanceSource").textContent=record.attendance?.source||"正在讀取上月單月 PALMS";
    setValue("chapterTarget",record.growth?.chapterTarget);setValue("lostCount",record.growth?.lostCount);setValue("applicationCount",record.growth?.applicationCount);setValue("growthCount",record.growth?.growthCount);setValue("approvedCount",record.growth?.approvedCount);setValue("conditionalCount",record.growth?.conditionalCount);setValue("pendingReviewCount",record.growth?.pendingReviewCount);setValue("growthNotes",record.growth?.notes);
    setValue("careMembers",record.care?.members);renderCareBoard(record.care?.items||[]);setValue("careActions",record.care?.actions);setValue("memberAssistance",record.memberAssistance);setValue("motions",record.motions);setValue("conclusion",record.conclusion);setValue("followUps",record.followUps);updateGap();renderStatus();
  }
  function updateGap(){const target=Number($("#chapterTarget").value)||0,actual=Number(record.growth?.chapterActual)||0,gap=Math.max(0,target-actual);$("#chapterActualDisplay").textContent=actual;$("#chapterGap").textContent=gap;$("#chapterGapCard").classList.toggle("reached",gap===0)}
  function renderStatus(){
    const final=record.status==="final",readonly=final||!canManage;
    $("#recordStatus").textContent=!canManage?"歷史紀錄":final?"正式紀錄":"草稿";$("#recordStatus").style.background=readonly?"#e6f2eb":"#fff1d8";$("#recordStatus").style.color=readonly?"#257552":"#8c5f1e";
    $("#meetingForm").classList.toggle("readonly",readonly);$("#footerStatus").textContent=!canManage?"歷史會議紀錄・唯讀":final?"本次會議已結案保存":"草稿會自動保存";
    $("#finalizeMeeting").disabled=final||!canManage;$("#saveDraft").disabled=final||!canManage;$("#finalizeMeeting").textContent=final?"會議已結案":"完成會議並結案";
    $("#saveDraft").hidden=!canManage;$("#finalizeMeeting").hidden=!canManage;$("#newMeeting").hidden=!canManage;
    $$(".soft-button").forEach(button=>button.hidden=!canManage);
    editableIds.forEach(id=>{const node=$("#"+id);if(node)node.disabled=!canManage});
    $$("#attendeeOptions input").forEach(input=>input.disabled=!canManage);
    $$(".care-control").forEach(input=>input.disabled=readonly);
  }
  function renderHistory(){const records=[...store.records].sort((a,b)=>String(b.meetingDate||"").localeCompare(String(a.meetingDate||"")));$("#historyList").innerHTML=records.length?records.map(item=>`<button type="button" class="history-item ${record?.id===item.id?"active":""}" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.meetingMonth.replace("-"," 年 "))} 月會</strong><small>${escapeHtml(item.meetingDate||"日期未設定")}・${escapeHtml(item.updatedBy?.split(":").slice(1).join(":")||"")}</small><em class="${item.status==="final"?"final":""}">${item.status==="final"?"已結案":"草稿"}</em></button>`).join(""):`<div class="history-empty">目前還沒有月會紀錄</div>`;$$(".history-item").forEach(button=>button.onclick=()=>{record=structuredClone(store.records.find(item=>item.id===button.dataset.id));renderRecord();renderHistory()})}
  async function applyAttendance(){
    if(!canManage)return;
    try{const attendance=await attendanceContext($("#reportMonth").value);record={...collect(),attendance:{...record.attendance,...attendance}};renderRecord();scheduleSave();toast(`已載入 ${$("#reportMonth").value} BNI Connect PALMS`)}
    catch(error){record={...collect(),attendance:{...record.attendance,source:error.message}};renderRecord();toast(error.message)}
  }
  function applyCaseContext(){if(!canManage)return;const context=caseContext($("#reportMonth").value),items=dashboardCareItems(context,record.care?.items);record={...collect(),growth:{...record.growth,...context,chapterActual:snapshot?.summary?.totalMembers||record.growth.chapterActual||0},care:{...record.care,items,members:careMembersText(items)}};renderRecord();scheduleSave();toast("已更新會員關懷儀表板與進行中案件")}
  async function saveTarget(){if(!canManage)return;try{const result=await api("POST",{identity,action:"settings",chapterSizeTarget:Number($("#chapterTarget").value)||51});store.settings=result.settings}catch(error){toast(error.message)}}
  function paragraph(text,bold=false){return new docx.Paragraph({children:[new docx.TextRun({text:String(text||""),bold})],spacing:{after:120}})}
  function wordTable(rows){const{Table,TableRow,TableCell,WidthType}=docx;return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map(row=>new TableRow({children:row.map((cell,index)=>new TableCell({children:[paragraph(cell,index===0)],width:{size:index===0?25:75,type:WidthType.PERCENTAGE}}))}))})}
  async function downloadWord(){
    if(typeof docx==="undefined")return toast("Word 元件尚未載入，請重新整理後再試");const exportRecord=record.status==="final"?structuredClone(record):collect(),{Document,Packer,Paragraph,TextRun,AlignmentType,PageOrientation}=docx,date=exportRecord.meetingDate.replaceAll("-","");
    const title=new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:"富聯分會 會員委員會月會紀錄",bold:true,size:34})],spacing:{after:260}});
    const corrections=renewalCorrectionsText(exportRecord.care?.items||[]),children=[title,wordTable([["會議日期",exportRecord.meetingDate],["報告月份",exportRecord.reportMonth],["會議紀錄人",exportRecord.recorder],["出席委員",exportRecord.attendees.join("、")||"未填寫"]]),paragraph("一、上個月會員出席狀況報告",true),wordTable([["會員數",`${exportRecord.attendance.memberCount} 位`],["正式資料來源",exportRecord.attendance.source||"未載入 PALMS"],["缺席",`目標 0／實際 ${exportRecord.attendance.absenceActual}\n${exportRecord.attendance.absenceList||"無"}`],["遲到／早退",`目標 0／實際 ${exportRecord.attendance.lateActual}\n${exportRecord.attendance.lateList||"無"}`],["代理人",`目標 0／實際 ${exportRecord.attendance.proxyActual}\n${exportRecord.attendance.proxyList||"無"}`],["討論與行動",exportRecord.attendance.notes||"無"]]),paragraph("二、分會成長及留員狀況",true),wordTable([["分會規模",`目標 ${exportRecord.growth.chapterTarget} 人／實際 ${exportRecord.growth.chapterActual} 人`],["會籍狀況",`流失 ${exportRecord.growth.lostCount}／申請 ${exportRecord.growth.applicationCount}／會員成長 ${exportRecord.growth.growthCount}`],["審查狀況",`通過 ${exportRecord.growth.approvedCount}／有條件通過 ${exportRecord.growth.conditionalCount}／待審查 ${exportRecord.growth.pendingReviewCount}`],["討論紀錄",exportRecord.growth.notes||"無"]]),paragraph("三、續約及需要輔導的會員",true),paragraph(exportRecord.care.members||"無"),paragraph(`討論結論、負責人與期限：\n${exportRecord.care.actions||"無"}`),...(corrections?[paragraph("三之一、結案後續約決議更正",true),paragraph(corrections)]:[]),paragraph("四、目前是否有聽到任何會員有需要協助的地方呢？",true),paragraph(exportRecord.memberAssistance||"無"),paragraph("五、臨時動議",true),paragraph(exportRecord.motions||"無"),paragraph("會議結論與下次追蹤",true),wordTable([["本次決議摘要",exportRecord.conclusion||"無"],["下次會議前需完成事項",exportRecord.followUps||"無"]])];
    const documentFile=new Document({styles:{default:{document:{run:{font:{ascii:"Arial Unicode MS",hAnsi:"Arial Unicode MS",eastAsia:"Arial Unicode MS"},size:22},paragraph:{spacing:{line:320}}}}},sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:700,right:700,bottom:700,left:700}}},children}]});
    const blob=await Packer.toBlob(documentFile),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`富聯分會-會員委員會月會紀錄-${date}.docx`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500);toast("Word 會議紀錄已下載")
  }
  function bind(){
    $("#downloadWord").onclick=downloadWord;
    if(!canManage)return;
    $("#renewalCorrectionForm").onsubmit=submitRenewalCorrection;$("#cancelRenewalCorrection").onclick=closeRenewalCorrection;$("#cancelRenewalCorrectionFooter").onclick=closeRenewalCorrection;$("#renewalCorrectionDialog").addEventListener("close",()=>renewalCorrectionRequest=null);
    editableIds.forEach(id=>{const node=$("#"+id);node?.addEventListener("input",scheduleSave);node?.addEventListener("change",scheduleSave)});
    $("#attendeeOptions").addEventListener("change",scheduleSave);
    $("#meetingMonth").addEventListener("change",async()=>{const month=$("#meetingMonth").value,existing=store.records.find(item=>item.id===meetingId(month));record=existing?structuredClone(existing):emptyRecord(month);renderRecord();renderHistory();if(!existing){await applyAttendance();applyCaseContext()}});
    $("#meetingDate").addEventListener("change",()=>{const month=$("#meetingMonth").value;record.meetingDate=$("#meetingDate").value;record.reportMonth=previousMonth(month);$("#reportMonth").value=record.reportMonth});
    $("#chapterTarget").addEventListener("change",saveTarget);$("#refreshAttendance").onclick=applyAttendance;$("#refreshCare").onclick=applyCaseContext;$("#saveDraft").onclick=()=>save("draft");
    $("#finalizeMeeting").onclick=async()=>{const missing=missingCareAssignments(record.care?.items||[]);if(missing.length){toast(`尚有 ${missing.length} 項未完成追蹤委員或排定日期，無法結案`);document.querySelector(".care-manage-card.missing-owner")?.scrollIntoView({behavior:"smooth",block:"center"});return}if(!confirm("確認完成本次會員委員會月會並保存為正式紀錄嗎？結案後將改為唯讀。"))return;try{await Promise.all((record.care?.items||[]).map(syncCareTask));await save("final")}catch(error){toast(error.message||"工作排定同步失敗，月會尚未結案")}};
    $("#newMeeting").onclick=async()=>{const value=prompt("請輸入會議月份（YYYY-MM）",currentMonth());if(!/^\d{4}-\d{2}$/.test(value||""))return;const existing=store.records.find(item=>item.id===meetingId(value));record=existing?structuredClone(existing):emptyRecord(value);renderRecord();renderHistory();if(!existing){await applyAttendance();applyCaseContext()}};
  }
  async function init(){
    try{
      await window.FulianTaskStore.ready;
      await Promise.all([loadBni(),api().then(data=>store=data)]);
      let reconciliationError=null;
      if(canManage){
        try{
          const reconciliation=await api("POST",{identity,action:"reconcile-care-tasks"});
          if(reconciliation.repaired||reconciliation.relinked||reconciliation.unlinked){await window.FulianTaskStore.refresh();store=await api()}
        }catch(error){reconciliationError=error;console.error("月會工作排程對帳失敗",error)}
      }
      if(!canManage){
        document.body.classList.add("committee-history-mode");$("#accessNotice").hidden=false;
        record=store.records.length?structuredClone(store.records[0]):null;renderHistory();bind();
        if(!record){$("#meetingForm").hidden=true;$("#saveState").textContent="目前沒有歷史會議紀錄";$("#saveMeta").textContent="副主席完成月會結案後，紀錄會顯示在這裡";return}
        renderRecord();$("#saveState").textContent="歷史紀錄已載入";$("#saveMeta").textContent=record.updatedAt?new Date(record.updatedAt).toLocaleString("zh-TW"):"已結案";return;
      }
      const month=currentMonth(),existing=store.records.find(item=>item.id===meetingId(month));record=existing?structuredClone(existing):emptyRecord(month);
      const oldSource=String(record.attendance?.source||""),legacyCleared=record.status!=="final"&&/Google 點名表|例會點名|點名歷史|半年 PALMS|data\/baseline\/palms\.xls/.test(oldSource);if(legacyCleared)record.attendance={...emptyRecord(month).attendance,notes:record.attendance?.notes||""};
      const context=caseContext(record.reportMonth),careItems=dashboardCareItems(context,record.care?.items),careMembers=careMembersText(careItems),careChanged=record.status!=="final"&&JSON.stringify(record.care?.items||[])!==JSON.stringify(careItems);
      if(!existing){record.growth.chapterActual=snapshot?.summary?.totalMembers||0;record.growth={...record.growth,...context,chapterActual:snapshot?.summary?.totalMembers||0}}
      if(record.status!=="final")record.care={...record.care,items:careItems,members:careMembers};
      if(record.status!=="final")try{record.attendance={...record.attendance,...await attendanceContext(record.reportMonth)}}catch(error){record.attendance.source=error.message}
      renderRecord();renderHistory();bind();$("#saveState").textContent=existing?(record.status==="final"?"正式紀錄已保存":"草稿已載入"):"新月份草稿";$("#saveMeta").textContent=reconciliationError?"月會紀錄已載入；部分工作排程同步待檢查":existing&&record.updatedAt?new Date(record.updatedAt).toLocaleString("zh-TW"):"開始填寫後自動保存";if(reconciliationError)toast("月會紀錄已載入，部分工作排程同步待檢查");if(existing&&(legacyCleared||careChanged))await save("draft",true);
    }catch(error){$("#saveState").textContent="月會功能無法載入";$("#saveMeta").textContent=error.message;toast(error.message)}
  }
  init();
})();
