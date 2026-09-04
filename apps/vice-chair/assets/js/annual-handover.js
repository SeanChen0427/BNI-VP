(async function(){
  const session=FulianAuth.getSession();
  if(session?.role!=="admin")return;
  const domain=window.FulianAnnualHandoverDomain,$=selector=>document.querySelector(selector);
  const card=$("#annualHandoverCard"),status=$("#handoverStatus"),impactBox=$("#handoverImpact"),scheduledBox=$("#handoverScheduled");
  let state={today:"",currentRoster:[],activeMembers:[],plan:null,impact:null,history:[]};
  let proposedVpId="",proposedCommitteeIds=[],preview=null,busy=false;
  card.hidden=false;

  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const roleLabel=role=>role==="vp"?"副主席":"會員委員";
  const memberById=id=>state.activeMembers.find(member=>member.personId===id)||null;
  function duplicateNames(){
    const counts=new Map();
    state.activeMembers.forEach(member=>counts.set(member.name,(counts.get(member.name)||0)+1));
    return counts;
  }
  function memberLabel(member){
    if(!member)return"";
    return duplicateNames().get(member.name)>1?`${member.name}｜${member.profession||member.personId.slice(0,8)}`:member.name;
  }
  function findMember(value){
    const normalized=String(value||"").trim();
    const exact=state.activeMembers.filter(member=>memberLabel(member)===normalized);
    if(exact.length===1)return exact[0];
    const byName=state.activeMembers.filter(member=>member.name===normalized);
    return byName.length===1?byName[0]:null;
  }
  function proposedRoster(){
    const vp=memberById(proposedVpId);
    return [vp&&{personId:vp.personId,name:vp.name,role:"vp"},...proposedCommitteeIds.map(memberById).filter(Boolean).map(member=>({personId:member.personId,name:member.name,role:"committee"}))].filter(Boolean);
  }
  function setProposal(roster){
    proposedVpId=roster.find(item=>item.role==="vp")?.personId||"";
    proposedCommitteeIds=[...new Set(roster.filter(item=>item.role==="committee").map(item=>item.personId))].filter(id=>id!==proposedVpId);
    $("#handoverVpName").value=memberLabel(memberById(proposedVpId));
    renderRoster();
    markDirty();
  }
  function setBusy(value){
    busy=value;
    ["addHandoverCommittee","copyCurrentRoster","previewHandover","saveHandover","cancelHandover"].forEach(id=>{const button=$("#"+id);if(button)button.disabled=value});
  }
  function showStatus(title,message,type="ready"){
    status.dataset.state=type;
    status.innerHTML=`<b>${escapeHtml(title)}</b><span>${escapeHtml(message)}</span>`;
  }
  function markDirty(){
    preview=null;
    impactBox.hidden=true;
    if(state.plan)showStatus("已有換屆排程","修改名單或日期後，請重新預覽再儲存。","scheduled");
  }
  function rosterChange(entry){
    const current=state.currentRoster.find(item=>item.personId===entry.personId);
    if(!current)return{label:"新任",kind:"incoming"};
    if(current.role!==entry.role)return{label:"轉任",kind:"role"};
    return{label:"留任",kind:"retained"};
  }
  function renderRoster(){
    const roster=proposedRoster();
    $("#handoverRoster").innerHTML=roster.length?roster.map(entry=>{
      const change=rosterChange(entry),canRemove=entry.role!=="vp";
      return`<article class="handover-person"><i>${entry.role==="vp"?"VP":escapeHtml(entry.name.slice(-1))}</i><div><b>${escapeHtml(entry.name)}</b><small>${roleLabel(entry.role)}</small></div><em data-change="${change.kind}">${change.label}</em>${canRemove?`<button type="button" data-remove-handover="${escapeHtml(entry.personId)}" aria-label="移除 ${escapeHtml(entry.name)}">×</button>`:""}</article>`;
    }).join(""):`<div class="hint">尚未建立下一屆名單。</div>`;
    document.querySelectorAll("[data-remove-handover]").forEach(button=>button.onclick=()=>{
      proposedCommitteeIds=proposedCommitteeIds.filter(id=>id!==button.dataset.removeHandover);
      renderRoster();markDirty();
    });
  }
  function renderImpact(data){
    preview=data;
    const roleChanges=data.roleChanges||[],outgoing=data.outgoing||[],incoming=data.incoming||[],tasks=data.impactedTasks||[];
    const changedPeople=[
      ...outgoing.map(item=>`${item.name}（卸任）`),
      ...roleChanges.map(item=>`${item.name}（${roleLabel(item.fromRole)}轉${roleLabel(item.toRole)}）`)
    ];
    impactBox.hidden=false;
    impactBox.innerHTML=`<h3>${escapeHtml(data.effectiveOn)} 生效影響</h3><div class="handover-impact-summary"><div><b>${data.retained?.length||0}</b><span>原角色留任</span></div><div><b>${roleChanges.length}</b><span>轉任</span></div><div><b>${outgoing.length}</b><span>卸任</span></div><div><b>${tasks.length}</b><span>待重新指派工作</span></div></div>${changedPeople.length?`<ul class="handover-impact-list"><li><b>需交接：${changedPeople.map(escapeHtml).join("、")}</b><span>生效前仍保有原權限；生效後未完成工作會保留原指派並標記待處理。</span></li>${tasks.map(task=>`<li><b>${escapeHtml(task.member)}・${escapeHtml(task.id)}</b><span>原指派：${(task.assignments||[]).map(item=>escapeHtml(item.name)).join("、")||"未記錄"}</span></li>`).join("")}</ul>`:`<div class="handover-impact-warning">沒有卸任或轉任人員，因此未完成工作不會進入待指派。</div>`}${(data.activeDecisionTasks||[]).length?`<div class="handover-impact-warning"><b>其中 ${data.activeDecisionTasks.length} 件已進入回饋／投票／董顧流程。</b> 生效時只標記待指派，不改寫當時的回饋人與投票資格快照。</div>`:""}${incoming.length||roleChanges.length?`<div class="handover-impact-warning">新任／轉任：${[...incoming.map(item=>item.name),...roleChanges.map(item=>item.name)].map(escapeHtml).join("、")}</div>`:""}`;
    showStatus("影響預覽完成",`確認後可排定 ${data.effectiveOn} 自動生效；現在仍未變更任何正式資料。`,"ready");
  }
  function renderScheduled(){
    const plan=state.plan;
    scheduledBox.hidden=!plan;
    if(!plan)return;
    scheduledBox.querySelector("div").innerHTML=`<b>已排定 ${escapeHtml(plan.effectiveOn)} 自動換屆</b><span>下一屆任期至 ${escapeHtml(plan.termEndsOn)}・副主席 ${escapeHtml(plan.roster.find(item=>item.role==="vp")?.name||"—")}・委員 ${plan.roster.filter(item=>item.role==="committee").length} 人</span>`;
    showStatus("排程尚未生效",`目前正式名單與案件都未更動；生效前可修改或取消。版本 ${plan.revision}`,"scheduled");
  }
  function renderMemberOptions(){
    const options=state.activeMembers.map(member=>`<option value="${escapeHtml(memberLabel(member))}">${escapeHtml(member.profession||"")}</option>`).join("");
    $("#handoverVpOptions").innerHTML=options;
    $("#handoverCommitteeOptions").innerHTML=options;
  }
  function applyState(nextState,{resetProposal=true}={}){
    state=nextState;
    renderMemberOptions();
    window.dispatchEvent(new CustomEvent("fulian:roster-updated",{detail:{roster:state.currentRoster}}));
    if(resetProposal){
      const source=state.plan?.roster?.length?state.plan.roster:state.currentRoster;
      proposedVpId=source.find(item=>item.role==="vp")?.personId||"";
      proposedCommitteeIds=source.filter(item=>item.role==="committee").map(item=>item.personId);
      $("#handoverVpName").value=memberLabel(memberById(proposedVpId));
      $("#handoverEffectiveOn").value=state.plan?.effectiveOn||domain.nextOctoberFirst(state.today);
      $("#handoverTermEndsOn").value=domain.termEndsOn($("#handoverEffectiveOn").value);
    }
    renderRoster();renderScheduled();
    if(state.impact)renderImpact({effectiveOn:state.plan.effectiveOn,termEndsOn:state.plan.termEndsOn,roster:state.plan.roster,...state.impact});
    if(state.planIssues?.length)showStatus("排程需要修正",state.planIssues.join("、"),"error");
  }
  async function api(method="GET",payload=null){
    const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
    if(payload)options.body=JSON.stringify(payload);
    const response=await fetch("/api/annual-handover",options),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||"年度換屆服務無法使用");
    return data;
  }
  async function load(){
    setBusy(true);showStatus("正在讀取正式資料","不會修改目前名單或案件。","");
    try{applyState(await api());}
    catch(error){showStatus("讀取失敗",error.message||"年度換屆服務無法使用","error")}
    finally{setBusy(false)}
  }
  function validPayload(){
    const selected=findMember($("#handoverVpName").value);
    if(!selected)throw new Error("請從正式會員名單選擇下一屆副主席");
    proposedVpId=selected.personId;
    proposedCommitteeIds=proposedCommitteeIds.filter(id=>id!==proposedVpId);
    const effectiveOn=$("#handoverEffectiveOn").value,validation=domain.validateRoster(proposedRoster());
    if(!domain.isoDateParts(effectiveOn)||effectiveOn<=state.today)throw new Error("自動生效日必須晚於今天");
    if(!validation.valid)throw new Error(validation.errors[0]);
    renderRoster();
    return{effectiveOn,roster:validation.roster};
  }
  async function previewFlow(){
    try{
      const payload=validPayload();setBusy(true);showStatus("正在計算影響","只進行預覽，不會更動正式資料。","");
      const result=await api("POST",{action:"preview",...payload});renderImpact(result.preview);
    }catch(error){showStatus("無法預覽",error.message,"error")}
    finally{setBusy(false)}
  }
  async function saveFlow(){
    try{
      const payload=validPayload();
      if(!preview||preview.effectiveOn!==payload.effectiveOn||JSON.stringify(preview.roster)!==JSON.stringify(payload.roster))throw new Error("名單或日期有異動，請先重新預覽影響");
      const vp=payload.roster.find(item=>item.role==="vp")?.name,committeeCount=payload.roster.filter(item=>item.role==="committee").length;
      if(!confirm(`排定 ${payload.effectiveOn} 自動換屆？\n\n下一屆副主席：${vp}\n會員委員：${committeeCount} 人\n待重新指派工作：${preview.impactedTasks?.length||0} 件\n\n生效前不會更動正式資料。`))return;
      setBusy(true);
      const result=await api("POST",{action:"save",...payload,revision:state.plan?.revision??null});
      applyState(result);showStatus("換屆排程已儲存",result.message,"scheduled");
    }catch(error){showStatus("無法儲存",error.message,"error")}
    finally{setBusy(false)}
  }
  async function cancelFlow(){
    if(!state.plan||!confirm(`取消 ${state.plan.effectiveOn} 的年度換屆排程？\n目前名單與案件不會被變更。`))return;
    try{setBusy(true);const result=await api("POST",{action:"cancel",planId:state.plan.id,revision:state.plan.revision});applyState(result);showStatus("排程已取消",result.message,"ready")}
    catch(error){showStatus("無法取消",error.message,"error")}
    finally{setBusy(false)}
  }

  $("#handoverEffectiveOn").onchange=event=>{$("#handoverTermEndsOn").value=domain.termEndsOn(event.target.value);markDirty()};
  $("#handoverVpName").onchange=()=>{const member=findMember($("#handoverVpName").value);if(member){proposedVpId=member.personId;proposedCommitteeIds=proposedCommitteeIds.filter(id=>id!==member.personId);renderRoster()}markDirty()};
  $("#addHandoverCommittee").onclick=()=>{const input=$("#handoverCommitteeName"),member=findMember(input.value);if(!member)return showStatus("無法加入","請從正式會員名單選擇委員","error");if(member.personId===proposedVpId)return showStatus("無法加入","副主席不能同時列為會員委員","error");if(proposedCommitteeIds.includes(member.personId))return showStatus("無法加入","此會員已在下一屆委員名單","error");proposedCommitteeIds.push(member.personId);input.value="";renderRoster();markDirty()};
  $("#copyCurrentRoster").onclick=()=>setProposal(state.currentRoster);
  $("#previewHandover").onclick=previewFlow;
  $("#saveHandover").onclick=saveFlow;
  $("#cancelHandover").onclick=cancelFlow;
  load();
})();
