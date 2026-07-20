const midtermAuthSession=JSON.parse(sessionStorage.getItem("fulian-auth-session-v1")||"null");if(!midtermAuthSession)location.replace("login.html?next=midterm-form.html");
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];const midtermTaskId=new URLSearchParams(location.search).get("task");if(!midtermTaskId)location.replace("case-board.html?new=midterm");const KEY=window.FulianCaseDomain.draftStorageKey({id:midtermTaskId,type:"midterm"});
const midtermCompletion=window.FulianInterviewCompletion.setup({formLabel:"期中輔導",requiresDecision:false});
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
function localDateTime(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}function period(){const n=new Date(),end=new Date(n.getFullYear(),n.getMonth()-1,1),start=new Date(end.getFullYear(),end.getMonth()-5,1);return`${start.getFullYear()}年${start.getMonth()+1}月至${end.getFullYear()}年${end.getMonth()+1}月`}function light(s){return s>=70?"綠燈":s>=50?"黃燈":s>=30?"紅燈":"黑燈"}function money(n){return`${Math.round(n).toLocaleString("zh-TW")}元`}
function rows(){const m=member.metrics,data=[["缺席次數",m.absence,"0",""],["代理人次數",m.substitutes,"",""],["遲到次數",m.late,"",""],["會員提供的業務引薦數",m.givenIn+m.givenOut,"39",`內：${m.givenIn}　外：${m.givenOut}`],["會員收到的業務引薦數",m.receivedIn+m.receivedOut,"",`內：${m.receivedIn}　外：${m.receivedOut}`],["成交金額",money(m.amount),"",""],["邀請的來賓人數",m.visitors,"2",""],["培訓分數",m.education,"6",""],["一對一會面次數",m.oneToOne,"52",""]];$("#performanceRows").innerHTML=data.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join("")}</tr>`).join("");$("#memberScore").textContent=`${member.score}分・${light(member.score)}`}
function renderGrow(){$("#growSections").innerHTML=grow.map(s=>`<section class="form-card" id="${s.id}"><div class="section-head"><span>${s.no}</span><div><span class="grow-label">${s.label}</span><h2>${s.label}</h2></div></div>${s.questions.map((q,i)=>`<article class="question"><div class="question-head"><span>${i+1}.</span><h3>${q}</h3></div>${systemHint(s.id,i)}${answerField(s.id,i)}</article>`).join("")}</section>`).join("")}
function normalizeScore(value){const match=String(value??"").trim().match(/^(10|[1-9])(?:\s*分)?$/);return match?match[1]:""}
function selectMember(name){member=members.find(x=>x.name===name)||members[0];$("#memberSearch").value=member.name;$("#profession").value=member.profession;rows()}function data(){const o={member:member.name,login:$("#loginUser").value};$$('[data-save]').forEach(e=>o[e.id]=e.value);return o}function save(){localStorage.setItem(KEY,JSON.stringify(data()));const d=new Date();$("#saveTime").textContent=`最後儲存 ${d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;progress()}function restore(o){if(!o)return;if(o.login)$("#loginUser").value=o.login;selectMember(o.member);$$('[data-save]').forEach(e=>{if(o[e.id]!==undefined)e.value=["reality_0","forward_2"].includes(e.id)?normalizeScore(o[e.id]):o[e.id]})}function bind(){$$('[data-save]').forEach(e=>e.oninput=()=>{clearTimeout(timer);timer=setTimeout(save,300)})}function progress(){const a=$$('#growSections [data-save], #summary'),n=a.filter(x=>x.value.trim()).length,p=Math.round(n/Math.max(a.length,1)*100);$("#progressBar").style.width=`${p}%`;$("#progressText").textContent=`${p}%`}
function fileDateStamp(d=new Date()){return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`}
function safeFileName(text){return text.replace(/[\\/:*?"<>|]/g,"-").trim()}
function answer(id){return $(id)?.value.trim()||""}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
async function downloadWord(){
  if(typeof docx==="undefined"){toast("Word 元件尚未載入，請重新整理後再試");return}
  midtermCompletion.begin();
  const{Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,AlignmentType,PageOrientation,ShadingType}=docx;
  const font="Arial Unicode MS",fontSpec={ascii:font,hAnsi:font,eastAsia:font,cs:font};
  const run=(text,opts={})=>new TextRun({text:String(text??""),font:fontSpec,size:opts.size||22,bold:!!opts.bold,color:opts.color});
  const para=(text="",opts={})=>new Paragraph({alignment:opts.align,spacing:{before:opts.before||0,after:opts.after===undefined?100:opts.after,line:320},children:[run(text,opts)]});
  const noBorders={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}};
  const metaCell=(label,value)=>new TableCell({width:{size:50,type:WidthType.PERCENTAGE},margins:{top:100,bottom:100,left:120,right:120},children:[new Paragraph({children:[run(label,{bold:true}),run(value||"（未填寫）")]})]});
  const meeting=$("#meetingDate").value?new Date($("#meetingDate").value).toLocaleString("zh-TW"):"（未填寫）";
  const meta=new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:noBorders,rows:[
    new TableRow({children:[metaCell("會談日期：",meeting),metaCell("分會：","富聯")]}),
    new TableRow({children:[metaCell("會員姓名：",member.name),metaCell("專業別：",member.profession)]}),
    new TableRow({children:[metaCell("輔導專員：",$("#counselor").value),metaCell("陪訪專員：",answer("#companionCounselor"))]})
  ]});
  const m=member.metrics;
  const performance=[
    ["缺席次數",m.absence,"0",""],["代理人次數",m.substitutes,"",""],["遲到次數",m.late,"",""],
    ["會員提供的業務引薦數",m.givenIn+m.givenOut,"39",`內：${m.givenIn}　外：${m.givenOut}`],
    ["會員收到的業務引薦數",m.receivedIn+m.receivedOut,"",`內：${m.receivedIn}　外：${m.receivedOut}`],
    ["成交金額",money(m.amount),"",""],["邀請的來賓人數",m.visitors,"2",""],["培訓分數",m.education,"6",""],["一對一會面次數",m.oneToOne,"52",""]
  ];
  const cell=(text,header=false)=>new TableCell({shading:header?{fill:"A91419",type:ShadingType.CLEAR}:undefined,margins:{top:90,bottom:90,left:100,right:100},children:[para(text,{bold:header,color:header?"FFFFFF":undefined,after:0})]});
  const performanceTable=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
    new TableRow({tableHeader:true,children:[cell("過去六個月副主席報告",true),cell("會員表現",true),cell("紅綠燈標準\n70分",true),cell("備註",true)]}),
    ...performance.map(r=>new TableRow({children:r.map(x=>cell(x))}))
  ]});
  const children=[
    new Paragraph({alignment:AlignmentType.RIGHT,children:[run("V.4　：20241126",{size:18})]}),
    new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:240},children:[run("363 會員留任計畫－期中輔導（GROW）",{size:32,bold:true,color:"A91419"})]}),
    meta,para(`PALMS 表計算週期：${period()}`,{bold:true,before:160}),
    para(`個人紅綠燈：${member.score} 分・${light(member.score)}（紅綠燈標準：70 分）`,{bold:true}),performanceTable
  ];
  grow.forEach(section=>{
    children.push(para(section.label,{bold:true,size:27,color:"A91419",before:240}));
    section.questions.forEach((question,index)=>{
      children.push(para(`${index+1}. ${question}`,{bold:true}),para(answer(`#${section.id}_${index}`)||"（未填寫）",{color:"333333",after:180}));
    });
  });
  children.push(para("總結與建議",{bold:true,size:27,color:"A91419",before:240}),para(answer("#summary")||"（未填寫）"),para(`輔導專員：${$("#counselor").value}`),para(`陪訪專員：${answer("#companionCounselor")||"（無）"}`));
  const wordDocument=new Document({styles:{default:{document:{run:{font:fontSpec,size:22},paragraph:{spacing:{line:320}}}}},sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.PORTRAIT},margin:{top:720,right:720,bottom:720,left:720}}},children}]});
  const blob=await Packer.toBlob(wordDocument),fileName=`363留員計畫-期中輔導-${safeFileName(member.name)}-${fileDateStamp()}.docx`;
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
function init(){$("#memberList").innerHTML=members.map(m=>`<option value="${m.name}">${m.profession}</option>`).join("");renderGrow();$("#meetingDate").value=localDateTime();$("#palmsPeriod").textContent=`PALMS計算週期：${period()}`;$("#counselor").value=$("#loginUser").value;selectMember(member.name);restore(JSON.parse(localStorage.getItem(KEY)||"null"));$("#memberSearch").onchange=e=>{selectMember(e.target.value);save()};$("#loginUser").onchange=()=>{$("#counselor").value=$("#loginUser").value;save()};$("#resetDraft").onclick=()=>{if(confirm("要清除這份尚未完成的期中輔導草稿嗎？已保存的案件附件與完成紀錄不會被刪除。")){localStorage.removeItem(KEY);location.reload()}};$("#downloadWord").onclick=downloadWord;bind();progress()}init();
