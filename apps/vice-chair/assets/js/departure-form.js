const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],departureTaskId=new URLSearchParams(location.search).get("task");if(!departureTaskId)location.replace("case-board.html?new=departure");const KEY=window.FulianCaseDomain.draftStorageKey({id:departureTaskId,type:"departure"});
const departureCompletion=window.FulianInterviewCompletion.setup({formLabel:"離會訪談",requiresDecision:false});
let members=[{name:"正式資料載入中",profession:""}];
let member=members[0],timer;
const questions=[
  [1,"你在 BNI 有什麼收穫？","gains","text"],
  [2,"關於 BNI，你最喜歡什麼呢？","likes","text"],
  [3,"你是否覺得你已充分了解有關 BNI 的各項培訓活動，以及能帶給你的好處呢？","trainingUnderstood","radio","trainingUnderstandingNotes"],
  [4,"你是否有參加 MSP 培訓？","mspAttended","radio","mspNotes"],
  [5,"您是否已辦妥離會手續（Email 通知副主席）？","procedureDone","radio","emailNoticeDate"],
  [6,"什麼原因讓你決定要離開？","departureReason","text"],
  [7,"什麼是你在 BNI 裡面不喜歡的事項？如果有，那是什麼？","dislikes","text"],
  [8,"你有做過什麼事來改變它嗎？如果有，那是什麼？","improvementAttempts","text"],
  [9,"提醒您，根據 BNI 總政策，離開分會後，亦即 BNI 公司取消會員對於名片、網站、標誌、名牌等商標使用之權利，敬請遵守以免觸犯刑法。","trademarkUnderstood","check"]
];
function localDate(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function localDateTime(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function answer(id){return $(`#${id}`)?.value.trim()||""}
function radio(name){return document.querySelector(`input[name="${name}"]:checked`)?.value||""}
function mark(value,target){return value===target?"■":"□"}
function safe(text){return String(text||"").replace(/[\\/:*?"<>|]/g,"-").trim()}
function stamp(){const d=new Date();return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`}
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
function selectMember(name,preserve=false){member=members.find(x=>x.name===name)||members[0];$("#memberSearch").value=member.name;$("#profession").value=member.profession;if(!preserve)$("#departureDate").value=answer("departureDate")||localDate()}
function serialize(){const out={member:member.name,login:$("#loginUser").value};$$('[data-save]').forEach(el=>{if(el.type==="radio"){if(el.checked)out[`radio:${el.name}`]=el.value}else if(el.type==="checkbox")out[el.id]=el.checked;else out[el.id]=el.value});return out}
function restore(data){if(!data)return;if(data.login)$("#loginUser").value=data.login;selectMember(data.member||members[0].name,true);$$('[data-save]').forEach(el=>{if(el.type==="radio")el.checked=data[`radio:${el.name}`]===el.value;else if(el.type==="checkbox"&&data[el.id]!==undefined)el.checked=data[el.id];else if(data[el.id]!==undefined)el.value=data[el.id]})}
function progress(){const fields=$$('textarea[data-save],input[data-save]:not([type="radio"]):not([type="checkbox"]),select[data-save]'),filled=fields.filter(x=>x.value.trim()).length,groups=[...new Set($$('input[type="radio"][data-save]').map(x=>x.name))],chosen=groups.filter(n=>radio(n)).length,checks=$$('input[type="checkbox"][data-save]'),checked=checks.filter(x=>x.checked).length,total=fields.length+groups.length+checks.length,p=Math.round((filled+chosen+checked)/Math.max(total,1)*100);$("#progressBar").style.width=`${p}%`;$("#progressText").textContent=`${p}%`}
function save(){localStorage.setItem(KEY,JSON.stringify(serialize()));$("#saveState").textContent="正在同步 Supabase…";window.FulianCaseStateStore.flush().then(()=>{const d=new Date();$("#saveState").textContent="草稿已保存至 Supabase";$("#saveTime").textContent=`最後同步 ${d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`}).catch(error=>{$("#saveState").textContent=`同步失敗：${error.message}`});progress()}
function bind(){$$('[data-save]').forEach(el=>{const handler=()=>{$("#saveState").textContent="儲存中…";clearTimeout(timer);timer=setTimeout(save,300)};el.addEventListener("input",handler);el.addEventListener("change",handler)})}
function questionResult(q){const[, ,id,type,extra]=q;if(type==="text")return answer(id)||"（未填寫）";if(type==="check")return`${$("#trademarkUnderstood").checked?"■":"□"} 會員已了解`;const value=radio(id),suffix=extra?`\n補充：${answer(extra)||"未填寫"}`:"";return`${mark(value,"是")} 是　${mark(value,"否")} 否${suffix}`}
async function downloadWord(){
  if(typeof docx==="undefined"){toast("Word 元件尚未載入，請重新整理後再試");return}
  departureCompletion.begin();
  const{Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,AlignmentType,PageOrientation}=docx,font="Arial Unicode MS",fontSpec={ascii:font,hAnsi:font,eastAsia:font,cs:font};
  const run=(text,options={})=>new TextRun({text:String(text??""),font:fontSpec,size:options.size||21,bold:!!options.bold,color:options.color,break:options.break});
  const para=(text="",options={})=>new Paragraph({alignment:options.align,spacing:{before:options.before||0,after:options.after===undefined?100:options.after,line:300},children:String(text).split("\n").flatMap((line,i)=>[i?run("",{break:1}):null,run(line,options)].filter(Boolean))});
  const borders={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}};
  const cell=(label,value)=>new TableCell({width:{size:50,type:WidthType.PERCENTAGE},margins:{top:90,bottom:90,left:100,right:100},children:[new Paragraph({children:[run(label,{bold:true}),run(value||"（未填寫）")]})]});
  const meta=new Table({width:{size:100,type:WidthType.PERCENTAGE},borders,rows:[new TableRow({children:[cell("分會名稱：","富聯"),cell("會員姓名：",member.name)]}),new TableRow({children:[cell("專業類別：",member.profession),cell("離會日期：",answer("departureDate"))]}),new TableRow({children:[cell("訪談人員：",[answer("interviewer"),answer("companion")].filter(Boolean).join("、")),cell("訪談日期：",answer("interviewDate"))]})]});
  const children=[new Paragraph({alignment:AlignmentType.RIGHT,children:[run("V.2.1",{bold:true,size:19})]}),new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:220},children:[run("離會訪談表",{bold:true,size:32,color:"A91419"})]}),meta];
  questions.forEach(q=>{children.push(para(`${q[0]}. ${q[1]}`,{bold:true,before:140}),para(questionResult(q)))});
  children.push(para(`主席簽名：${answer("presidentSignature")||"____________________"}`,{before:220}),para(`副主席簽名：${answer("vicePresidentSignature")||"____________________"}`),para(`董事顧問簽名：${answer("directorSignature")||"____________________"}`),para(`文件確認日期：${answer("signatureDate")||"____________________"}`));
  const documentFile=new Document({styles:{default:{document:{run:{font:fontSpec,size:21},paragraph:{spacing:{line:300}}}}},sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:700,right:700,bottom:700,left:700}}},children}]});
  const blob=await Packer.toBlob(documentFile),fileName=`離會訪談表-${safe(member.name)}-${stamp()}.docx`;
  try{
    await window.FulianCaseFiles.saveGeneratedWord({caseId:departureTaskId,caseType:"departure",blob,fileName,sourceLabel:"離會訪談表單",domain:window.FulianCaseDomain,storage:localStorage,indexedDb:indexedDB,FileClass:File});
    departureCompletion.success({blob,fileName,caseId:departureTaskId,memberName:member.name});
    toast("離會訪談已完成並結案");
  }catch(error){
    console.error("案件 Word 保存失敗",error);
    departureCompletion.failure({blob,fileName,error});
    toast("Word 已產生，但案件尚未完成保存");
  }
}
async function init(){await window.FulianCaseStateStore.ready;$("#memberList").innerHTML=members.map(x=>`<option value="${x.name}">${x.profession}</option>`).join("");$("#interviewDate").value=localDateTime();$("#departureDate").value=localDate();$("#signatureDate").value=localDate();$("#interviewer").value=$("#loginUser").value;$("#vicePresidentSignature").value="";selectMember(member.name);restore(JSON.parse(localStorage.getItem(KEY)||"null"));$("#memberSearch").addEventListener("change",e=>{selectMember(e.target.value);save()});$("#loginUser").addEventListener("change",()=>{$("#interviewer").value=$("#loginUser").value;save()});$("#resetDraft").onclick=()=>{if(confirm("要清除這份尚未完成的離會訪談草稿嗎？已保存的案件附件與完成紀錄不會被刪除。")){localStorage.removeItem(KEY);location.reload()}};$("#downloadWord").onclick=downloadWord;bind();progress()}
window.FulianDepartureFormReady=init();
