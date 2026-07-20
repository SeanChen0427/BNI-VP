(async function(){
await window.FulianMemberDirectory.ready;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],KEY="fulian-attendance-prototype-v1",HISTORY_KEY="fulian-attendance-history-v1",authSession=FulianAuth.getSession();
const names=[...(window.FulianMemberDirectory?.members||[])];
if(!names.length)throw new Error("會員名單尚未載入");
const priorLate={};
const priorProxy={};
const priorAbsence={};
let timer,sent=false,palmsReady=false,palmsPeriod="半年 PALMS 尚未載入";
function rowId(name){return`m-${names.indexOf(name)}`}
function defaultState(name){return{name,at630:false,at700:false,late:false,early:false,proxy:false,absent:false,speech:false,badge:false,pin:false,suit:false,camera:false,note:""}}
let rows=names.map(defaultState);
function isVicePresident(){return $("#loginUser").selectedOptions[0]?.dataset.role==="vp"}
function configureIdentity(){const role=authSession.role==="vp"?"vp":authSession.role==="committee"?"committee":"admin",config=FulianAuth.getConfig(),recorders=[config.vpName,...config.committee].filter(Boolean),options=`<option value="">請選擇</option>${recorders.map(name=>`<option value="${name}">${name}</option>`).join("")}`;$("#loginUser").innerHTML=`<option value="${authSession.name}" data-role="${role}">${authSession.name}（${role==="vp"?"副主席":role==="committee"?"會員委員":"系統開發人員 Admin"}）</option>`;$("#loginUser").disabled=true;$("#primaryRecorder").innerHTML=options;$("#assistantRecorder").innerHTML=options}
function applyPermissions(){const allowed=isVicePresident(),box=$("#vpConfirmed"),label=$("#vpConfirmLabel"),note=$("#vpPermissionNote");if(!allowed&&box.checked)box.checked=false;box.disabled=!allowed;label.classList.toggle("permission-locked",!allowed);note.textContent=allowed?"副主席權限已開啟":"僅副主席可操作"}
function renderRows(){$("#memberRows").innerHTML=rows.map((r,i)=>`<tr data-index="${i}"><td>${r.name}</td>${["at630","at700","late","early","proxy","absent","speech","badge","pin","suit","camera"].map(k=>`<td><input type="checkbox" data-field="${k}" ${r[k]?"checked":""} aria-label="${r.name} ${k}"></td>`).join("")}<td><input type="text" data-field="note" value="${escapeHtml(r.note)}" aria-label="${r.name}備註"></td></tr>`).join("");bindTable()}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]))}
function bindTable(){$$("#memberRows [data-field]").forEach(el=>el.addEventListener(el.type==="checkbox"?"change":"input",e=>{const tr=e.target.closest("tr"),r=rows[Number(tr.dataset.index)],field=e.target.dataset.field;r[field]=e.target.type==="checkbox"?e.target.checked:e.target.value;if(field==="absent"&&r.absent){r.at630=false;r.at700=false;r.proxy=false;r.speech=false}if(field==="proxy"&&r.proxy){r.absent=false;r.speech=true}if((field==="at630"||field==="at700")&&r[field])r.absent=false;if(e.target.type==="checkbox")renderRows();scheduleSave()}))}
function currentLate(r){return!r.absent&&!r.proxy&&(r.late||r.early)}
function currentAbsence(r){return r.absent||((r.at630||r.at700)&&!r.proxy&&!r.speech)}
function lateTotal(r){return(priorLate[r.name]||0)+(r.late?1:0)+(r.early?1:0)}
function proxyTotal(r){return(priorProxy[r.name]||0)+(r.proxy?1:0)}
function absenceTotal(r){const late=lateTotal(r);return(priorAbsence[r.name]||0)+(currentAbsence(r)?1:0)+Math.floor(late/3)}
function lateRemainder(r){return lateTotal(r)%3}
function list(items){return items.length?items.join("、"):""}
function groupedLines(label,getCount,min,max){const groups=Array.from({length:max-min+1},(_,j)=>j+min);return groups.map(n=>{const names=list(rows.filter(r=>getCount(r)===n).map(r=>r.name));return label==="遲到"?`*遲到累計${n}次: ${names}`:`*${label}累計(${n}次)：${names}`}).join("\n")}
async function loadPalmsTotals(){
  try{
    const response=await fetch("/api/bni-analysis",{cache:"no-store"}),snapshot=await response.json();
    if(!response.ok||!Array.isArray(snapshot.members))throw new Error(snapshot.message||"BNI 分析橋接無法讀取");
    for(const name of names){priorLate[name]=0;priorProxy[name]=0;priorAbsence[name]=0}
    for(const member of snapshot.members){
      if(!names.includes(member.name))continue;
      priorLate[member.name]=Number(member.metrics?.late)||0;
      priorProxy[member.name]=Number(member.metrics?.substitutes)||0;
      priorAbsence[member.name]=Number(member.metrics?.absence)||0;
    }
    palmsPeriod=String(snapshot.report?.meta||"最新半年 PALMS").replace(/^計分期間\s*/,"");
    palmsReady=true;
  }catch(error){
    palmsReady=false;palmsPeriod=`半年 PALMS 讀取失敗：${error.message}`;
  }
  const node=$("#palmsPeriod");if(node)node.textContent=palmsPeriod;
}
function dateLabel(){const v=$("#meetingDate").value;if(!v)return"____/__/__";const d=new Date(`${v}T00:00:00`);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`}
function announcement(){const weeklyLate=rows.filter(currentLate).map(r=>r.name),weeklyProxy=rows.filter(r=>r.proxy).map(r=>r.name),weeklyAbsence=rows.filter(currentAbsence).map(r=>r.name),maxLate=Math.max(1,...rows.map(lateRemainder)),maxProxy=Math.max(5,...rows.map(proxyTotal)),maxAbsence=Math.max(4,...rows.map(absenceTotal));return`${palmsReady?"":`【系統提醒：${palmsPeriod}，以下累計不可作為正式公告】\n\n`}【會員委員會公告 】
${dateLabel()} 出席狀況

■ 本日全程會議
富聯會員總人數${rows.length}人
06：30 到${rows.filter(r=>r.at630).length}人
07：00 到${rows.filter(r=>r.at700).length}人
------------------
■本周遲到(${weeklyLate.length}位)：${list(weeklyLate)}
${groupedLines("遲到",lateRemainder,1,maxLate)}
------------------
■本週代理人(${weeklyProxy.length}位)：${list(weeklyProxy)}
${groupedLines("代理人",proxyTotal,1,maxProxy)}
------------------
■本週缺席(${weeklyAbsence.length}位)：${list(weeklyAbsence)}
${groupedLines("缺席",absenceTotal,1,maxAbsence)}
------------------
【 出缺席地基-6個月內連動】
■累積3次遲到+早退轉1次缺席
■缺席最多3次，第4次則需開放專業別
■未進行${$("#speechSeconds").value}秒視同缺席
■限8次代理，第9次則開放專業別
■中心區決議：已無病假，如確診請找代理人代理出席`}
function update(){applyPermissions();const weeklyLate=rows.filter(currentLate),weeklyProxy=rows.filter(r=>r.proxy),weeklyAbsence=rows.filter(currentAbsence);$("#totalCount").textContent=rows.length;$("#count630").textContent=rows.filter(r=>r.at630).length;$("#count700").textContent=rows.filter(r=>r.at700).length;$("#lateCount").textContent=weeklyLate.length;$("#proxyCount").textContent=weeklyProxy.length;$("#absenceCount").textContent=weeklyAbsence.length;$("#speechHeader").textContent=`${$("#speechSeconds").value}秒`;$("#announcementPreview").textContent=announcement();$$('#memberRows tr').forEach((tr,i)=>{tr.classList.toggle("alert",currentAbsence(rows[i])||absenceTotal(rows[i])>=4||proxyTotal(rows[i])>=8);tr.classList.toggle("proxy",rows[i].proxy)});const ready=palmsReady&&$("#recorderConfirmed").checked&&$("#vpConfirmed").checked,state=$("#sendState"),button=$("#simulateSend");button.disabled=!ready;state.className=`send-state${sent?" sent":ready?" ready":""}`;state.querySelector("span").textContent=sent?"已完成模擬發送":!palmsReady?"尚未載入半年 PALMS，不能發送正式公告":ready?"已完成雙重確認，可以發送":"尚未達到發送條件"}
function data(){return{rows,loginUser:$("#loginUser").value,meetingDate:$("#meetingDate").value,primaryRecorder:$("#primaryRecorder").value,assistantRecorder:$("#assistantRecorder").value,speechSeconds:$("#speechSeconds").value,recorderConfirmed:$("#recorderConfirmed").checked,vpConfirmed:isVicePresident()&&$("#vpConfirmed").checked}}
function save(){const snapshot={...data(),savedAt:new Date().toISOString(),savedBy:authSession.name};localStorage.setItem(KEY,JSON.stringify(snapshot));if(snapshot.meetingDate){let history={};try{history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"{}")||{}}catch{}history[snapshot.meetingDate]=snapshot;localStorage.setItem(HISTORY_KEY,JSON.stringify(history))}const d=new Date();$("#saveState").textContent="草稿與日期紀錄已儲存";$("#saveTime").textContent=`最後儲存 ${d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;update()}
function scheduleSave(){sent=false;$("#saveState").textContent="儲存中…";clearTimeout(timer);timer=setTimeout(save,250);update()}
function restore(){const saved=JSON.parse(localStorage.getItem(KEY)||"null");configureIdentity();if(!saved)return;if(Array.isArray(saved.rows)&&saved.rows.length===names.length)rows=saved.rows;["meetingDate","primaryRecorder","assistantRecorder","speechSeconds"].forEach(id=>{if(saved[id]!==undefined)$(`#${id}`).value=saved[id]});["recorderConfirmed","vpConfirmed"].forEach(id=>{if(saved[id]!==undefined)$(`#${id}`).checked=saved[id]});applyPermissions()}
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
async function init(){const now=new Date(),pad=value=>String(value).padStart(2,"0");$("#meetingDate").value=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;restore();await loadPalmsTotals();renderRows();$$('[data-save]').forEach(el=>{el.addEventListener("change",scheduleSave);el.addEventListener("input",scheduleSave)});$$('[data-bulk]').forEach(button=>button.onclick=()=>{const type=button.dataset.bulk;if(type==="appearance")rows.forEach(r=>{r.badge=r.pin=r.suit=r.camera=true});else rows.forEach(r=>r[type]=true);renderRows();scheduleSave()});$("#clearWeek").onclick=()=>{if(confirm("要清除本週點名狀態嗎？半年 PALMS 正式累計不會清除。")){rows=names.map(defaultState);renderRows();scheduleSave()}};$("#copyAnnouncement").onclick=async()=>{await navigator.clipboard.writeText(announcement());toast(palmsReady?"公告已複製":"已複製，但半年 PALMS 尚未載入，請勿正式發送")};$("#simulateSend").onclick=()=>{sent=true;update();toast("已模擬發送至富聯公告群（未實際連接LINE）")};update()}
init();
})();
