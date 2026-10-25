const midtermAuthSession=JSON.parse(sessionStorage.getItem("fulian-auth-session-v1")||"null");if(!midtermAuthSession)location.replace("login.html?next=midterm-form.html");
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];const midtermTaskId=new URLSearchParams(location.search).get("task");if(!midtermTaskId)location.replace("case-board.html?new=midterm");const KEY=window.FulianCaseDomain.draftStorageKey({id:midtermTaskId,type:"midterm"});
const midtermCompletion=window.FulianInterviewCompletion.setup({formLabel:"期中輔導",requiresDecision:false});
const midtermCalendar=window.FulianCalendarDomain;
let members=[{name:"正式資料載入中",profession:"",score:0,metrics:{absence:0,substitutes:0,late:0,givenIn:0,givenOut:0,receivedIn:0,receivedOut:0,amount:0,visitors:0,education:0,oneToOne:0}}];let member=members[0],timer;
const grow=[{id:"goal",no:"03",label:"Goal 目標",questions:["分會對會員燈號的目標為何？（綠燈會員）","會員為何需要成為綠燈會員？","你想在BNI收穫什麼？","成為綠燈會員對你有什麼好處？","對你來說在BNI的成功是什麼？"]},{id:"reality",no:"04",label:"Reality 現況",questions:["對於你在BNI的成功，1～10分是幾分？","對於成為綠燈會員遇到什麼問題？已是綠燈會員目前表現？","對自己目前表現感受如何？","是什麼原因阻礙你在BNI的成功？","你是否願意改變？"]},{id:"option",no:"05",label:"Option 方案",questions:["針對剛剛的阻礙，需要提供什麼輔導或培訓來幫助你？（會員委員會提供建議或引導）","你自己有什麼策略改變現況？","對於上述的策略你覺得各有什麼優缺點？","如果保持不改變，會發生什麼事？"]},{id:"forward",no:"06",label:"Way Forward 向前邁進",questions:["你覺得目前對你的最好的策略是什麼？你什麼時候開始？你的第一步是什麼？","你還有什麼要做的？","1～10分為標準，你承諾的投入度是幾分？","你要如何做才能提升到10分？","如何慶祝你的成功？","如果今天就是續約日，是否有意願續約呢？為什麼？"]}];
const growHints={goal:[
 ["先確認會員是否理解綠燈代表持續使用BNI系統，而不只是分數。","可以請會員說出自己認為最值得改善的一項數據。"],
 ["了解會員認為綠燈和實際商務收穫之間有什麼關係。"],
 ["將抽象期待追問成具體成果，例如客戶類型、人脈或能力。"],
 ["請會員說出成為綠燈後，最希望改善的工作或合作狀態。"],
 ["成功可以包含生意、人脈、學習、信任及個人成長。"]
],reality:[
 ["除了分數，也詢問為什麼不是更高或更低。"],
 ["綠燈會員可改問：目前哪一項做法最有效、哪一項仍可提升？"],
 ["留意會員的投入感、歸屬感與實際收穫是否一致。"],
 ["協助區分時間、方法、服務定位、關係深度或其他障礙。"],
 ["若願意改變，接著確認他願意先改哪一件事。"]
],option:[
 ["依阻礙提出對應協助，不預設所有問題都靠增加培訓解決。"],
 ["鼓勵會員自己先提出可執行的方法，再由委員補充。"],
 ["比較投入時間、可行性、預期成果與可能阻礙。"],
 ["用中性方式協助會員看見維持現況的實際影響。"]
],forward:[
 ["把策略具體化為開始日期、第一步與可觀察的完成標準。"],
 ["確認是否需要委員、導師或其他職長協助。"],
 ["分數低於10時，追問缺少的是信心、時間、方法還是資源。"],
 ["請會員自己說出提升一分所需的最小行動。"],
 ["慶祝方式可小而具體，用來強化持續行動。"],
 ["了解續約意願背後的原因，以及委員會可以提前協助什麼。"]
]};
function systemHint(section,index){const items=growHints[section]?.[index]||[];return`<div class="system-hint"><b>系統訪談提示・不輸出至正式表單</b><ul>${items.map(x=>`<li>${x}</li>`).join("")}</ul></div>`}
function answerField(section,index){const id=`${section}_${index}`,isScore=(section==="reality"&&index===0)||(section==="forward"&&index===2);if(isScore)return`<label class="long-field">${section==="forward"?"承諾投入度":"會員評分"}<select id="${id}" data-save><option value="">請選擇 1～10 分</option>${Array.from({length:10},(_,score)=>`<option value="${score+1}">${score+1} 分</option>`).join("")}</select></label>`;return`<label class="long-field">委員填寫內容<textarea id="${id}" rows="4" data-save></textarea></label>`}
function localDateTime(){return midtermCalendar.dateTimeInput()}function period(){const end=midtermCalendar.shiftMonthKey(midtermCalendar.monthKey(),-1),start=midtermCalendar.shiftMonthKey(end,-5),[startYear,startMonth]=start.split("-"),[endYear,endMonth]=end.split("-");return`${startYear}年${Number(startMonth)}月至${endYear}年${Number(endMonth)}月`}function light(s){return s>=70?"綠燈":s>=50?"黃燈":s>=30?"紅燈":"黑燈"}function money(n){return`${Math.round(n).toLocaleString("zh-TW")}元`}
function rows(){const m=member.metrics,data=[["缺席次數",m.absence,"0",""],["代理人次數",m.substitutes,"",""],["遲到次數",m.late,"",""],["會員提供的業務引薦數",m.givenIn+m.givenOut,"39",`內：${m.givenIn}　外：${m.givenOut}`],["會員收到的業務引薦數",m.receivedIn+m.receivedOut,"",`內：${m.receivedIn}　外：${m.receivedOut}`],["成交金額",money(m.amount),"",""],["邀請的來賓人數",m.visitors,"2",""],["培訓分數",m.education,"6",""],["一對一會面次數",m.oneToOne,"52",""]];$("#performanceRows").innerHTML=data.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join("")}</tr>`).join("");$("#memberScore").textContent=`${member.score}分・${light(member.score)}`}
function renderGrow(){$("#growSections").innerHTML=grow.map(s=>`<section class="form-card" id="${s.id}"><div class="section-head"><span>${s.no}</span><div><span class="grow-label">${s.label}</span><h2>${s.label}</h2></div></div>${s.questions.map((q,i)=>`<article class="question"><div class="question-head"><span>${i+1}.</span><h3>${q}</h3></div>${systemHint(s.id,i)}${answerField(s.id,i)}</article>`).join("")}</section>`).join("")}
function normalizeScore(value){const match=String(value??"").trim().match(/^(10|[1-9])(?:\s*分)?$/);return match?match[1]:""}
function selectMember(name){member=members.find(x=>x.name===name)||members[0];$("#memberSearch").value=member.name;$("#profession").value=member.profession;rows()}function data(){const o={renewalFoundationSnapshot:window.FulianFoundationInterview?.snapshotText()||"",member:member.name,login:$("#loginUser").value};$$('[data-save]').forEach(e=>o[e.id]=e.value);return o}function save(){localStorage.setItem(KEY,JSON.stringify(data()));$("#saveTime").textContent="正在同步 Supabase…";window.FulianCaseStateStore.flush().then(()=>{$("#saveTime").textContent=`最後同步 ${midtermCalendar.formatTaipeiTime(new Date())}`}).catch(error=>{$("#saveTime").textContent=`同步失敗：${error.message}`});progress()}function restore(o){if(!o)return;if(o.login)$("#loginUser").value=o.login;selectMember(o.member);$$('[data-save]').forEach(e=>{if(o[e.id]!==undefined)e.value=["reality_0","forward_2"].includes(e.id)?normalizeScore(o[e.id]):o[e.id]})}function bind(){$$('[data-save]').forEach(e=>e.oninput=()=>{clearTimeout(timer);timer=setTimeout(save,300)})}function progress(){const a=$$('#growSections [data-save], #summary'),n=a.filter(x=>x.value.trim()).length,p=Math.round(n/Math.max(a.length,1)*100);$("#progressBar").style.width=`${p}%`;$("#progressText").textContent=`${p}%`}
function fileDateStamp(d=new Date()){return midtermCalendar.dateStamp(d)}
function safeFileName(text){return text.replace(/[\\/:*?"<>|]/g,"-").trim()}
function answer(id){return $(id)?.value.trim()||""}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
async function downloadWord(){
  if(!window.FulianInterviewTemplate){toast("中心區模板元件尚未載入，請重新整理後再試");return}
  let foundationSnapshot;
  try {
    foundationSnapshot = await window.FulianFoundationInterview.capture();
    localStorage.setItem(KEY,JSON.stringify({...data(),renewalFoundationSnapshot:foundationSnapshot}));
    await window.FulianCaseStateStore.flush();
  }
  catch(error) { toast(`地基核對失敗：${error.message}`); return; }
  midtermCompletion.begin();
  let blob,fileName;
  try{
    ({blob,fileName}=await window.FulianInterviewTemplate.generate({type:"midterm",applicant:member.name,draft:{...data(),counselor:answer("#counselor")},context:{profession:member.profession,metrics:member.metrics,score:member.score,light:light(member.score),palmsPeriod:period()}}));
  }catch(error){
    midtermCompletion.failure({error});toast(error.message);return;
  }
  try{
    await window.FulianCaseFiles.saveGeneratedWord({caseId:midtermTaskId,caseType:"midterm",blob,fileName,sourceLabel:"期中輔導表單",domain:window.FulianCaseDomain,storage:localStorage,indexedDb:indexedDB,FileClass:File});
    midtermCompletion.success({blob,fileName,caseId:midtermTaskId,memberName:member.name});
    toast("期中輔導已完成並結案");
  }catch(error){
    console.error("案件 Word 保存失敗",error);
    midtermCompletion.failure({blob,fileName,error});
    toast("Word 已產生，但案件尚未完成保存");
  }
}
async function init(){await window.FulianCaseStateStore.ready;$("#memberList").innerHTML=members.map(m=>`<option value="${m.name}">${m.profession}</option>`).join("");renderGrow();$("#meetingDate").value=localDateTime();$("#palmsPeriod").textContent=`PALMS計算週期：${period()}`;$("#counselor").value=$("#loginUser").value;selectMember(member.name);restore(JSON.parse(localStorage.getItem(KEY)||"null"));$("#memberSearch").onchange=e=>{selectMember(e.target.value);save()};$("#loginUser").onchange=()=>{$("#counselor").value=$("#loginUser").value;save()};$("#resetDraft").onclick=()=>{if(confirm("要清除這份尚未完成的期中輔導草稿嗎？已保存的案件附件與完成紀錄不會被刪除。")){localStorage.removeItem(KEY);location.reload()}};$("#downloadWord").onclick=downloadWord;bind();progress()}window.FulianMidtermFormReady=init();
