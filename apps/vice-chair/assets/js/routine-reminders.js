(async function(){
  const session=FulianAuth.getSession();
  if(!session||!["admin","vp"].includes(session.role)){location.href="index.html";return}
  const $=selector=>document.querySelector(selector);
  const labels={weekly_meeting_alarm:"每週例會鬧鐘提醒",monthly_data_entry:"月底數據 Key in 提醒",monthly_committee_meeting:"每月會員委員會會議提醒"};
  const routes={weekly_meeting_alarm:"exchange",monthly_data_entry:"exchange",monthly_committee_meeting:"committee"};
  const statusLabels={sent:"已送達",failed:"失敗",processing:"發送中",skipped:"已略過"};
  let state={target:null,targets:{exchange:null,committee:null},rules:[],deliveries:[],workDigest:null};
  let digestFingerprint="",digestDirty=false;
  $("#loginIdentity").value=`${session.name}・${session.role==="admin"?"系統管理員":"副主席"}`;
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  function toast(message){const element=$("#toast");element.textContent=message;element.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.classList.remove("show"),2200)}
  function identity(){return`${session.role}:${session.name}`}
  async function api(method="GET",payload=null){
    const options={method,headers:{"content-type":"application/json"},cache:"no-store"};
    if(payload)options.body=JSON.stringify({identity:identity(),...payload});
    const suffix=method==="GET"?`?identity=${encodeURIComponent(identity())}`:"";
    const response=await fetch(`/api/line-reminders${suffix}`,options),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||"常態通知服務無法使用");
    return data;
  }
  function rule(key){return state.rules.find(item=>item.reminderKey===key)||{}}
  function routeTarget(route){return state.targets?.[route]||(route==="exchange"?state.target:null)}
  function targetForRule(key){return routeTarget(routes[key])}
  function formatNextReminder(value){
    const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
    if(!match)return"尚未能計算";
    const weekdays=["週日","週一","週二","週三","週四","週五","週六"],weekday=weekdays[new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`).getUTCDay()];
    return`${match[1]}/${match[2]}/${match[3]}（${weekday}）${match[4]}`;
  }
  function renderNextReminder(selector,item){
    const element=$(selector);
    element.classList.toggle("disabled",!item.enabled);
    element.querySelector("strong").textContent=formatNextReminder(item.nextScheduledLocal);
    element.querySelector("span").textContent=item.enabled?"已啟用・系統將依此時間自動發送":"目前未啟用・啟用後才會自動發送";
  }
  function renderTarget(selector,route,label){
    const element=$(selector),target=routeTarget(route);
    element.className=`target-state ${target?"ready":"missing"}`;
    element.querySelector("strong").textContent=target?target.displayName:`尚未指定${label}`;
    element.querySelector("span").textContent=target?`${target.environment==="test"?"測試群":"正式群"}・此用途的通知只會送到這裡`:`請先將 Bot 加入群組並在設定頁指定「${label}」用途`;
  }
  function preview(){
    $("#weeklyPreview").textContent=`@所有人\n${$("#weeklyMessage").value.trim()}`;
    $("#monthlyPreview").textContent=`@所有人\n${$("#monthlyMessage").value.trim()}`;
    $("#committeePreview").textContent=`@所有人\n${$("#committeeMessage").value.trim()}`;
  }
  function formatDateTime(value){return value?new Date(value).toLocaleString("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
  function renderWorkDigest(force=false){
    const item=state.workDigest||{},target=item.target,message=$("#workDigestMessage");
    const sourceChanged=Boolean(item.sourceFingerprint&&item.sourceFingerprint!==digestFingerprint);
    if(force||sourceChanged||!digestFingerprint){
      message.value=item.content||"";
      digestFingerprint=item.sourceFingerprint||"";
      digestDirty=false;
    }
    $("#workDigestTarget").textContent=target?`${target.displayName}・${target.environment==="production"?"正式群":"測試群"}`:"尚未指定會員委員會群";
    $("#workDigestCounts").textContent=item.counts?`進行中 ${item.counts.active}・逾期 ${item.counts.overdue}・回饋 ${item.counts.feedback}・投票 ${item.counts.vote}`:"尚未取得案件資料";
    $("#workDigestGeneratedAt").textContent=formatDateTime(item.generatedAt);
    $("#workDigestPreview").textContent=`@所有人\n${message.value.trim()}`;
    const delivery=item.delivery;
    $("#workDigestDelivery").className=`digest-delivery ${delivery?.status||""}`;
    $("#workDigestDelivery").textContent=delivery?.status==="sent"?`最近一次已送達・${formatDateTime(delivery.sentAt)}`:delivery?.status==="failed"?`最近一次發送失敗・${delivery.errorMessage||"請重新整理後再試"}`:delivery?.status==="processing"?"工作進度正在發送":"尚未從本頁發送";
    $("#sendWorkDigest").disabled=!item.ready||!digestFingerprint||!message.value.trim()||delivery?.status==="processing";
    $("#copyWorkDigest").disabled=!message.value.trim();
  }
  function render(forceDigest=false){
    const weekly=rule("weekly_meeting_alarm"),monthly=rule("monthly_data_entry"),committee=rule("monthly_committee_meeting");
    $("#weeklyEnabled").checked=Boolean(weekly.enabled);$("#weeklyWeekday").value=String(weekly.sendWeekday||1);$("#weeklyTime").value=weekly.sendTime||"20:00";$("#weeklyMessage").value=weekly.messageTemplate||"";
    $("#monthlyEnabled").checked=Boolean(monthly.enabled);$("#monthlyTime").value=monthly.sendTime||"20:00";$("#monthlyMessage").value=monthly.messageTemplate||"";$("#meetingWeekday").value=String(monthly.meetingWeekday||2);$("#daysBefore").value=String(monthly.daysBefore??1);
    $("#committeeEnabled").checked=Boolean(committee.enabled);$("#committeeMeetingWeekday").value=String(committee.meetingWeekday||2);$("#committeeTime").value=committee.sendTime||"20:00";$("#committeeMessage").value=committee.messageTemplate||"";
    renderNextReminder("#monthlyNextReminder",monthly);
    renderNextReminder("#committeeNextReminder",committee);
    renderTarget("#exchangeTargetState","exchange","交流群常態通知");
    renderTarget("#committeeTargetState","committee","會員委員會通知");
    document.querySelectorAll("[data-test]").forEach(button=>button.disabled=!targetForRule(button.dataset.test)||!state.configured);
    $("#saveState").textContent=state.rules.some(item=>item.enabled)?"已有提醒啟用":"所有提醒目前關閉";
    $("#saveDetail").textContent=state.schedulerReady?"Supabase 排程服務已就緒":"排程尚未啟用；現在可先設定與測試";
    $("#deliveryList").innerHTML=state.deliveries.length?state.deliveries.map(item=>`<article><b>${escapeHtml(labels[item.reminderKey]||item.reminderKey)}</b><span>${item.triggerSource==="manual_test"?"人工測試":"自動排程"}</span><time>${escapeHtml(new Date(item.requestedAt).toLocaleString("zh-TW"))}</time><em class="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status]||item.status)}</em>${item.errorMessage?`<span>${escapeHtml(item.errorMessage)}</span>`:""}</article>`).join(""):`<article><span>尚無發送紀錄</span></article>`;
    preview();
    renderWorkDigest(forceDigest);
  }
  function collect(){return[
    {reminderKey:"weekly_meeting_alarm",enabled:$("#weeklyEnabled").checked,sendWeekday:Number($("#weeklyWeekday").value),sendTime:$("#weeklyTime").value,messageTemplate:$("#weeklyMessage").value,mentionAll:true},
    {reminderKey:"monthly_data_entry",enabled:$("#monthlyEnabled").checked,sendTime:$("#monthlyTime").value,meetingWeekday:Number($("#meetingWeekday").value),daysBefore:Number($("#daysBefore").value),messageTemplate:$("#monthlyMessage").value,mentionAll:true},
    {reminderKey:"monthly_committee_meeting",enabled:$("#committeeEnabled").checked,sendTime:$("#committeeTime").value,meetingWeekday:Number($("#committeeMeetingWeekday").value),daysBefore:1,messageTemplate:$("#committeeMessage").value,mentionAll:true},
  ]}
  async function load(forceDigest=false){
    try{state=await api();render(forceDigest)}catch(error){$("#saveState").textContent="載入失敗";$("#saveDetail").textContent=error.message;toast(error.message)}
  }
  $("#saveRules").onclick=async()=>{
    const rules=collect();
    const missing=rules.find(item=>item.enabled&&!targetForRule(item.reminderKey));
    if(missing)return toast(`請先指定${routes[missing.reminderKey]==="committee"?"會員委員會群":"交流群"}，再啟用提醒`);
    if(rules.some(item=>item.enabled)&&!state.schedulerReady)return toast("Supabase 排程尚未啟用，請先保持提醒關閉");
    const button=$("#saveRules");button.disabled=true;button.textContent="保存中…";
    try{const result=await api("POST",{action:"save",rules});state=result.state;render();toast(result.message)}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent="保存常態通知設定"}
  };
  document.querySelectorAll("[data-test]").forEach(button=>button.onclick=async()=>{
    const key=button.dataset.test,label=labels[key],target=targetForRule(key),defaultText=button.textContent;
    if(!target)return toast(`尚未指定${routes[key]==="committee"?"會員委員會群":"交流群"}`);
    if(!confirm(`將目前已保存的「${label}」文案立即測試發送到「${target.displayName}」？\n\n測試訊息會真的 @所有人。若剛修改文案，請先按保存。`))return;
    button.disabled=true;button.textContent="發送中…";
    try{const result=await api("POST",{action:"test",reminderKey:key});state=result.state;render();toast(result.message)}catch(error){toast(error.message)}finally{button.textContent=defaultText;button.disabled=!targetForRule(key)||!state.configured}
  });
  ["weeklyMessage","monthlyMessage","committeeMessage"].forEach(id=>$("#"+id).addEventListener("input",preview));
  $("#workDigestMessage").addEventListener("input",()=>{digestDirty=true;renderWorkDigest()});
  $("#refreshWorkDigest").onclick=async()=>{
    const button=$("#refreshWorkDigest");button.disabled=true;button.textContent="重新抓取中…";
    try{await load(true);toast("已重新抓取正式案件並更新預覽")}finally{button.disabled=false;button.textContent="重新抓取最新工作"}
  };
  $("#copyWorkDigest").onclick=async()=>{
    const content=`@All\n${$("#workDigestMessage").value.trim()}`;
    try{await navigator.clipboard.writeText(content);toast("預覽文字已複製；貼到 LINE 後請人工確認 @All")}
    catch{toast("瀏覽器無法複製，請手動選取預覽文字")}
  };
  $("#sendWorkDigest").onclick=async()=>{
    const item=state.workDigest||{},target=item.target,content=$("#workDigestMessage").value.trim(),button=$("#sendWorkDigest");
    if(!target)return toast("尚未指定會員委員會群");
    if(!content)return toast("請先產生工作進度預覽");
    if(!confirm(`將上方完整預覽發送到${target.environment==="production"?"正式":"測試"}群組「${target.displayName}」？\n\n訊息會真的 @所有人；只有確認後才會送出。`))return;
    button.disabled=true;button.textContent="發送中…";
    try{const result=await api("POST",{action:"work_digest_send",content,sourceFingerprint:digestFingerprint});state=result.state;digestDirty=false;render();toast(result.message)}
    catch(error){toast(error.message)}finally{button.textContent="確認發送至委員會群";renderWorkDigest()}
  };
  await load();
})();
