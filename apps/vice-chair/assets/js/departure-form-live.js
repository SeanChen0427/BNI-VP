(async function(){
  await Promise.all([window.FulianDepartureFormReady,window.FulianTaskStore.ready]);
  const session=FulianAuth.getSession(),config=FulianAuth.getConfig(),taskId=new URLSearchParams(location.search).get("task");
  const role=session.role==="vp"?"副主席":session.role==="admin"?"系統管理員":"會員委員";
  const identity=document.querySelector("#loginUser");
  identity.innerHTML=`<option value="${session.name}">${session.name}（${role}）</option>`;
  identity.disabled=true;
  document.querySelector("#committeeList").innerHTML=[...new Set([config.vpName,...config.committee])].map(name=>`<option value="${name}"></option>`).join("");
  document.querySelector("#interviewer").value=session.name;
  document.querySelector("#vicePresidentSignature").value=config.vpName;
  let task=null;
  try{task=(JSON.parse(localStorage.getItem(window.FulianCaseDomain.TASK_STORAGE_KEY)||"[]")||[]).find(item=>item.id===taskId&&item.type==="departure")||null}catch{}
  if(!task){document.querySelector("#departureForm").hidden=true;toast("找不到指定的離會訪談案件，請由進行中案件重新開啟");return}
  try{
    const response=await fetch("/api/bni-analysis",{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const snapshot=await response.json();
    const activeMembers=(snapshot.members||[]).map(item=>({name:item.name,profession:item.profession||""})).filter(item=>item.name);
    const activeMatch=activeMembers.find(item=>item.name===task.member);
    const boundMember=activeMatch||{name:task.member,profession:task.profession||""};
    if(!boundMember.name||(!activeMatch&&!task.memberRecordId))throw new Error(`案件會員「${task.member}」沒有正式會員識別資料`);
    members=[boundMember];
    document.querySelector("#memberList").innerHTML=members.map(item=>`<option value="${item.name}">${item.profession}</option>`).join("");
    selectMember(task.member);
    if(task.memberStatus==="departed"){
      const notice=document.querySelector("#departureMemberState");
      notice.hidden=false;
      notice.textContent="這是已離會會員的補訪紀錄；完成訪談不會恢復現任會員資格，也不影響目前會員人數或 PALMS。";
    }
    document.querySelector("#interviewer").value=task.lead||session.name;
    if(task.companions?.length)document.querySelector("#companion").value=task.companions.join("、");
    if(task.scheduledAt)document.querySelector("#interviewDate").value=task.scheduledAt;
    document.querySelector("#memberSearch").readOnly=true;document.querySelector("#saveTime").textContent="已由優先處理案件自動帶入";
    await window.FulianCaseStateStore.reconcileDraft(task,{member:task.member,...(task.scheduledAt?{interviewDate:task.scheduledAt}:{}),interviewer:task.lead||session.name,companion:(task.companions||[]).join("、")});
    document.querySelector("#departureForm").hidden=false;
  }catch(error){console.error("正式會員資料載入失敗",error);document.querySelector("#departureForm").hidden=true;toast(error.message||"正式會員資料載入失敗，請重新整理")}
})();
