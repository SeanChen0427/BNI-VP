(() => {
  const domain=window.FulianTrainingSelection, catalog=window.FulianTrainingCatalog, calendar=window.FulianCalendarDomain;
  function mount(fields){
    let events=[],state=null,loaded=false,error=false;
    const controls=fields.map(([id,category])=>{
      const input=document.getElementById(id),label=input.closest("label");
      const box=document.createElement("div");box.className="training-picker";
      label.before(box);
      const choice=document.createElement("label");choice.textContent=`${label.textContent.trim()}｜選擇官方場次`;
      const select=document.createElement("select");select.id=`${id}Course`;choice.append(select);
      const summary=document.createElement("p");summary.className="training-picker-note";summary.hidden=true;
      const note=document.createElement("p");note.className="training-picker-note";note.id=`${id}CourseNote`;note.setAttribute("role","status");
      select.setAttribute("aria-describedby",note.id);
      const actions=document.createElement("div");actions.className="training-picker-actions";
      const adopt=document.createElement("button");adopt.type="button";adopt.textContent="採用最新時間";adopt.hidden=true;
      const link=document.createElement("a");link.textContent="官方課程詳情";link.target="_blank";link.rel="noopener noreferrer";link.hidden=true;
      actions.append(adopt,link);box.append(choice,summary,label,note,actions);
      const control={id,category,input,select,summary,note,adopt,link,saved:null};
      const choose=event=>{
        control.saved=domain.snapshot(event);
        if(control.saved)input.value=calendar.dateInput(control.saved.start_at);
        render(control);
        input.dispatchEvent(new Event("input",{bubbles:true}));
      };
      select.addEventListener("change",()=>{
        if(!select.value){control.saved=null;render(control);input.dispatchEvent(new Event("input",{bubbles:true}));return;}
        const event=domain.options(events,category).find(item=>String(item.id)===select.value);
        if(event)choose(event);
      });
      const manual=()=>{
        if(control.saved&&input.value!==calendar.dateInput(control.saved.start_at)){control.saved=null;render(control);}
      };
      input.addEventListener("input",manual);input.addEventListener("change",manual);
      adopt.addEventListener("click",()=>{
        const current=domain.status(control.saved,events).current;
        if(current?.source_status==="published"&&current.category===category)choose(current);
      });
      return control;
    });
    function render(control){
      const {select,summary,note,saved,adopt,link}=control;
      summary.hidden=!saved;
      summary.textContent=saved?`${saved.title}｜${catalog.eventTime(saved)}`:"";
      select.replaceChildren(new Option(loaded?"手動填寫日期／選擇場次":"正在讀取官方課表…",""));
      const choices=domain.options(events,control.category);
      choices.forEach(event=>select.add(new Option(`${catalog.eventTime(event)}｜${event.title}`,String(event.id))));
      if(saved){
        const existing=[...select.options].find(option=>option.value===String(saved.id));
        const title=`已選：${catalog.eventTime(saved)}｜${saved.title}`;
        if(existing)existing.textContent=title;
        else select.add(new Option(title,String(saved.id)));
        select.value=String(saved.id);
      }
      select.disabled=!loaded;
      adopt.hidden=true;link.hidden=true;link.removeAttribute("href");
      let message="可直接選課帶入日期，也可手動填寫。選課不代表已報名或完成培訓。";
      if(!loaded)message="正在讀取課表，仍可先手動填寫日期。";
      else if(error)message="課表讀取失敗，已保留原有日期及選課紀錄；可手動填寫，重新開啟表單後再試。";
      else {
        if(!state?.last_success_at)message="課表尚未完成首次同步，可先手動填日期。";
        else if(!choices.length)message="目前沒有可選的未來場次，可先手動填日期；官方公布後會每日同步。";
        const result=domain.status(saved,events);
        if(result.kind==="missing")message="這個已選場次目前未列在官方課表，請向主辦確認；原定日期仍保留。";
        if(result.kind==="changed"){
          message=`官方課程資訊已異動：${catalog.eventTime(result.current)}｜${result.current.title}。原定日期仍保留，請確認後再更新。`;
          adopt.hidden=result.current.category!==control.category;
        }
        if(saved&&result.current?.source_url){
          try{link.href=catalog.officialUrl(result.current.source_url);link.hidden=false;}catch{}
        }
        if(state?.last_success_at)message+=` 課表更新：${calendar.formatTaipeiTimestamp(state.last_success_at,{year:true})}。`;
        if(state?.last_error)message+=" 最近同步未成功，目前使用上次成功的課表。";
      }
      note.textContent=message;
    }
    controls.forEach(render);
    const controller={
      serialize(){return Object.fromEntries(controls.filter(control=>control.saved).map(control=>[control.id,{...control.saved}]));},
      restore(saved){controls.forEach(control=>{control.saved=domain.restore(saved?.[control.id],control.category,control.input.value);render(control);});},
      ready:null
    };
    controller.ready=(async()=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
      try{
        const response=await fetch("/api/training-catalog",{signal:abort.signal});
        if(!response.ok)throw new Error("課表讀取失敗");
        const data=await response.json();
        if(data.schema!=="fulian.training-catalog.v1"||!Array.isArray(data.events))throw new Error("課表格式不符");
        events=data.events;state=data.state;
      }catch{error=true;}finally{clearTimeout(timer);loaded=true;controls.forEach(render);}
    })();
    return controller;
  }
  window.FulianTrainingPicker=Object.freeze({mount});
})();
