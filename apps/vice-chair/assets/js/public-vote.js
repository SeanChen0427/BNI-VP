(function(){
  const $=selector=>document.querySelector(selector);
  const config=window.FulianSupabaseConfig||{};
  const token=new URLSearchParams(location.search).get("t")||"";
  const labels={
    renewal:{case:"續約投票",approve:"同意續約",reject:"不同意續約"},
    new:{case:"新申請投票",approve:"同意入會",reject:"不同意入會"},
    industry:{case:"轉換行業別投票",approve:"同意轉換",reject:"不同意轉換"},
  };
  let state=null;

  function api(method="GET",body=null){
    const endpoint=`${config.url}/functions/v1/public-vote${method==="GET"?`?t=${encodeURIComponent(token)}`:""}`;
    return fetch(endpoint,{
      method,
      cache:"no-store",
      referrerPolicy:"no-referrer",
      headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,...(body?{"content-type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,
    }).then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||"投票服務暫時無法使用");
      return data;
    });
  }
  function dateLabel(value){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?`截止 ${date.toLocaleString("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}`:"截止時間不明";
  }
  function setStatus(text,tone=""){$("#ballotStatus").textContent=text;$("#ballotStatus").className=`ballot-status ${tone}`.trim()}
  function render(data){
    state=data;
    const copy=labels[data.caseType]||{case:"委員投票",approve:"同意",reject:"不同意"};
    $("#caseLabel").textContent=copy.case;
    $("#applicant").textContent=data.applicant;
    $("#profession").textContent=data.profession;
    $("#deadline").textContent=dateLabel(data.deadlineAt);
    $("#voteCount").textContent=`已投 ${data.voteCount} 票`;
    $("#approveLabel").textContent=copy.approve;
    $("#rejectLabel").textContent=copy.reject;
    const role={vp:"副主席",committee:"會員委員"};
    const voterSelect=$("#voter");
    voterSelect.replaceChildren(new Option("請選擇姓名",""));
    data.voters.forEach(item=>{
      const option=new Option(`${item.name}・${role[item.role]||item.role}${item.hasVoted?"（已投）":""}`,item.key);
      option.disabled=Boolean(item.hasVoted);
      voterSelect.add(option);
    });
    const ready=data.status==="replied";
    $("#ballotForm").hidden=!ready;
    if(ready)setStatus("投票已開放，請確認姓名後送出。","ready");
    else if(data.status==="expired")setStatus("這份投票已截止。","error");
    else if(data.status==="revoked")setStatus("這份投票連結已更新，請由最新 LINE 圖卡重新進入。","error");
    else setStatus("投票圖卡尚未完成開放，請回 LINE 群組稍候。","");
    refreshButton();
  }
  function refreshButton(){
    const selected=$("#voter").value;
    const choice=$("input[name=choice]:checked")?.value||"";
    $("#submitVote").disabled=!(state?.status==="replied"&&selected&&choice);
  }
  async function submit(event){
    event.preventDefault();
    const option=$("#voter").selectedOptions[0];
    const choice=$("input[name=choice]:checked")?.value||"";
    if(!option?.value||!choice)return;
    const choiceText=choice==="approve"?$("#approveLabel").textContent:$("#rejectLabel").textContent;
    if(!confirm(`請確認：你選擇「${option.textContent.replace("・副主席","").replace("・會員委員","")}」，並投下「${choiceText}」。\n\n送出後不能自行修改，確定送出？`))return;
    $("#submitVote").disabled=true;$("#submitVote").textContent="正在送出…";
    try{
      const updated=await api("POST",{token,voterKey:option.value,choice});
      render(updated);$("#ballotForm").hidden=true;
      setStatus(`${option.textContent.replace(/・.*$/,"")}，你的票已記錄完成。請回 LINE 群組 tag 回覆「已投」。`,"done");
    }catch(error){setStatus(error.message,"error");$("#submitVote").textContent="確認送出這一票";refreshButton()}
  }
  $("#voter").addEventListener("change",refreshButton);
  document.querySelectorAll("input[name=choice]").forEach(input=>input.addEventListener("change",refreshButton));
  $("#ballotForm").addEventListener("submit",submit);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!config.url||!config.publishableKey){setStatus("投票連結格式不正確，請從 LINE 圖卡重新開啟。","error");return}
  api().then(render).catch(error=>setStatus(error.message,"error"));
})();
