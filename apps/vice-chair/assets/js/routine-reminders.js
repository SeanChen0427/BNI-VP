(async function(){
  const session=FulianAuth.getSession();
  if(!session||!["admin","vp"].includes(session.role)){location.href="index.html";return}
  const $=selector=>document.querySelector(selector);
  const labels={weekly_meeting_alarm:"每週例會鬧鐘提醒",monthly_data_entry:"月底數據 Key in 提醒"};
  const statusLabels={sent:"已送達",failed:"失敗",processing:"發送中",skipped:"已略過"};
  let state={target:null,rules:[],deliveries:[]};
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
  function preview(){
    $("#weeklyPreview").textContent=`@所有人\n${$("#weeklyMessage").value.trim()}`;
    $("#monthlyPreview").textContent=`@所有人\n${$("#monthlyMessage").value.trim()}`;
  }
  function render(){
    const weekly=rule("weekly_meeting_alarm"),monthly=rule("monthly_data_entry");
    $("#weeklyEnabled").checked=Boolean(weekly.enabled);$("#weeklyWeekday").value=String(weekly.sendWeekday||1);$("#weeklyTime").value=weekly.sendTime||"20:00";$("#weeklyMessage").value=weekly.messageTemplate||"";
    $("#monthlyEnabled").checked=Boolean(monthly.enabled);$("#monthlyTime").value=monthly.sendTime||"20:00";$("#monthlyMessage").value=monthly.messageTemplate||"";$("#meetingWeekday").value=String(monthly.meetingWeekday||2);$("#daysBefore").value=String(monthly.daysBefore??1);
    const target=$("#targetState");
    target.className=`target-state ${state.target?"ready":"missing"}`;
    target.querySelector("strong").textContent=state.target?state.target.displayName:"尚未指定交流群";
    target.querySelector("span").textContent=state.target?`${state.target.environment==="test"?"測試群":"正式群"}・常態通知只會送到此群組`:"邀請 Bot 進群並傳訊息後，到設定頁指定「交流群常態通知」用途";
    document.querySelectorAll("[data-test]").forEach(button=>button.disabled=!state.target||!state.configured);
    $("#saveState").textContent=state.rules.some(item=>item.enabled)?"已有提醒啟用":"所有提醒目前關閉";
    $("#saveDetail").textContent=state.schedulerReady?"Supabase 排程服務已就緒":"排程尚未啟用；現在可先設定與測試";
    $("#deliveryList").innerHTML=state.deliveries.length?state.deliveries.map(item=>`<article><b>${escapeHtml(labels[item.reminderKey]||item.reminderKey)}</b><span>${item.triggerSource==="manual_test"?"人工測試":"自動排程"}</span><time>${escapeHtml(new Date(item.requestedAt).toLocaleString("zh-TW"))}</time><em class="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status]||item.status)}</em>${item.errorMessage?`<span>${escapeHtml(item.errorMessage)}</span>`:""}</article>`).join(""):`<article><span>尚無發送紀錄</span></article>`;
    preview();
  }
  function collect(){return[
    {reminderKey:"weekly_meeting_alarm",enabled:$("#weeklyEnabled").checked,sendWeekday:Number($("#weeklyWeekday").value),sendTime:$("#weeklyTime").value,messageTemplate:$("#weeklyMessage").value,mentionAll:true},
    {reminderKey:"monthly_data_entry",enabled:$("#monthlyEnabled").checked,sendTime:$("#monthlyTime").value,meetingWeekday:Number($("#meetingWeekday").value),daysBefore:Number($("#daysBefore").value),messageTemplate:$("#monthlyMessage").value,mentionAll:true},
  ]}
  async function load(){
    try{state=await api();render()}catch(error){$("#saveState").textContent="載入失敗";$("#saveDetail").textContent=error.message;toast(error.message)}
  }
  $("#saveRules").onclick=async()=>{
    const rules=collect();
    if(rules.some(item=>item.enabled)&&!state.target)return toast("請先指定交流群，再啟用提醒");
    if(rules.some(item=>item.enabled)&&!state.schedulerReady)return toast("Supabase 排程尚未啟用，請先保持提醒關閉");
    const button=$("#saveRules");button.disabled=true;button.textContent="保存中…";
    try{const result=await api("POST",{action:"save",rules});state=result.state;render();toast(result.message)}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent="保存常態通知設定"}
  };
  document.querySelectorAll("[data-test]").forEach(button=>button.onclick=async()=>{
    const key=button.dataset.test,label=labels[key];
    if(!confirm(`將目前已保存的「${label}」文案立即測試發送到「${state.target?.displayName||"交流群"}」？\n\n測試訊息會真的 @所有人。若剛修改文案，請先按保存。`))return;
    button.disabled=true;button.textContent="發送中…";
    try{const result=await api("POST",{action:"test",reminderKey:key});state=result.state;render();toast(result.message)}catch(error){toast(error.message)}finally{button.textContent="測試發送到交流群";button.disabled=!state.target||!state.configured}
  });
  ["weeklyMessage","monthlyMessage"].forEach(id=>$("#"+id).addEventListener("input",preview));
  await load();
})();
