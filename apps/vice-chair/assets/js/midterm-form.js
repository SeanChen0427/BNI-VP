(async function () {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const domain=window.FulianCaseDomain, calendar=window.FulianCalendarDomain, templates=window.FulianInterviewTemplateDomain;
  const closeHref=()=>['vp','admin'].includes(session.role)?`case-archive.html?case=${encodeURIComponent(taskId)}`:'case-board.html';
  const closeLabel=()=>['vp','admin'].includes(session.role)?'查看結案資料':'回案件清單';
  const part=document.body.dataset.midtermPart, internal=part==='assessment',kind=internal?'midterm-assessment':'midterm-interview';
  const taskId=new URLSearchParams(location.search).get('task');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let task,session,draft={},member=null,timer,busy=false,locked=false;
  const fields=()=>draft[internal?'midtermAssessment':'midtermInterview']||{};
  const state=()=>domain.readWorkflow(localStorage,taskId)||{};
  const draftKey=()=>domain.draftStorageKey(task);
  const message=text=>{$('#saveState').textContent=text;};
  const toast=text=>{const n=$('#toast');n.textContent=text;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),4000);};
  const section=(title,content)=>`<section class="form-card"><h2>${title}</h2>${content}</section>`;
  const input=(key,label,type='text',extra='')=>`<label>${label}<input id="${key}" data-field="${key}" type="${type}" ${extra}></label>`;
  const text=(key,label)=>`<label class="long-field">${label}<textarea id="${key}" data-field="${key}" rows="4"></textarea></label>`;
  const choices=(key,items)=>`<div class="midterm-options">${items.map(([v,t])=>`<label><input type="radio" data-field="${key}" name="${key}" value="${v}">${t}</label>`).join('')}</div>`;
  const checks=(prefix,items)=>`<div class="midterm-options">${items.map((t,i)=>`<label><input type="checkbox" data-field="${prefix}${i+1}" id="${prefix}${i+1}">${t}</label>`).join('')}</div>`;
  const check=(key,label)=>`<div class="midterm-options"><label><input type="checkbox" data-field="${key}" id="${key}">${label}</label></div>`;
  const other=(prefix)=>check(prefix+'OtherSelected','其他')+input(prefix+'Other','其他說明');
  const q=(n,title,content)=>`<article class="midterm-question"><h3>${n}. ${title}</h3>${content}</article>`;
  const rating=(key,items)=>choices(key,items.map((t,i)=>[i+1,t]));
  function serialize(){
    const values={...fields()};
    $$('[data-field]').forEach(el=>{const key=el.dataset.field;if(el.type==='radio'){if(el.checked)values[key]=el.value;}else values[key]=el.type==='checkbox'?el.checked:el.value;});
    const current=domain.readDraft(localStorage,task)||draft;
    return {...current,...draft,midtermPackVersion:1,[internal?'midtermAssessment':'midtermInterview']:values,...(!internal?{member:task.member,profession:member.profession,meetingDate:$('#meetingDate').value,counselor:task.lead||'',companionCounselor:(task.companions||[]).join('、')}: {})};
  }
  function restore(){
    $$('[data-field]').forEach(el=>{const value=fields()[el.dataset.field];if(el.type==='radio')el.checked=String(value)===el.value;else if(el.type==='checkbox')el.checked=value===true;else el.value=value??'';});
    if(!internal){$('#meetingDate').value=draft.meetingDate||task.scheduledAt||calendar.dateTimeInput();}
  }
  async function saveDraft(){
    if(locked)return;
    clearTimeout(timer);draft=serialize();localStorage.setItem(draftKey(),JSON.stringify(draft));message('正在同步草稿…');
    try{await window.FulianCaseStateStore.flush();message('草稿已保存至 Supabase');$('#saveTime').textContent=calendar.formatTaipeiTime(new Date());renderSaved();}
    catch(error){message(`同步失敗：${error.message}`);throw error;}
  }
  function renderInterview(){
    const M=templates.MIDTERM;
    const basic=`<div class="fields two"><label>會員姓名<input value="${esc(task.member)}" readonly></label><label>分會<input value="富聯" readonly></label><label>專業別<input value="${esc(member.profession)}" readonly></label><label>關懷夥伴<input value="${esc([task.lead,...(task.companions||[])].filter(Boolean).join('、'))}" readonly></label><label>關懷日期<input id="meetingDate" type="datetime-local"></label></div>`;
    const questions=q(1,'最近這段時間，在 BNI 裡你覺得最有收穫的是什麼？',checks('gain',M.gains)+other('gain')+text('gainNotes','補充紀錄（選填）'))+
      q(2,'最近有沒有哪件事情，讓你覺得特別開心或有成就感？',text('achievement','會員回應'))+
      q(3,'最近在 BNI 裡，你覺得比較卡的地方是什麼？（可複選）',checks('barrier',M.barriers)+other('barrier')+text('barrierNotes','補充紀錄（選填）'))+
      q(4,'目前在分會裡，你的感受比較像？',checks('feeling',M.feelings)+other('feeling')+text('feelingNotes','補充紀錄（選填）'))+
      q(5,'目前在分會裡，你比較常互動的夥伴有哪些？',text('partners','會員回應'))+
      q(6,'如果 1～5 分代表目前投入程度，你會給自己幾分？',choices('engagement',[1,2,3,4,5].map(n=>[n,n+' 分'])))+
      q(7,'如果可以再往前提升 1 分，你覺得最需要改變的是什麼？',text('improvement','會員回應'))+
      q(8,'如果接下來只改善一件事情，你最想先改善什麼？',rating('priority',M.priorities))+
      q(9,'你覺得目前最需要哪些支持？（可複選）',checks('support',M.supports)+other('support'))+
      q(10,'接下來 30 天，你願意先開始的一個小行動是什麼？',checks('action',M.actions)+other('action'))+
      q(11,'如果今天要決定是否續約，你的意願大約是？',rating('willingness',M.willingness))+
      q(12,'影響你續約最重要的原因是？',text('renewalReason','會員回應'))+
      q(13,'假如你願意繼續與分會會員合作，你希望分會支持你什麼？',text('chapterSupport','會員回應'));
    $('#formSections').innerHTML=section('一、基本資料',basic)+section('二、會員關懷對話（15–20 分鐘）',questions);
  }
  function renderAssessment(){
    const M=templates.MIDTERM;
    $('#formSections').innerHTML=section('會員目前狀態',`<p>本案會員：<b>${esc(task.member)}</b></p><p class="midterm-note">此處為本次關懷的委員評估，不會覆寫正式 PALMS 分數或系統燈號。</p><h3>會員目前狀態燈號</h3>${rating('light',M.lights)}<h3>會員目前能量狀態</h3>${rating('energy',M.energy)}`)+
      section('建議後續安排',checks('arrangement',M.arrangements)+other('arrangement'))+
      section('建議會員可參與培訓','<h3>1. 基礎培訓</h3>'+checks('training',M.trainings.slice(0,2))+'<h3>2. 技能培訓</h3>'+M.trainings.slice(2,9).map((t,i)=>check('training'+(i+3),t)).join('')+'<h3>3. 職務培訓</h3>'+M.trainings.slice(9).map((t,i)=>check('training'+(i+10),t)).join(''))+
      section('後續追蹤機制',input('nextCareDate','下次關懷日期','date')+'<h3>下次追蹤重點</h3>'+checks('focus',M.focuses)+other('focus')+input('owner','關懷負責人')+text('summary','關懷總結'))+
      section('訪談者簽名與日期',`<p>簽名可留空，下載後親簽。</p><div class="fields two">${input('interviewer','訪談者簽名姓名')}${input('companion','陪訪者簽名姓名（選填）')}${input('assessmentDate','內部評估日期','date')}</div>`);
  }
  function missing(){
    const v=fields(),out=[];
    const need=(key,label)=>{if(!String(v[key]??'').trim())out.push({key,label});};
    const any=(prefix,count,label)=>{if(!Array.from({length:count},(_,i)=>v[prefix+(i+1)]).some(Boolean)&&!v[prefix+'OtherSelected'])out.push({key:prefix+'1',label});};
    if(internal){
      for(const [key,label] of Object.entries({light:'會員狀態燈號',energy:'會員能量狀態',nextCareDate:'下次關懷日期',owner:'關懷負責人',summary:'關懷總結',assessmentDate:'內部評估日期'}))need(key,label);
      any('arrangement',6,'建議後續安排');any('focus',7,'下次追蹤重點');
    }else{
      if(!$('#meetingDate').value)out.push({key:'meetingDate',label:'關懷日期'});
      for(const [key,label] of Object.entries({achievement:'第 2 題成就感',partners:'第 5 題互動夥伴',engagement:'第 6 題投入程度',improvement:'第 7 題提升方向',priority:'第 8 題優先改善',willingness:'第 11 題續約意願',renewalReason:'第 12 題續約原因',chapterSupport:'第 13 題分會支持'}))need(key,label);
      for(const [prefix,count,label] of [['gain',7,'第 1 題收穫'],['barrier',10,'第 3 題卡關'],['feeling',7,'第 4 題感受'],['support',8,'第 9 題支持'],['action',6,'第 10 題行動']])any(prefix,count,label);
      if(v.engagement&&!['1','2','3','4','5'].includes(String(v.engagement)))out.push({key:'engagement',label:'1～5 分投入程度'});
    }
    for(const prefix of (internal?['arrangement','focus']:['gain','barrier','feeling','support','action']))if(v[prefix+'OtherSelected'])need(prefix+'Other','其他說明');
    return out;
  }
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
  async function downloadSaved(documentKind){try{const file=await window.FulianCaseFiles.getCaseFile({caseId:taskId,documentKind,indexedDb:indexedDB});if(!file)throw new Error('尚無已保存文件');download(file,file.name);}catch(error){toast(error.message);}}
  function renderSaved(){
    const s=state(),docs=s.midtermDocuments||{},interview=docs['midterm-interview'],assessment=docs['midterm-assessment'],ready=domain.documentPackReady(docs,'midterm'),panel=$('#savedDocuments');
    $('#assessmentLink').href=`midterm-assessment.html?task=${encodeURIComponent(taskId)}`;$('#assessmentLink').setAttribute('aria-disabled',String(!interview));
    $('#feedbackLink').href=closeHref();$('#feedbackLink').setAttribute('aria-disabled',String(!ready));
    if(!interview&&!assessment){panel.hidden=true;return;}
    panel.hidden=false;panel.innerHTML=`<h2>${ready?'兩份期中關懷文件已保存，案件已結案':'會員訪談已保存，待內部評估'}</h2><p>同一案件，兩份 Word 分開下載及回傳中心區。</p><div class="midterm-downloads">${interview?'<button type="button" data-document="midterm-interview">下載會員期中關懷訪談表</button>':''}${internal&&assessment?'<button type="button" data-document="midterm-assessment">下載委員會內部評估表</button>':''}</div>${internal?(ready?`<a class="midterm-next" href="${closeHref()}">${closeLabel()} →</a>`:''):`<a class="midterm-next" href="midterm-assessment.html?task=${encodeURIComponent(taskId)}">結束共同訪談，前往內部評估 →</a>`}`;
    panel.querySelectorAll('[data-document]').forEach(n=>n.onclick=()=>downloadSaved(n.dataset.document));
  }
  async function complete(){
    if(busy||locked)return;if(internal&&!['vp','admin'].includes(session.role)&&task.lead!==session.name){toast('請由主要負責人保存最終評估並結案；陪訪可先保存草稿。');return;}draft=serialize();const missingFields=missing();if(missingFields.length){toast('尚未完成：'+missingFields.slice(0,3).map(x=>x.label).join('、'));const key=missingFields[0].key;const n=document.getElementById(key)||$$('[data-field]').find(n=>n.dataset.field===key);n?.scrollIntoView({behavior:'smooth',block:'center'});n?.focus();return;}
    busy=true;$('#downloadWord').disabled=true;message('正在保存及產生 Word…');
    try{
      await saveDraft();
      const {blob,fileName}=await window.FulianInterviewTemplate.generate({type:internal?'midterm-assessment':'midterm',applicant:task.member,draft,context:internal?{}:{profession:member.profession}});
      await window.FulianCaseFiles.saveGeneratedWord({caseId:taskId,blob,fileName,sourceLabel:internal?'委員會內部評估':'期中關懷會員訪談',caseType:'midterm',documentKind:kind,domain,storage:localStorage,indexedDb:indexedDB,FileClass:File});
      download(blob,fileName);renderSaved();message(internal?'兩份文件已保存，案件已結案':'會員訪談已保存，待委員填寫內部評估');$('#savedDocuments').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(error){message('尚未完成保存：'+error.message);toast(error.message);}finally{busy=false;$('#downloadWord').disabled=false;}
  }
  try{
    await Promise.all([window.FulianTaskStore.ready,window.FulianCaseStateStore.ready]);
    task=window.FulianTaskStore.all().find(t=>t.id===taskId&&t.type==='midterm');if(!task)throw new Error('找不到指定期中關懷案件，請由案件清單開啟。');
    session=window.FulianAuth.getSession();const assigned=domain.isAssignedTo(task,session.name),leader=['vp','admin'].includes(session.role);
    if(!leader&&!assigned)throw new Error('只有副主席或本案受指派委員可填寫此表。');
    if(internal&&task.member===session.name)throw new Error('申請人本人須迴避內部評估，請由其他受指派委員填寫。');
    draft=domain.readDraft(localStorage,task)||{};const s=state();
    if(!domain.documentPackRequired(task,s,draft)){throw new Error('此案已保存舊版歷史文件，請由案件流程下載原件或繼續原流程。');}
    if(internal&&!s.midtermInterviewSaved)throw new Error('請先成功保存會員期中關懷訪談表，再進入內部評估。');
    locked=Boolean(task.completed||s.closed||s.feedbackCallId||s.feedbackNotified||domain.hasFeedback(s)||s.votingOpen);
    $('#loginIdentity').textContent=session.name;$('#interviewLink').href=`midterm-form.html?task=${encodeURIComponent(taskId)}`;
    if(internal)renderAssessment();else{
      const response=await fetch('/api/analysis-snapshot',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.message||'正式會員資料載入失敗');member=data.members?.find(m=>m.name===task.member);if(!member)throw new Error('找不到本案會員的正式資料，請由副主席核對。');renderInterview();
    }
    restore();$('#midtermForm').hidden=false;renderSaved();
    $('#midtermForm').addEventListener('input',()=>{if(locked)return;draft=serialize();clearTimeout(timer);timer=setTimeout(()=>saveDraft().catch(()=>{}),400);});
    $('#saveDraft').onclick=()=>saveDraft().catch(e=>toast(e.message));$('#downloadWord').onclick=complete;
    if(internal&&!leader&&task.lead!==session.name){$('#downloadWord').disabled=true;$('#downloadWord').textContent='待主要負責人保存並結案';}
    if(locked){$$('#midtermForm input,#midtermForm textarea,#midtermForm button').forEach(n=>n.disabled=true);message('案件已結案，文件保留原件，可分別下載');}else message('新版期中關懷表單已就緒');
  }catch(error){$('#loadError').hidden=false;$('#loadError').textContent=error.message;$('#midtermForm').hidden=true;message('無法開啟表單');}
})();
