(async function(){
  const session=FulianAuth.getSession(),config=FulianAuth.getConfig(),taskId=new URLSearchParams(location.search).get("task");
  const role=session.role==="vp"?"副主席":session.role==="admin"?"系統管理員":"會員委員";
  const identity=document.querySelector("#loginUser");
  identity.innerHTML=`<option value="${session.name}">${session.name}（${role}）</option>`;
  identity.disabled=true;
  document.querySelector("#committeeList").innerHTML=[...new Set([config.vpName,...config.committee])].map(name=>`<option value="${name}"></option>`).join("");
  document.querySelector("#interviewer").value=session.name;
  document.querySelector("#vicePresidentSignature").value=config.vpName;
  let task=null;
  try{task=(JSON.parse(localStorage.getItem(window.FulianCaseDomain.TASK_STORAGE_KEY)||"[]")||[]).find(item=>item.id===taskId)||null}catch{}
  try{
    const response=await fetch("/api/bni-analysis",{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const snapshot=await response.json();
    members=(snapshot.members||[]).map(item=>({name:item.name,profession:item.profession||""})).filter(item=>item.name);
    if(!members.length)throw new Error("沒有可用的正式會員資料");
    document.querySelector("#memberList").innerHTML=members.map(item=>`<option value="${item.name}">${item.profession}</option>`).join("");
    selectMember(task?.member||members[0].name);
    document.querySelector("#interviewer").value=task?.lead||session.name;
    if(task?.companions?.length)document.querySelector("#companion").value=task.companions.join("、");
    if(task?.scheduledAt)document.querySelector("#interviewDate").value=task.scheduledAt;
    if(task){document.querySelector("#memberSearch").readOnly=true;document.querySelector("#saveTime").textContent="已由優先處理案件自動帶入"}
  }catch(error){console.error("正式會員資料載入失敗",error);toast("正式會員資料載入失敗，請重新整理")}
})();
