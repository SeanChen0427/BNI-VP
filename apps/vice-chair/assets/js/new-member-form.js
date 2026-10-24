const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],newMemberTaskId=new URLSearchParams(location.search).get("task");if(!newMemberTaskId)location.replace("case-board.html?new=new");const STORE_KEY=window.FulianCaseDomain.draftStorageKey({id:newMemberTaskId,type:"new"});
const newMemberCompletion=window.FulianInterviewCompletion.setup({formLabel:"新會員訪談"});
const newMemberCalendar=window.FulianCalendarDomain;
let applicants=[{name:"申請者資料載入中"}];
let currentApplicant=applicants[0],saveTimer,newMemberTrainingPicker;
function render(){window.FulianMembershipForm.render($("#membershipSections"))}
function localDateTime(){return newMemberCalendar.dateTimeInput()}
function localDate(){return newMemberCalendar.dateInput()}
function selectApplicant(name,preserve=false){currentApplicant=applicants.find(x=>x.name===name)||applicants[0];$("#applicantSearch").value=currentApplicant.name;if(!preserve)$("#applicantSignature").value=currentApplicant.name}
function serialize(){const out={...JSON.parse(localStorage.getItem(STORE_KEY)||"{}"),formVersion:window.FulianMembershipForm.version,trainingSelections:newMemberTrainingPicker?.serialize()||{},applicant:currentApplicant.name,login:$("#loginUser").value};$$('[data-save]').forEach(el=>{if(el.type==="radio"){if(el.checked)out[`radio:${el.name}`]=el.value}else if(el.type==="checkbox")out[el.id]=el.checked;else out[el.id]=el.value});return out}
function restore(data){if(!data)return;$("#membershipVersionNotice").hidden=data.formVersion===window.FulianMembershipForm.version;if(data.login)$("#loginUser").value=data.login;selectApplicant(data.applicant||applicants[0].name,true);$$('[data-save]').forEach(el=>{if(el.type==="radio")el.checked=data[`radio:${el.name}`]===el.value;else if(el.type==="checkbox"&&data[el.id]!==undefined)el.checked=data[el.id];else if(data[el.id]!==undefined)el.value=data[el.id]});newMemberTrainingPicker?.restore(data.trainingSelections)}
function saveDraft(){localStorage.setItem(STORE_KEY,JSON.stringify(serialize()));$("#saveState").textContent="正在同步 Supabase…";window.FulianCaseStateStore.flush().then(()=>{$("#saveState").textContent="草稿已保存至 Supabase";$("#saveTime").textContent=`最後同步 ${newMemberCalendar.formatTaipeiTime(new Date())}`}).catch(error=>{$("#saveState").textContent=`同步失敗：${error.message}`});updateProgress()}
function bindInputs(){$$('[data-save]').forEach(el=>el.oninput=()=>{$("#saveState").textContent="儲存中…";clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,300)});$$('[data-save]').forEach(el=>el.onchange=el.oninput)}
function updateProgress(){const textFields=$$('textarea[data-save],input[data-save]:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'),filled=textFields.filter(x=>x.value.trim()).length,groups=new Set($$('input[type="radio"][data-save]').map(x=>x.name)),chosen=[...groups].filter(n=>document.querySelector(`input[name="${n}"]:checked`)).length,checks=$$('input[type="checkbox"][data-save]'),checked=checks.filter(x=>x.checked).length,total=textFields.length+groups.size+checks.length,p=Math.round((filled+chosen+checked)/Math.max(total,1)*100);$("#progressBar").style.width=`${p}%`;$("#progressText").textContent=`${p}%`;const count=Array.from({length:20},(_,i)=>answer(`#contactName${i+1}`)||answer(`#contactIndustry${i+1}`)||answer(`#contactRelation${i+1}`)).filter(Boolean).length;$("#contactCount").textContent=`已填 ${count}／20 位`}
function answer(selector){return $(selector)?.value.trim()||""}function radioValue(name){return document.querySelector(`input[name="${name}"]:checked`)?.value||""}function mark(value,target){return value===target?"■":"□"}function check(id){return window.FulianInterviewWordDomain.checkboxMark(document.getElementById(id))}function fileDateStamp(d=new Date()){return newMemberCalendar.dateStamp(d)}function safeFileName(text){return text.replace(/[\\/:*?"<>|]/g,"-").trim()}function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
async function downloadWord(){
  if(!window.FulianInterviewTemplate){toast("公版產檔元件尚未載入，請重新整理後再試");return}
  const referrerSelect=$("#referrerName"),referrerName=answer("#referrerName");
  if(!referrerName||![...referrerSelect.options].some(option=>option.value===referrerName&&option.dataset.memberId)){
    toast("請先從正式會員名單選擇引薦人");
    referrerSelect.focus();
    return;
  }
  newMemberCompletion.begin();
  let blob,fileName;
  try{
    const draft={...serialize(),leadInterviewer:answer("#leadInterviewer")};
    clearTimeout(saveTimer);localStorage.setItem(STORE_KEY,JSON.stringify(draft));await window.FulianCaseStateStore.flush();
    ({blob,fileName}=await window.FulianInterviewTemplate.generate({type:"new",applicant:currentApplicant.name,draft}));
  }catch(error){
    newMemberCompletion.failure({error});
    toast(error.message||"中心區公版產檔失敗，請稍後重試");
    return;
  }
  try{
    await window.FulianCaseFiles.saveGeneratedWord({caseId:newMemberTaskId,blob,fileName,sourceLabel:"新會員訪談表單",domain:window.FulianCaseDomain,storage:localStorage,indexedDb:indexedDB,FileClass:File});
    newMemberCompletion.success({blob,fileName,caseId:newMemberTaskId,memberName:currentApplicant.name});
    toast("訪談已完成，案件待發送委員回饋");
  }catch(error){
    console.error("案件 Word 保存失敗",error);
    newMemberCompletion.failure({blob,fileName,error});
    toast("Word 已產生，但案件尚未完成保存");
  }
}
function bindRelationFields(){["guest1Relation","guest2Relation"].forEach(id=>{const select=$(`#${id}`),other=$(`#${id}Other`);if(!select||!other)return;const sync=()=>{other.hidden=select.value!=="其他";if(!other.hidden)other.focus()};select.addEventListener("change",sync);sync()})}
async function init(){await window.FulianCaseStateStore.ready;render();newMemberTrainingPicker=window.FulianTrainingPicker.mount([["mspUpDate","msp_up"],["mspDownDate","msp_down"],["mspUpDate2","msp_up"],["mspDownDate2","msp_down"],["sessionDate1","exchange"]]);$("#applicantList").innerHTML=applicants.map(x=>`<option value="${x.name}"></option>`).join("");$("#meetingDate").value=localDateTime();$("#signatureDate").value=localDate();$("#leadInterviewer").value=$("#loginUser").value;$("#witness1").value=$("#loginUser").value;selectApplicant(currentApplicant.name);restore(JSON.parse(localStorage.getItem(STORE_KEY)||"null"));bindRelationFields();$("#witness2").value=answer("#companionInterviewer");$("#witness3").value=answer("#secondCompanion");$("#applicantSearch").onchange=e=>{selectApplicant(e.target.value);saveDraft()};$("#loginUser").onchange=()=>{$("#leadInterviewer").value=$("#loginUser").value;$("#witness1").value=$("#loginUser").value;saveDraft()};$("#resetDraft").onclick=()=>{if(confirm("要清除這份尚未完成的新會員訪談草稿嗎？已保存的案件附件與完成紀錄不會被刪除。")){localStorage.removeItem(STORE_KEY);location.reload()}};$("#downloadWord").onclick=downloadWord;bindInputs();$("#companionInterviewer").addEventListener("input",()=>{$("#witness2").value=answer("#companionInterviewer")});$("#secondCompanion").addEventListener("input",()=>{$("#witness3").value=answer("#secondCompanion")});updateProgress()}
window.FulianNewMemberFormReady=init();
