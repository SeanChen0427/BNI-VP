(async function () {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const domain=window.FulianCaseDomain, calendar=window.FulianCalendarDomain, templates=window.FulianInterviewTemplateDomain;
  const part=document.body.dataset.renewalPart, internal=part==='assessment',kind=internal?'renewal-assessment':'renewal-interview';
  const taskId=new URLSearchParams(location.search).get('task');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let task,session,draft={},metrics=null,member=null,timer,trainingPicker,busy=false,locked=false;
  const fields=()=>draft[internal?'renewalAssessment':'renewalInterview']||{};
  const state=()=>domain.readWorkflow(localStorage,taskId)||{};
  const draftKey=()=>domain.draftStorageKey(task);
  const message=text=>{$('#saveState').textContent=text;};
  const toast=text=>{const n=$('#toast');n.textContent=text;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),4000);};
  const section=(title,content)=>`<section class="form-card"><h2>${title}</h2>${content}</section>`;
  const input=(key,label,type='text',extra='')=>`<label>${label}<input id="${key}" data-field="${key}" type="${type}" ${extra}></label>`;
  const text=(key,label)=>`<label class="long-field">${label}<textarea id="${key}" data-field="${key}" rows="4"></textarea></label>`;
  const choices=(key,items)=>`<div class="renewal-options">${items.map(([v,t])=>`<label><input type="radio" data-field="${key}" name="${key}" value="${v}">${t}</label>`).join('')}</div>`;
  const checks=(prefix,items)=>`<div class="renewal-options">${items.map((t,i)=>`<label><input type="checkbox" data-field="${prefix}${i+1}" id="${prefix}${i+1}">${t}</label>`).join('')}</div>`;
  const check=(key,label)=>`<div class="renewal-options"><label><input type="checkbox" data-field="${key}" id="${key}">${label}</label></div>`;
  const other=(prefix)=>check(prefix+'OtherSelected','其他')+input(prefix+'Other','其他說明');
  const q=(n,title,content)=>`<article class="renewal-question"><h3>${n}. ${title}</h3>${content}</article>`;
  const rating=(key,items)=>choices(key,items.map((t,i)=>[i+1,t]));
  function serialize(){
    const values={...fields()};
    $$('[data-field]').forEach(el=>{const key=el.dataset.field;if(el.type==='radio'){if(el.checked)values[key]=el.value;}else values[key]=el.type==='checkbox'?el.checked:el.value;});
    const current=domain.readDraft(localStorage,task)||draft;
    return {...current,...draft,renewalPackVersion:1,[internal?'renewalAssessment':'renewalInterview']:values,...(!internal?{member:task.member,profession:member.profession,activation:$('#activation').value,expiryDate:$('#expiryDate').value,meetingDate:$('#meetingDate').value,counselor:task.lead||'',companionCounselor:(task.companions||[]).join('、'),renewalCount:values.renewalCycle?(values.renewalCycle==='1'?'1':'2'):'',renewalRuleVersion:2,renewalMetricsSnapshot:metrics,trainingSelections:trainingPicker?.serialize()||{}}:{} )};
  }
  function restore(){
    $$('[data-field]').forEach(el=>{const value=fields()[el.dataset.field];if(el.type==='radio')el.checked=String(value)===el.value;else if(el.type==='checkbox')el.checked=value===true;else el.value=value??'';});
    if(!internal){$('#meetingDate').value=draft.meetingDate||task.scheduledAt||calendar.dateTimeInput();$('#activation').value=draft.activation||member.activation||'';$('#expiryDate').value=draft.expiryDate||member.expiryDate||'';}
  }
  async function saveDraft(){
    if(locked)return;
    clearTimeout(timer);draft=serialize();localStorage.setItem(draftKey(),JSON.stringify(draft));message('正在同步草稿…');
    try{await window.FulianCaseStateStore.flush();message('草稿已保存至 Supabase');$('#saveTime').textContent=calendar.formatTaipeiTime(new Date());renderSaved();}
    catch(error){message(`同步失敗：${error.message}`);throw error;}
  }
  function renderInterview(){
    const R=templates.RENEWAL;
    const basic=`<div class="fields two"><label>會員姓名<input value="${esc(task.member)}" readonly></label><label>分會<input value="富聯" readonly></label><label>專業別<input value="${esc(member.profession)}" readonly></label><label>訪談人<input value="${esc([task.lead,...(task.companions||[])].filter(Boolean).join('、'))}" readonly></label><label>訪談日期<input id="meetingDate" type="datetime-local"></label><label>入會日期<input id="activation" type="date"></label><label>到期日期<input id="expiryDate" type="date"></label></div>${choices('renewalCycle',[[1,'第一次續約'],[2,'第二次續約'],[3,'三年以上會員']])}`;
    const annual=`<div class="period-card"><strong id="palmsPeriod">請選擇本次續約</strong><p id="periodNote"></p><div id="renewalDataState"><span id="renewalDataMessage">正在核對續約期間</span><button type="button" id="renewalDataUpload" hidden>上傳此期間 PALMS</button><input type="file" id="renewalDataFile" accept=".xls" hidden></div></div><div id="metricsDisplay"></div>${input('amountReceived','收到的 TYFCB 金額（由會員確認；無來源時可留白）','number','min="0" step="any"')}${check('eventInw','高雄 INW')}${check('eventTaiwan','台灣年會')}${check('eventInternational','國際年會')}${input('eventCountry','國際年會國家')}`;
    const review=q(1,'你覺得這一年，自己最大的收穫是什麼？',checks('gain',R.gains)+other('gain'))+q(2,'除了生意之外，你覺得自己在哪些地方有成長？',text('personalGrowth','會員回應'))+q(3,'目前你的事業，最大的挑戰是什麼？我們可以如何協助你？',text('businessChallenge','會員回應'))+q(4,'你覺得自己今年，有真正使用 BNI 嗎？',choices('usageScore',[5,4,3,2,1].map(n=>[n,n+' 分']))+text('usageReason','原因'));
    const usage=q(5,'你覺得自己目前，最沒有使用好的部分是？',checks('underused',R.underused)+other('underused'))+q(6,'如果重新來一次，你覺得自己會更早開始做什麼？',text('earlierActions','會員回應'))+q(7,'目前你是否已有穩定合作夥伴？可以和我們分享成功見證嗎？',rating('partnerStatus',R.partnerStatus)+text('partnerStory','成功見證（沒有可填無）'))+q(8,'目前是否已有幾位會員，會主動想到你並願意介紹你？',rating('advocates',R.advocates));
    const growth=q(9,'分會年度最低嘉賓標準',input('chapterVisitorMinimum','分會年度最低嘉賓標準（位）','number','min="0"')+'<p>會員本年度邀約：<b id="chapterVisitors">—</b> 位</p>'+choices('chapterVisitorsStatus',[['met','已達標'],['unmet','未達標']]))+q(10,'你覺得自己今年是否有積極一起幫助分會成長？',choices('chapterGrowth',[['high','高'],['medium','普通'],['low','低']])+text('chapterGrowthReason','原因'))+q(11,'若今年未達嘉賓標準，你覺得主要原因是？',checks('visitorBarrier',R.barriers)+other('visitorBarrier'))+q(12,'下一年度，你是否願意更主動一起幫助分會成長？',R.commitments.map(([key,label])=>`<div class="renewal-commit"><b>${label}</b>${choices('commit_'+key,[['willing','願意'],['uncertain','不確定'],['unwilling','不願意']])}</div>`).join(''));
    const culture=q(13,'你認為 BNI 最大的價值是？',checks('value',R.values)+other('value'))+q(14,'你是否認同 BNI 核心價值？',rating('culture',['非常認同','大部分認同','普通','不太認同']))+q(15,'你是否願意：支持分會文化與團隊的一部分？',rating('teamSupport',['願意','觀望中','不確定']))+q(16,'你覺得自己目前，是否已建立真正的信任關係？',rating('trust',['已建立穩定信任圈','部分建立','尚未建立']));
    const plan=q(17,'下一年度，你最希望在 BNI 達成什麼成果？你願意開始的行動是什麼？',text('nextYearPlan','成果與行動'))+q(18,'你希望分會或團隊如何支持你？',text('teamSupportPlan','會員回應'))+q(19,'本人同意於副主席公告續約完成後，兩個月內完成 MSP（上）或（下）其中一堂培訓。',check('mspUnderstood','已了解')+`<div class="fields two">${input('mspUp','MSP（上）培訓日期','date')}${input('mspDown','MSP（下）培訓日期','date')}</div>`)+q(20,'對於分會的正面建議？',text('chapterSuggestions','會員回應'));
    $('#formSections').innerHTML=section('一、基本資料',basic)+section('二、年度參與數據',annual)+section('三、會員年度回顧',review)+section('四、平台使用復盤',usage)+section('五、邀請來賓與分會成長',growth)+section('六、長期主義與文化適配',culture)+section('七、下一年度成功藍圖',plan)+section('簽名與日期',`<p class="renewal-note">可保留空白，下載後親簽。姓名欄僅依實際填寫輸出。</p><div class="fields two">${input('memberSignature','會員簽名姓名')}${input('interviewer','訪談者簽名姓名')}${input('companion','陪訪者簽名姓名（選填）')}${input('signatureDate','簽署日期','date')}</div>`);
  }
  function renderAssessment(){
    const R=templates.RENEWAL;
    $('#formSections').innerHTML=section('一、會員委員會評估',`<p>本案會員：<b>${esc(task.member)}</b></p>`+R.ratings.map(([key,label])=>`<div class="renewal-commit"><b>${label}</b>${choices(key,[['high','高'],['medium','中'],['low','低']])}</div>`).join(''))+section('二、續約建議',choices('recommendation',[['normal','建議正常續約'],['conditional','建議有條件續約（90 天陪跑）'],['reject','不建議續約']])+`<div class="renewal-question"><h3>正常續約特徵</h3><p>積極投入、願意合作、認同文化、願意成長、願意一起幫助分會成長。</p></div><div class="renewal-question"><h3>有條件續約：改善方向</h3>${checks('improvement',R.improvements)}${input('coach','陪跑夥伴')}${text('improvementGoal','90 天改善目標')}</div><div class="renewal-question"><h3>不建議續約：原因</h3>${checks('rejectReason',R.rejectReasons)}</div>${text('notes','備註（選填）')}`)+section('訪談者簽名與日期',`<p class="renewal-note">此處為內部評估表的簽名及日期，與會員訪談表分別保存。</p><div class="fields two">${input('interviewer','訪談者簽名姓名')}${input('companion','陪訪者簽名姓名（選填）')}${input('assessmentDate','內部評估日期','date')}</div>`);
  }
  function expectedPeriod(){const cycle=fields().renewalCycle;if(locked&&metrics?.period)return {...metrics.period,first:cycle==='1',monthCount:'保存的'};return cycle?calendar.renewalPalmsPeriod({renewalCount:cycle==='1'?'1':'2',membershipStart:member.recentActivation||member.activation}):null;}
  function matches(){const p=expectedPeriod();return Boolean(p&&metrics?.member?.name===task.member&&metrics.period?.start===p.start&&metrics.period?.end===p.end);}
  function renderMetrics(){
    const p=expectedPeriod(),m=matches()?metrics.member.metrics:null;
    $('#palmsPeriod').textContent=p?`${p.start} 至 ${p.end}`:'請選擇本次續約';
    $('#periodNote').textContent=p?(p.first?`第一次續約：依實際會籍抓取 ${p.monthCount} 個完整月份。`:'第二次續約起：抓取訪談前 12 個完整月份。'):'';
    $('#chapterVisitors').textContent=m?.visitors??'—';
    const status=key=>choices(key,[['met','達標'],['unmet','未達']]);
    const metric=(label,value,standard,key)=>`<div class="renewal-metric"><b>${label}</b><strong>${esc(value??'—')}</strong><small>${standard||''}</small>${key?status(key):''}</div>`;
    $('#metricsDisplay').innerHTML='<div class="renewal-metrics">'+metric('缺席／代理人',m?`${m.absence} 次／${m.substitutes} 次`:null,'')+metric('一對一',m?.oneToOne,'區域標準 96 次／年','oneToOneStatus')+metric('培訓積分',m?.education,'區域標準 18 分／年','educationStatus')+metric('嘉賓邀約',m?.visitors,'區域標準 4 位／年','visitorsStatus')+metric('引薦數',m?m.givenIn+m.givenOut:null,'區域標準 144 單／年','referralsStatus')+metric('給出的 TYFCB 金額',m?.amount,'正式 PALMS 數據')+'</div>';
    restore();
  }
  async function loadMetrics(file=null){
    draft=serialize();const p=expectedPeriod();renderMetrics();if(!p)return;
    if(!file&&matches()){ $('#renewalDataMessage').textContent='已載入本案保存的正式 PALMS 快照。';return; }
    $('#renewalDataMessage').textContent='正在核對指定期間的正式 PALMS…';
    try{
      let response;
      if(file){const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);response=await fetch('/api/renewal-data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({periodStart:p.start,periodEnd:p.end,member:task.member,files:[{name:file.name,dataBase64:btoa(raw)}]})});}
      else response=await fetch(`/api/renewal-data?${new URLSearchParams({periodStart:p.start,periodEnd:p.end,member:task.member})}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);
      if(data.member?.name!==task.member||data.period?.start!==p.start||data.period?.end!==p.end)throw new Error('續約 PALMS 與案件期間不一致');
      const keys=['absence','substitutes','oneToOne','education','visitors','givenIn','givenOut','amount'];if(!keys.every(k=>Number.isFinite(data.member.metrics?.[k])))throw new Error('正式 PALMS 缺少完整數據，請由副主席核對');
      metrics={period:data.period,member:data.member,averages:data.averages,memberCount:data.memberCount,source:data.source};renderMetrics();$('#renewalDataMessage').textContent=`已載入正式 PALMS，分會計算人數 ${data.memberCount} 人。`;if(!locked)await saveDraft();
    }catch(error){metrics=null;renderMetrics();$('#renewalDataMessage').textContent=error.message;$('#renewalDataUpload').hidden=!['vp','admin'].includes(session.role);}
  }
  function missing(){
    const v=fields(),out=[];
    const need=(key,label)=>{if(!String(v[key]??'').trim())out.push({key,label});};
    const any=(prefix,count,label)=>{if(!Array.from({length:count},(_,i)=>v[prefix+(i+1)]).some(Boolean)&&!v[prefix+'OtherSelected'])out.push({key:prefix+'1',label});};
    if(internal){templates.RENEWAL.ratings.forEach(([k,t])=>need(k,t));need('recommendation','續約建議');need('assessmentDate','內部評估日期');if(v.recommendation==='conditional'){any('improvement',8,'改善方向');need('coach','陪跑夥伴');need('improvementGoal','90 天改善目標');}if(v.recommendation==='reject')any('rejectReason',7,'不建議續約原因');}
    else{need('renewalCycle','本次續約');if(!$('#meetingDate').value)out.push({key:'meetingDate',label:'訪談日期'});if(!matches())out.push({key:'renewalDataState',label:'對應期間的正式 PALMS'});any('gain',9,'第 1 題收穫');any('underused',10,'第 5 題平台使用');any('value',7,'第 13 題 BNI 價值');for(const [key,label] of Object.entries({personalGrowth:'第 2 題成長',businessChallenge:'第 3 題事業挑戰',usageReason:'第 4 題使用原因',earlierActions:'第 6 題提早開始的行動',partnerStory:'第 7 題成功見證',chapterGrowthReason:'第 10 題分會成長原因',nextYearPlan:'第 17 題成功藍圖',teamSupportPlan:'第 18 題團隊支持',chapterSuggestions:'第 20 題正面建議'}))need(key,label);for(const [key,label] of Object.entries({usageScore:'第 4 題使用分數',partnerStatus:'第 7 題合作夥伴',advocates:'第 8 題主動引薦人數',chapterVisitorMinimum:'第 9 題分會嘉賓標準',chapterVisitorsStatus:'第 9 題達標狀態',chapterGrowth:'第 10 題參與程度',culture:'第 14 題文化認同',teamSupport:'第 15 題團隊支持',trust:'第 16 題信任關係',oneToOneStatus:'一對一達標狀態',educationStatus:'培訓達標狀態',visitorsStatus:'嘉賓達標狀態',referralsStatus:'引薦達標狀態'}))need(key,label);templates.RENEWAL.commitments.forEach(([k,t])=>need('commit_'+k,t));if(v.chapterVisitorsStatus==='unmet')any('visitorBarrier',7,'未達嘉賓標準原因');if(!v.mspUnderstood)out.push({key:'mspUnderstood',label:'MSP 已了解'});}
    for(const [prefix,label] of [['gain','收穫'],['underused','平台使用'],['visitorBarrier','嘉賓原因'],['value','BNI 價值']])if(v[prefix+'OtherSelected'])need(prefix+'Other',label+'其他說明');
    return out;
  }
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
  async function downloadSaved(documentKind){try{const file=await window.FulianCaseFiles.getCaseFile({caseId:taskId,documentKind,indexedDb:indexedDB});if(!file)throw new Error('尚無已保存文件');download(file,file.name);}catch(error){toast(error.message);}}
  function renderSaved(){
    const s=state(),docs=s.renewalDocuments||{},interview=docs['renewal-interview'],assessment=docs['renewal-assessment'],ready=domain.renewalDocumentsReady(docs),panel=$('#savedDocuments');
    $('#assessmentLink').href=`renewal-assessment.html?task=${encodeURIComponent(taskId)}`;$('#assessmentLink').setAttribute('aria-disabled',String(!interview));
    $('#feedbackLink').href=`case-workflow.html?case=${encodeURIComponent(taskId)}`;$('#feedbackLink').setAttribute('aria-disabled',String(!ready));
    if(!interview&&!assessment){panel.hidden=true;return;}
    panel.hidden=false;panel.innerHTML=`<h2>${ready?'兩份續約文件已保存':'會員訪談已保存，待內部評估'}</h2><p>同一案件，兩份 Word 分開下載及回傳中心區。</p><div class="renewal-downloads">${interview?'<button type="button" data-document="renewal-interview">下載會員續約訪談表</button>':''}${internal&&assessment?'<button type="button" data-document="renewal-assessment">下載委員會內部評估表</button>':''}</div>${internal?(ready?`<a class="renewal-next" href="case-workflow.html?case=${encodeURIComponent(taskId)}">前往委員回饋 →</a>`:''):`<a class="renewal-next" href="renewal-assessment.html?task=${encodeURIComponent(taskId)}">結束共同訪談，前往內部評估 →</a>`}`;
    panel.querySelectorAll('[data-document]').forEach(n=>n.onclick=()=>downloadSaved(n.dataset.document));
  }
  async function complete(){
    if(busy||locked)return;draft=serialize();const missingFields=missing();if(missingFields.length){toast('尚未完成：'+missingFields.slice(0,3).map(x=>x.label).join('、'));const key=missingFields[0].key;const n=document.getElementById(key)||$$('[data-field]').find(n=>n.dataset.field===key);n?.scrollIntoView({behavior:'smooth',block:'center'});n?.focus();return;}
    busy=true;$('#downloadWord').disabled=true;message('正在保存及產生 Word…');
    try{
      if(internal){draft.renewalFoundationSnapshot=await window.FulianFoundationInterview.capture();}
      await saveDraft();
      const {blob,fileName}=await window.FulianInterviewTemplate.generate({type:internal?'renewal-assessment':'renewal',applicant:task.member,draft,context:internal?{}:{profession:member.profession,metrics:metrics.member.metrics}});
      await window.FulianCaseFiles.saveGeneratedWord({caseId:taskId,blob,fileName,sourceLabel:internal?'委員會內部評估':'續約會員訪談',caseType:'renewal',documentKind:kind,domain,storage:localStorage,indexedDb:indexedDB,FileClass:File});
      download(blob,fileName);renderSaved();message(internal?'兩份文件已保存，可進入回饋':'會員訪談已保存，待委員填寫內部評估');$('#savedDocuments').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(error){message('尚未完成保存：'+error.message);toast(error.message);}finally{busy=false;$('#downloadWord').disabled=false;}
  }
  try{
    await Promise.all([window.FulianTaskStore.ready,window.FulianCaseStateStore.ready]);
    task=window.FulianTaskStore.all().find(t=>t.id===taskId&&t.type==='renewal');if(!task)throw new Error('找不到指定續約案件，請由案件清單開啟。');
    session=window.FulianAuth.getSession();const assigned=domain.isAssignedTo(task,session.name),leader=['vp','admin'].includes(session.role);
    if(!leader&&!assigned)throw new Error('只有副主席或本案受指派委員可填寫此表。');
    if(internal&&task.member===session.name)throw new Error('申請人本人須迴避內部評估，請由其他受指派委員填寫。');
    draft=domain.readDraft(localStorage,task)||{};const s=state();
    if(!domain.renewalPackRequired(task,s,draft)){throw new Error('此案已保存舊版歷史文件，請由案件流程下載原件或繼續原流程。');}
    if(task.completed||s.closed)throw new Error('此案已結案，請由結案資料頁下載兩份原件。');
    if(internal&&!s.renewalInterviewSaved)throw new Error('請先成功保存會員續約訪談表，再進入內部評估。');
    locked=Boolean(s.feedbackCallId||s.feedbackNotified||domain.hasFeedback(s)||s.votingOpen);
    $('#loginIdentity').textContent=session.name;$('#interviewLink').href=`terminal-form.html?task=${encodeURIComponent(taskId)}`;
    if(internal)renderAssessment();else{
      const response=await fetch('/api/analysis-snapshot',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.message||'正式會員資料載入失敗');member=data.members?.find(m=>m.name===task.member);if(!member||!member.activation||!member.recentActivation)throw new Error('會員會籍日期尚未完成正式核對，請由副主席確認。');
      metrics=draft.renewalMetricsSnapshot||null;renderInterview();trainingPicker=window.FulianTrainingPicker.mount([["mspUp","msp_up"],["mspDown","msp_down"]]);trainingPicker.restore(draft.trainingSelections);
    }
    restore();$('#renewalForm').hidden=false;renderSaved();
    if(!internal){await loadMetrics();$('#renewalDataUpload').onclick=()=>$('#renewalDataFile').click();$('#renewalDataFile').onchange=()=>loadMetrics($('#renewalDataFile').files[0]);}
    $('#renewalForm').addEventListener('input',event=>{if(locked)return;draft=serialize();if(event.target.dataset.field==='renewalCycle'){metrics=null;draft.renewalMetricsSnapshot=null;loadMetrics();}clearTimeout(timer);timer=setTimeout(()=>saveDraft().catch(()=>{}),400);});
    $('#saveDraft').onclick=()=>saveDraft().catch(e=>toast(e.message));$('#downloadWord').onclick=complete;
    if(locked){$$('#renewalForm input,#renewalForm textarea,#renewalForm button').forEach(n=>n.disabled=true);message('已進入回饋，表單與文件保留原件');}else message('新版續約表單已就緒');
  }catch(error){$('#loadError').hidden=false;$('#loadError').textContent=error.message;$('#renewalForm').hidden=true;message('無法開啟表單');}
})();
