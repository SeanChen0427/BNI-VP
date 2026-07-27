(function(){
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const session=FulianAuth.getSession(),identity=`${session.role}:${session.name}`,canManage=["vp","admin"].includes(session.role),TASK_KEY=FulianCaseDomain.TASK_STORAGE_KEY;
  const {isNewMemberReview,requiresCareAssignment,missingCareAssignments}=FulianMonthlyMeetingDomain;
  const editableIds=["meetingMonth","meetingDate","reportMonth","recorder","attendanceMemberCount","absenceActual","absenceList","lateActual","lateList","proxyActual","proxyList","attendanceNotes","chapterTarget","lostCount","applicationCount","growthCount","approvedCount","conditionalCount","pendingReviewCount","growthNotes","careActions","memberAssistance","motions","conclusion","followUps"];
  let store={settings:{chapterSizeTarget:51},records:[]},record=null,saveTimer=null,snapshot=null;
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
    const newCases=tasks.filter(task=>task.type==="new"),approved=newCases.filter(task=>{const state=workflow(task),votes=Object.values(state.votes||{});return isClosedTask(task)&&inMonth(task.completedAt,month)&&votes.filter(v=>v==="approve").length>votes.filter(v=>v==="reject").length});
    const pending=newCases.filter(task=>!isClosedTask(task));
    const care=tasks.filter(task=>!isClosedTask(task)&&["renewal","midterm","special"].includes(task.type)).map(task=>({id:task.id,member:task.member,taskType:task.type,type:task.type==="renewal"?"續約／終期輔導":task.type==="midterm"?"期中輔導":"特定關懷",stage:task.stage||"待處理",lead:task.lead||"",companion:task.companions?.[0]||"",scheduledAt:task.scheduledAt||"",notes:task.notes||"",source:task.source||""}));
    return{lostCount:departures.length,applicationCount:applications.length,growthCount:approved.length-departures.length,approvedCount:approved.length,conditionalCount:0,pendingReviewCount:pending.length,taskCareMembers:care,taskIds:tasks.map(task=>task.id),completedTaskIds:tasks.filter(isClosedTask).map(task=>task.id)};
  }
  async function loadBni(){try{const response=await fetch("/api/bni-analysis",{cache:"no-store"});if(response.ok)snapshot=await response.json()}catch{}}
  const careStates={pending:"待討論",scheduled:"已排定",active:"追蹤中",done:"已完成"};
  function careId(category,title){return`${category}-${title}`.replace(/\s+/g,"").replace(/[^\p{Letter}\p{Number}\-↔／]/gu,"").slice(0,100)}
  function memberFromCard(card){return String(card?.title||"").trim().split(/[｜|\s]/)[0]}
  function daysUntil(value){const target=new Date(`${value}T00:00:00`),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Number.isNaN(target.getTime())?null:Math.ceil((target-today)/86400000)}
  function dashboardCareItems(context=caseContext($("#reportMonth")?.value||previousMonth(currentMonth())),existing=[]){
    const items=[],section=title=>snapshot?.sections?.find(item=>item.title.includes(title)),push=(category,title,detail,action,defaults={})=>items.push({id:careId(category,title),category,title,detail,action,state:"pending",owner:"",companion:"",dueDate:"",note:"",assignmentRequired:true,...defaults});
    const renewal=section("續約雷達")?.tables?.[0];
    for(const row of renewal?.rows||[]){const remaining=daysUntil(row[2]);if(remaining!==null&&remaining<=30)push("續約追蹤",row[0],`燈號 ${row[1]}｜續約截止 ${row[2]}｜${remaining<0?`已逾期 ${Math.abs(remaining)} 天`:`剩餘 ${remaining} 天`}｜${row[4]}`,row[5],{member:row[0],taskType:"renewal"})}
    const cards=(title,label,taskType)=>{for(const card of section(title)?.cards||[]){if(isNewMemberReview(card))continue;push(label,card.title,card.detail,card.action,{member:memberFromCard(card),taskType})}};
    cards("燈號關懷","需輔導會員","special");
    cards("期中關懷到點","期中關懷到點","midterm");
    for(const task of context.taskCareMembers||[]){
      const matched=items.find(item=>item.member===task.member&&item.taskType===task.taskType);
      const assignment={taskId:task.id,member:task.member,taskType:task.taskType,state:"scheduled",owner:task.lead,companion:task.companion,dueDate:String(task.scheduledAt).slice(0,10),note:task.notes,taskCreatedByMeeting:task.source==="monthly-meeting"};
      if(matched)Object.assign(matched,assignment);
      else push("已排定關懷案件",task.member,`${task.type}｜${task.stage}`,task.lead?`已由 ${task.lead} 負責`:"尚未指派負責人",assignment);
    }
    const previous=new Map((existing||[]).map(item=>[item.id,item])),liveTaskIds=new Set(context.taskIds||[]),completedTaskIds=new Set(context.completedTaskIds||[]);
    return items.map(item=>{
      const saved=previous.get(item.id);if(!saved)return item;
      if(item.taskId)return{...item,state:completedTaskIds.has(item.taskId)?"done":item.state};
      const savedTaskExists=saved.taskId&&liveTaskIds.has(saved.taskId);
      const staleSchedule=saved.taskId&&!savedTaskExists&&["scheduled","active"].includes(saved.state);
      return{...item,state:staleSchedule?"pending":completedTaskIds.has(saved.taskId)?"done":saved.state||item.state,owner:saved.owner||item.owner,companion:saved.companion||item.companion,dueDate:saved.dueDate||item.dueDate,note:saved.note||item.note||"",taskId:savedTaskExists?saved.taskId:"",taskCreatedByMeeting:savedTaskExists&&Boolean(saved.taskCreatedByMeeting),syncMissing:Boolean(staleSchedule)};
    });
  }
  function careMembersText(items=[]){
    if(!items.length)return"目前會員關懷儀表板與進行中案件均無待討論名單。";
    const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);const management=[careStates[item.state]||"待討論",item.owner&&`負責：${item.owner}`,item.companion&&`陪訪：${item.companion}`,item.dueDate&&`排定：${item.dueDate}`,item.note&&`紀錄：${item.note}`].filter(Boolean).join("｜");groups.get(item.category).push(`${item.title}｜${item.detail}｜建議：${item.action}｜處理：${management}`)}
    return[...groups].map(([category,rows])=>`【${category}】\n${rows.join("\n")}`).join("\n\n");
  }
  function renderCareSummary(items=[]){
    const actionable=items.filter(requiresCareAssignment),pending=actionable.filter(item=>item.state==="pending").length,active=actionable.filter(item=>["scheduled","active"].includes(item.state)).length,done=actionable.filter(item=>item.state==="done").length,percent=actionable.length?Math.round(done/actionable.length*100):0;
    $("#carePendingCount").textContent=pending;$("#careActiveCount").textContent=active;$("#careDoneCount").textContent=done;$("#careProgressBar").style.width=`${percent}%`;$("#careProgressText").textContent=`${percent}%`;
  }
  async function syncCareTask(item){
    if(!canManage||!requiresCareAssignment(item)||!item.member||!item.taskType)return null;
    let tasks=loadTasks(),existing=tasks.find(task=>task.id===item.taskId)||tasks.find(task=>!isClosedTask(task)&&task.member===item.member&&task.type===item.taskType);
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
  function renderCareBoard(items=[]){
    const board=$("#careVisualBoard"),config=FulianAuth.getConfig(),people=[config.vpName,...config.committee].filter(Boolean),groups=new Map();
    for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item)}
    board.innerHTML=items.length?[...groups].map(([category,rows],index)=>`<details class="care-group" ${index<2?"open":""}><summary><b>${escapeHtml(category)}</b><span>${rows.length} 項</span></summary><div class="care-card-grid">${rows.map(item=>`<article class="care-manage-card ${item.owner&&item.dueDate?"":"missing-owner"}" data-care-id="${escapeHtml(item.id)}" data-state="${escapeHtml(item.state)}"><div class="care-card-head"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></div><span class="care-state-badge">${escapeHtml(careStates[item.state]||"待討論")}</span></div><p class="care-card-detail">${escapeHtml(item.detail)}</p><p class="care-card-action">建議：${escapeHtml(item.action)}</p><div class="care-card-controls"><label>追蹤委員（必填）<select class="care-control" data-field="owner" required><option value="">請選擇追蹤委員</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${item.owner===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}</select></label><label>陪訪委員（選填）<select class="care-control" data-field="companion"><option value="">不指定陪訪</option>${people.map(name=>`<option value="${escapeHtml(name)}" ${item.companion===name?"selected":""}>${escapeHtml(name)}</option>`).join("")}</select></label><label>處理狀態<select class="care-control" data-field="state">${Object.entries(careStates).map(([value,label])=>`<option value="${value}" ${item.state===value?"selected":""}>${label}</option>`).join("")}</select></label><label>排定日期（必填）<input class="care-control" data-field="dueDate" type="date" required value="${escapeHtml(item.dueDate||"")}"></label><label class="full">工作備註<textarea class="care-control" data-field="note" placeholder="儲存後同步到首頁工作排定">${escapeHtml(item.note||"")}</textarea></label></div></article>`).join("")}</div></details>`).join(""):(record.care?.members?`<pre class="care-legacy-record">${escapeHtml(record.care.members)}</pre>`:`<div class="history-empty">目前沒有需要討論或排定的續約及輔導項目</div>`);
    renderCareSummary(items);
    if(!canManage||record.status==="final")return;
    board.querySelectorAll("[data-care-id]").forEach(card=>card.querySelectorAll(".care-control").forEach(control=>control.onchange=async()=>{const item=record.care.items.find(value=>value.id===card.dataset.careId);if(!item)return;if(control.dataset.field==="companion"&&control.value===item.owner){control.value="";return toast("陪訪委員不能與追蹤委員相同")}if(control.dataset.field==="owner"&&control.value===item.companion){item.companion="";card.querySelector('[data-field="companion"]').value=""}item[control.dataset.field]=control.value;try{const synced=await syncCareTask(item);record.care.members=careMembersText(record.care.items);$("#careMembers").value=record.care.members;card.dataset.state=item.state;card.classList.toggle("missing-owner",!item.owner||!item.dueDate);card.querySelector(".care-state-badge").textContent=careStates[item.state];renderCareSummary(record.care.items);scheduleSave();if(synced==="created")toast("已同步建立首頁工作排定")}catch(error){toast(error.message||"工作排定同步失敗")}}));
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
  function renderAttendees(selected=[]){const config=FulianAuth.getConfig(),people=[config.vpName,...config.committee].filter(Boolean);$("#attendeeOptions").innerHTML=people.map(name=>`<label><input type="checkbox" value="${escapeHtml(name)}" ${selected.includes(name)?"checked":""}>${escapeHtml(name)}</label>`).join("")}
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
    if(typeof docx==="undefined")return toast("Word 元件尚未載入，請重新整理後再試");record=collect();const{Document,Packer,Paragraph,TextRun,AlignmentType,PageOrientation}=docx,date=record.meetingDate.replaceAll("-","");
    const title=new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:"富聯分會 會員委員會月會紀錄",bold:true,size:34})],spacing:{after:260}});
    const children=[title,wordTable([["會議日期",record.meetingDate],["報告月份",record.reportMonth],["會議紀錄人",record.recorder],["出席委員",record.attendees.join("、")||"未填寫"]]),paragraph("一、上個月會員出席狀況報告",true),wordTable([["會員數",`${record.attendance.memberCount} 位`],["正式資料來源",record.attendance.source||"未載入 PALMS"],["缺席",`目標 0／實際 ${record.attendance.absenceActual}\n${record.attendance.absenceList||"無"}`],["遲到／早退",`目標 0／實際 ${record.attendance.lateActual}\n${record.attendance.lateList||"無"}`],["代理人",`目標 0／實際 ${record.attendance.proxyActual}\n${record.attendance.proxyList||"無"}`],["討論與行動",record.attendance.notes||"無"]]),paragraph("二、分會成長及留員狀況",true),wordTable([["分會規模",`目標 ${record.growth.chapterTarget} 人／實際 ${record.growth.chapterActual} 人`],["會籍狀況",`流失 ${record.growth.lostCount}／申請 ${record.growth.applicationCount}／會員成長 ${record.growth.growthCount}`],["審查狀況",`通過 ${record.growth.approvedCount}／有條件通過 ${record.growth.conditionalCount}／待審查 ${record.growth.pendingReviewCount}`],["討論紀錄",record.growth.notes||"無"]]),paragraph("三、續約及需要輔導的會員",true),paragraph(record.care.members||"無"),paragraph(`討論結論、負責人與期限：\n${record.care.actions||"無"}`),paragraph("四、目前是否有聽到任何會員有需要協助的地方呢？",true),paragraph(record.memberAssistance||"無"),paragraph("五、臨時動議",true),paragraph(record.motions||"無"),paragraph("會議結論與下次追蹤",true),wordTable([["本次決議摘要",record.conclusion||"無"],["下次會議前需完成事項",record.followUps||"無"]])];
    const documentFile=new Document({styles:{default:{document:{run:{font:{ascii:"Arial Unicode MS",hAnsi:"Arial Unicode MS",eastAsia:"Arial Unicode MS"},size:22},paragraph:{spacing:{line:320}}}}},sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:700,right:700,bottom:700,left:700}}},children}]});
    const blob=await Packer.toBlob(documentFile),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`富聯分會-會員委員會月會紀錄-${date}.docx`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500);toast("Word 會議紀錄已下載")
  }
  function bind(){
    $("#downloadWord").onclick=downloadWord;
    if(!canManage)return;
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
      if(canManage){
        const reconciliation=await api("POST",{identity,action:"reconcile-care-tasks"});
        if(reconciliation.repaired||reconciliation.relinked)await window.FulianTaskStore.refresh();
      }
      await Promise.all([loadBni(),api().then(data=>store=data)]);
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
      renderRecord();renderHistory();bind();$("#saveState").textContent=existing?(record.status==="final"?"正式紀錄已保存":"草稿已載入"):"新月份草稿";$("#saveMeta").textContent=existing&&record.updatedAt?new Date(record.updatedAt).toLocaleString("zh-TW"):"開始填寫後自動保存";if(existing&&(legacyCleared||careChanged))await save("draft",true);
    }catch(error){$("#saveState").textContent="月會功能無法載入";$("#saveMeta").textContent=error.message;toast(error.message)}
  }
  init();
})();
