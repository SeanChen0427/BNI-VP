(function(){
  const $=selector=>document.querySelector(selector);
  const config=window.FulianSupabaseConfig||{};
  const token=new URLSearchParams(location.search).get("f")||"";
  const labels={renewal:"續約",new:"新申請",industry:"轉換行業別"};
  const roles={vp:"副主席",committee:"會員委員"};
  let state=null;
  let submitted=null;
  let busy=false;

  function api(method="GET",body=null){
    const endpoint=`${config.url}/functions/v1/public-feedback${method==="GET"?`?f=${encodeURIComponent(token)}`:""}`;
    return fetch(endpoint,{
      method,
      cache:"no-store",
      referrerPolicy:"no-referrer",
      headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,...(body?{"content-type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,
    }).then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||"回饋服務暫時無法使用");
      return data;
    });
  }

  function dateLabel(value){
    const date=new Date(`${value}T00:00:00+08:00`);
    return Number.isFinite(date.getTime())?`訪談日期 ${date.toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"})}`:"訪談日期不明";
  }

  function timeLabel(value){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleString("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}):"";
  }

  function setStatus(text,tone=""){
    $("#feedbackStatus").textContent=text;
    $("#feedbackStatus").className=`feedback-status ${tone}`.trim();
  }

  function renderFeedbackList(data){
    $("#feedbackCount").textContent=String(data.feedbackCount||0);
    const list=$("#feedbackList");
    list.replaceChildren();
    if(!data.feedback?.length){
      const empty=document.createElement("p");
      empty.className="empty-state";
      empty.textContent="尚未收到委員回饋。";
      list.append(empty);
      return;
    }
    data.feedback.forEach(item=>{
      const article=document.createElement("article");
      const avatar=document.createElement("span");
      avatar.className="avatar";
      avatar.textContent=String(item.name||"").slice(-1);
      const content=document.createElement("div");
      const heading=document.createElement("b");
      heading.textContent=`${item.name}・${roles[item.role]||item.role||"委員"}`;
      const body=document.createElement("p");
      body.textContent=item.body;
      const meta=document.createElement("small");
      meta.textContent=`${item.delegated?"由副主席代填・":""}${timeLabel(item.updatedAt||item.submittedAt)}`;
      content.append(heading,body,meta);
      article.append(avatar,content);
      list.append(article);
    });
  }

  function render(data,{preserveForm=false}={}){
    const previousResponder=preserveForm?$("#responder").value:"";
    const previousFeedback=preserveForm?$("#feedback").value:"";
    state=data;
    const label=labels[data.caseType]||"案件";
    $("#caseLabel").textContent=`${label}委員回饋`;
    $("#applicant").textContent=data.applicant;
    $("#profession").textContent=data.profession;
    $("#interviewDate").textContent=dateLabel(data.interviewDate);
    $("#interviewers").textContent=`主訪 ${data.leadInterviewer}・陪訪 ${data.companionInterviewer}`;
    const ready=data.status==="replied";
    $("#responsesCard").hidden=!ready;
    $("#composeCard").hidden=!ready||Boolean(submitted);
    if(ready){
      setStatus(`回饋已開放，目前已收到 ${data.feedbackCount||0} 份。`,"ready");
      renderFeedbackList(data);
      const select=$("#responder");
      select.replaceChildren(new Option("請選擇姓名",""));
      data.responders.forEach(item=>{
        const suffix=item.hasFeedback?(item.delegated?"（副主席已代填，可由本人更新）":"（已回饋）"):"";
        const option=new Option(`${item.name}・${roles[item.role]||item.role}${suffix}`,item.key);
        option.disabled=Boolean(item.hasFeedback&&!item.delegated);
        select.add(option);
      });
      if(previousResponder&&[...select.options].some(option=>option.value===previousResponder&&!option.disabled))select.value=previousResponder;
      if(preserveForm)$("#feedback").value=previousFeedback;
      refreshButton();
    }else if(data.status==="revoked"){
      setStatus("這份回饋連結已失效或案件已結案，請洽副主席確認。","error");
    }else{
      setStatus("回饋圖卡尚未完成開放，請回 LINE 群組稍候。","");
    }
  }

  function refreshButton(){
    const feedback=$("#feedback").value.trim();
    $("#characterCount").textContent=String($("#feedback").value.length);
    $("#submitFeedback").disabled=busy||!(state?.status==="replied"&&$("#responder").value&&feedback);
  }

  function shareText(name,feedback){
    const label=labels[state?.caseType]||"案件";
    return `【${label}委員回饋】\n申請者：${state?.applicant||""}\n專業別：${state?.profession||""}\n\n${name}：\n${feedback}`;
  }

  function showShare(name,feedback){
    const text=shareText(name,feedback);
    $("#shareCard").hidden=false;
    $("#shareLine").href=`https://line.me/R/share?text=${encodeURIComponent(text)}`;
    $("#copyFeedback").onclick=async()=>{
      try{await navigator.clipboard.writeText(text);$("#copyState").textContent="已複製，可回 LINE 群組貼上。";}
      catch{$("#copyState").textContent="瀏覽器未允許複製，請使用上方 LINE 分享按鈕。";}
    };
    $("#shareCard").scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function submit(event){
    event.preventDefault();
    const option=$("#responder").selectedOptions[0];
    const feedback=$("#feedback").value.trim();
    if(!option?.value||!feedback)return;
    const name=option.textContent.replace(/・.*$/," ").trim();
    if(!confirm(`請確認：你選擇「${name}」並送出這份回饋。\n\n送出後會直接同步正式案件，且其他委員可在此頁查看。確定送出？`))return;
    busy=true;refreshButton();$("#submitFeedback").textContent="正在同步…";
    try{
      const updated=await api("POST",{token,responderKey:option.value,feedback});
      submitted={name,feedback};
      render(updated);
      $("#composeCard").hidden=true;
      setStatus(`${name}，你的回饋已同步正式案件。`,"done");
      showShare(name,feedback);
    }catch(error){setStatus(error.message,"error");}
    finally{busy=false;$("#submitFeedback").textContent="確認送出並同步系統";refreshButton();}
  }

  async function refresh({quiet=false}={}){
    if(busy)return;
    const button=$("#refreshFeedback");
    if(!quiet){button.disabled=true;button.textContent="更新中…";}
    try{render(await api(),{preserveForm:true});}
    catch(error){if(!quiet)setStatus(error.message,"error");}
    finally{if(!quiet){button.disabled=false;button.textContent="重新整理";}}
  }

  $("#responder").addEventListener("change",refreshButton);
  $("#feedback").addEventListener("input",refreshButton);
  $("#feedbackForm").addEventListener("submit",submit);
  $("#refreshFeedback").addEventListener("click",()=>refresh());
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!config.url||!config.publishableKey){setStatus("回饋連結格式不正確，請從 LINE 圖卡重新開啟。","error");return;}
  api().then(render).catch(error=>setStatus(error.message,"error"));
  setInterval(()=>{if(!document.hidden&&state?.status==="replied"&&!submitted)refresh({quiet:true});},20000);
})();
