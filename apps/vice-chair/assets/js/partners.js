(function(){
  if(!window.FulianAuth?.can("view"))return;
  const D=window.FulianPartnerDirectoryDomain,C=window.FulianCalendarDomain,$=selector=>document.querySelector(selector);
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const preferenceKey="fulian-partner-view-v1",numeric=new Intl.NumberFormat("zh-TW",{maximumFractionDigits:2});
  let saved={};try{saved=JSON.parse(localStorage.getItem(preferenceKey)||"{}")}catch{}
  let state=D.preferences(saved),snapshot=null,displaySnapshot=null,allRows=[],generation=0,busy=false,monthlyData=null,catalogError="";
  const filterIds=["search","profession","expiry","from","to","metric","min","max"];
  const periodName=()=>state.period.startsWith("month:")?`${state.period.slice(6)} 單月 PALMS`:state.period==="annual"?"一年 PALMS":"半年 PALMS";
  const periodText=period=>period?`${period.start} 至 ${period.end}`:"尚未提供資料期間";
  const timeText=value=>C.formatTaipeiTimestamp(value,{year:true})||"未提供";
  function savePreferences(){try{localStorage.setItem(preferenceKey,JSON.stringify(D.preferences(state)))}catch{}}
  function filters(){return Object.fromEntries(filterIds.map(id=>[id,$(`#${id}`).value]))}
  function format(row,column){const value=row[column.key];return value===null||value===""?"尚無資料":column.type==="number"?numeric.format(value):String(value)}
  function notice(message){$("#monthlyNotice").hidden=!message;$("#monthlyNotice").textContent=message}
  function syncControls(){
    $("#period").value=state.period;$("#sort").value=state.sort;$("#direction").value=state.direction;
    $("#columnChoices").querySelectorAll("input").forEach(input=>input.checked=state.columns.includes(input.value));
    document.querySelectorAll("[data-preset]").forEach(button=>button.setAttribute("aria-pressed",String(JSON.stringify(state.columns)===JSON.stringify(D.presets[button.dataset.preset]))));
    $("#min").disabled=$("#max").disabled=!$("#metric").value;
  }
  function render(){
    syncControls();if(!displaySnapshot||busy)return;
    allRows=D.rows(displaySnapshot,state.period);
    const options={...filters(),sort:state.sort,direction:state.direction};
    const invalidDates=options.from&&options.to&&options.from>options.to;
    const invalidNumbers=options.metric&&options.min!==""&&options.max!==""&&Number(options.min)>Number(options.max);
    $("#filterWarning").hidden=!invalidDates&&!invalidNumbers;
    $("#filterWarning").textContent=invalidDates?"到期日起日不能晚於迄日，請調整範圍。":invalidNumbers?"最少值不能大於最多值，請調整範圍。":"";
    const result=invalidDates||invalidNumbers?[]:D.query(allRows,options);
    const visible=D.columns.filter(column=>state.columns.includes(column.key));
    $("#tableHead").innerHTML=`<tr>${visible.map(column=>`<th scope="col" aria-sort="${state.sort===column.key?(state.direction==="asc"?"ascending":"descending"):"none"}"><button type="button" data-sort="${column.key}">${column.label}<span aria-hidden="true">${state.sort===column.key?(state.direction==="asc"?" ↑":" ↓"):" ↕"}</span></button></th>`).join("")}</tr>`;
    $("#tableBody").innerHTML=result.map(row=>`<tr>${visible.map(column=>{
      if(column.key==="name")return `<th scope="row"><button class="member-name" type="button" data-member="${escape(row.name)}">${escape(row.name)}</button></th>`;
      const expired=column.key==="expiryDate"&&row.expiryDate&&C.daysUntil(row.expiryDate)<0;
      return `<td class="${column.type==="number"?"numeric":""}${row[column.key]===null||row[column.key]===""?" missing":""}">${escape(format(row,column))}${expired?'<small class="date-note">日期已過・待核對</small>':""}</td>`;
    }).join("")}</tr>`).join("");
    $("#resultCount").textContent=`顯示 ${result.length}／${allRows.length} 位 · ${periodName()} · 依${D.columns.find(column=>column.key===state.sort).label}${state.direction==="asc"?"升冪":"降冪"}排列`;
    $("#empty").hidden=result.length>0;$(".table-scroll").hidden=result.length===0;
    $("#memberCount").textContent=allRows.length;$("#dueCount").textContent=D.query(allRows,{expiry:"90"}).length;
    $("#periodTitle").textContent=periodName();$("#periodLabel").textContent=periodText(D.period(displaySnapshot,state.period));
    $("#snapshotTime").textContent=monthlyData?`單月報表匯入：${timeText(monthlyData.importedAt)}`:`名錄快照更新：${timeText(snapshot.source?.modifiedAt)}`;
    $("#periodWarning").hidden=Boolean(D.period(displaySnapshot,state.period));
    if(monthlyData){
      const missing=displaySnapshot.members.filter(member=>!member.monthlyMetrics).length;
      notice(`單月活動：${monthlyData.month}。會籍與名單沿用目前快照；${missing} 位未列於這份單月報表，顯示尚無資料。報表另有 ${monthlyData.reportOnlyCount??0} 位不在目前名錄中，未納入此列表。`);
    }else notice(catalogError);
  }
  function showMember(name){
    const row=allRows.find(item=>item.name===name);if(!row)return;
    $("#memberTitle").textContent=row.name;$("#memberProfession").textContent=row.profession||"專業別尚無資料";
    const group=(label,columns)=>`<section><h3>${escape(label)}</h3><dl class="detail-grid">${columns.map(column=>`<div><dt>${column.label}</dt><dd>${escape(format(row,column))}${row[column.key]!==null&&column.unit?` <small>${column.unit}</small>`:""}</dd></div>`).join("")}</dl></section>`;
    $("#memberDetails").innerHTML=group("會籍資料",D.columns.filter(column=>!column.metric&&!["name","profession"].includes(column.key)))+`<p class="dialog-note">本次在會月數截至 ${C.dateInput()}，依生效日推算；生效日不等於首次出席日。</p>`+group(`${periodName()} · ${periodText(D.period(displaySnapshot,state.period))}`,D.columns.filter(column=>column.metric));
    $("#memberDialog").showModal();
  }
  async function readApi(path){
    const response=await fetch(path,{cache:"no-store"}),data=await response.json();
    if(!response.ok)throw new Error(data.message||"資料服務暫時無法使用");return data;
  }
  function reportUrl(month=""){
    const session=FulianAuth.getSession(),query=new URLSearchParams({identity:`${session.role}:${session.name}`});
    if(month)query.set("month",month);return `/api/partner-reports?${query}`;
  }
  async function selectPeriod(){
    const ticket=++generation;busy=true;monthlyData=null;displaySnapshot=null;
    $("#memberDialog").close();$(".table-scroll").hidden=true;$("#empty").hidden=true;$("#periodWarning").hidden=true;$("#filterWarning").hidden=true;
    $("#resultCount").textContent="正在讀取所選期間…";$("#periodTitle").textContent=periodName();$("#periodLabel").textContent="讀取中…";$("#snapshotTime").textContent="";notice("");
    try{
      if(state.period.startsWith("month:")){
        const month=state.period.slice(6),data=await readApi(reportUrl(month));
        if(ticket!==generation)return;
        displaySnapshot=D.withMonth(snapshot,data,month);monthlyData=data;
      }else displaySnapshot=snapshot;
      busy=false;render();savePreferences();
    }catch(error){
      if(ticket!==generation)return;busy=false;allRows=[];
      $("#resultCount").textContent="所選期間未能載入";$("#periodLabel").textContent="尚無可顯示資料";
      notice(`${error.message}。可重新載入，或選擇其他資料期間。`);
    }
  }
  async function load(){
    const ticket=++generation;busy=true;snapshot=null;displaySnapshot=null;allRows=[];$("#memberDialog").close();
    $("#loading").hidden=false;$("#content").hidden=true;$("#error").hidden=true;$("#refresh").disabled=true;
    try{
      const [analysis,months]=await Promise.allSettled([readApi("/api/bni-analysis"),readApi(reportUrl())]);
      if(ticket!==generation)return;
      if(analysis.status!=="fulfilled")throw analysis.reason;
      snapshot=D.validateSnapshot(analysis.value);catalogError="";
      let catalog=[];
      if(months.status==="fulfilled"&&months.value.schema==="fulian.partner-reports.v1"&&Array.isArray(months.value.months))catalog=months.value.months.filter(item=>/^\d{4}-(0[1-9]|1[0-2])$/.test(item.month));
      else catalogError="單月月份清單暫時無法取得，可按「重新載入資料」重試；半年與一年資料仍可查閱。";
      $("#period").innerHTML='<option value="half">半年 PALMS</option><option value="annual">一年 PALMS</option>'+catalog.map(item=>`<option value="month:${item.month}">${item.month} 單月 PALMS</option>`).join("");
      if(state.period.startsWith("month:")&&!catalog.some(item=>`month:${item.month}`===state.period)){state.period="half";catalogError=catalogError||"先前選擇的月份目前無可用報表，已切回半年 PALMS。"}
      const professions=[...new Set(snapshot.members.map(member=>String(member.profession||"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
      const previousProfession=$("#profession").value;
      $("#profession").innerHTML='<option value="">全部專業別</option>'+professions.map(value=>`<option>${escape(value)}</option>`).join("");
      if(professions.includes(previousProfession))$("#profession").value=previousProfession;
      $("#sourceDetails").innerHTML=`<p>半年 PALMS：${escape(periodText(D.period(snapshot,"half")))}</p><p>一年 PALMS：${escape(periodText(D.period(snapshot,"annual")))}</p><p>名錄快照更新：${escape(timeText(snapshot.source?.modifiedAt))}</p><p>單月 PALMS 直接讀取已驗證匯入的該月報表，無須等待分析發布；同月份以最新匯入版本為準。切換月份只改變活動數據，會籍與名單維持目前快照。</p>`;
      $("#content").hidden=false;syncControls();await selectPeriod();
    }catch(error){$("#error").hidden=false;$("#errorMessage").textContent=error.message||"請稍後重試"}
    finally{$("#loading").hidden=true;$("#refresh").disabled=false}
  }
  $("#sort").innerHTML=D.columns.map(column=>`<option value="${column.key}">${column.label}</option>`).join("");
  $("#metric").insertAdjacentHTML("beforeend",D.columns.filter(column=>column.metric).map(column=>`<option value="${column.key}">${column.label}（${column.unit}）</option>`).join(""));
  $("#columnChoices").innerHTML=D.columns.filter(column=>column.key!=="name").map(column=>`<label><input type="checkbox" value="${column.key}">${column.label}</label>`).join("");
  filterIds.forEach(id=>$(`#${id}`).addEventListener(["search","min","max"].includes(id)?"input":"change",render));
  $("#period").onchange=()=>{state.period=$("#period").value;selectPeriod()};
  for(const id of ["sort","direction"])$(`#${id}`).onchange=()=>{state[id]=$(`#${id}`).value;render();savePreferences()};
  $("#tableHead").onclick=event=>{const key=event.target.closest("[data-sort]")?.dataset.sort;if(!key)return;state.direction=state.sort===key&&state.direction==="asc"?"desc":"asc";state.sort=key;render();savePreferences()};
  $("#tableBody").onclick=event=>{const button=event.target.closest("[data-member]");if(button)showMember(button.dataset.member)};
  $("#columnChoices").onchange=()=>{state.columns=["name",...[...$("#columnChoices").querySelectorAll("input:checked")].map(input=>input.value)];render();savePreferences()};
  document.querySelectorAll("[data-preset]").forEach(button=>button.onclick=()=>{state.columns=[...D.presets[button.dataset.preset]];render();savePreferences()});
  function clearFilters(){filterIds.forEach(id=>$(`#${id}`).value=id==="expiry"?"all":"");render()}
  $("#clearFilters").onclick=clearFilters;
  $("#reset").onclick=()=>{state=D.preferences();clearFilters();syncControls();selectPeriod()};
  $("#closeDialog").onclick=()=>$("#memberDialog").close();
  $("#refresh").onclick=load;$("#retry").onclick=load;
  syncControls();load();
})();
