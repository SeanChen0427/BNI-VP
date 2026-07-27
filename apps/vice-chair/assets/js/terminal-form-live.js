(async function(){
  await Promise.all([window.FulianTerminalFormReady,window.FulianTaskStore.ready]);
  const session=FulianAuth.getSession(),config=FulianAuth.getConfig(),taskId=new URLSearchParams(location.search).get("task");
  const task=()=>{try{return(JSON.parse(localStorage.getItem(window.FulianCaseDomain.TASK_STORAGE_KEY)||"[]")||[]).find(item=>item.id===taskId&&item.type==="renewal")||null}catch{return null}};
  const currentTask=task(),identity=document.querySelector("#loginUser"),role=session.role==="vp"?"副主席":session.role==="admin"?"系統管理員":"會員委員";
  if(!currentTask){document.querySelector("#terminalForm").hidden=true;toast("找不到指定的終期輔導案件，請由進行中案件重新開啟");return}
  identity.innerHTML=`<option value="${session.name}">${session.name}（${role}）</option>`;identity.disabled=true;
  document.querySelector("#counselor").value=currentTask?.lead||session.name;document.querySelector("#interviewer").value=currentTask?.lead||session.name;
  const committee=[config.vpName,...config.committee];document.querySelector("#committeeList").innerHTML=[...new Set(committee)].map(name=>`<option value="${name}"></option>`).join("");
  try{
    const response=await fetch("/api/bni-analysis",{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);const snapshot=await response.json();
    const metric=value=>Number(value)||0,normalize=(value={})=>({givenIn:metric(value.givenIn),givenOut:metric(value.givenOut),receivedIn:metric(value.receivedIn),receivedOut:metric(value.receivedOut),amount:metric(value.amount),visitors:metric(value.visitors),oneToOne:metric(value.oneToOne),late:metric(value.late),early:0,substitutes:metric(value.substitutes),education:metric(value.education)});
    const loaded=(snapshot.members||[]).map(item=>({name:item.name,profession:item.profession||"",activation:item.activation||"2026-01-01",score:item.score,metrics:normalize(item.annualMetrics||item.metrics)})).filter(item=>item.name&&Number.isFinite(item.score));
    if(!loaded.length)throw new Error("沒有可用的正式會員資料");
    if(!loaded.some(item=>item.name===currentTask.member))throw new Error(`案件會員「${currentTask.member}」不在正式會員資料`);
    members=loaded;averages={...averages,...normalize(snapshot.memberData?.averages||{})};
    document.querySelector("#memberList").innerHTML=members.map(item=>`<option value="${item.name}">${item.profession}</option>`).join("");
    selectMember(currentTask.member);
    const search=document.querySelector("#memberSearch");search.readOnly=true;search.title="會員已由優先處理案件帶入";
    if(currentTask.scheduledAt)document.querySelector("#meetingDate").value=currentTask.scheduledAt;
    document.querySelector("#counselor").value=currentTask.lead||session.name;document.querySelector("#interviewer").value=currentTask.lead||session.name;
    document.querySelector("#companionCounselor").value=(currentTask.companions||[]).join("、");document.querySelector("#saveTime").textContent="已由優先處理案件自動帶入";
    await window.FulianCaseStateStore.reconcileDraft(currentTask,{member:currentTask.member,...(currentTask.scheduledAt?{meetingDate:currentTask.scheduledAt}:{}),companionCounselor:(currentTask.companions||[]).join("、"),memberSignature:currentTask.member});
  }catch(error){console.error("正式會員資料載入失敗",error);document.querySelector("#terminalForm").hidden=true;toast(error.message||"正式會員資料載入失敗，請重新整理")}
})();
