(function(root,factory){
  const api=factory(root.FulianCalendarDomain || (typeof require === "function" ? require("./calendar-domain.js") : null));
  if(typeof module === "object" && module.exports) module.exports=api;
  root.FulianTrainingCatalog=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(calendar){
  const SOURCE_URL="https://bnikaohsiung.com.tw/zh-TW/events";
  const CATEGORIES={msp_up:"MSP（上）",msp_down:"MSP（下）",exchange:"新會員交流座談會",workshop:"工作坊",leadership:"領導團隊培訓",other:"其他培訓／活動"};
  const normalize=value=>String(value||"").normalize("NFKC").toLowerCase().replace(/[\s()（）·・－-]/gu,"");
  function category(title){
    const text=normalize(title);
    if(/msp上/.test(text))return "msp_up";
    if(/msp下/.test(text))return "msp_down";
    if(/新會員.*交流|交流座談/.test(text))return "exchange";
    if(/工作坊|workshop/.test(text))return "workshop";
    if(/領導團隊/.test(text))return "leadership";
    return "other";
  }
  function syncYears(now=new Date()){
    const year=calendar.taipeiParts(now).year;
    return [year,year+1];
  }
  function officialUrl(value){
    const url=new URL(String(value),SOURCE_URL);
    if(url.origin!==new URL(SOURCE_URL).origin || url.pathname!=="/zh-TW/eventdetails" || !url.searchParams.get("eventId") || url.username || url.password)throw new Error("官方活動連結格式異常");
    return url.href;
  }
  function parseEvents(payload,year){
    if(!Array.isArray(payload)||payload.length>5000)throw new Error("官方課表格式異常，保留上次資料");
    const ids=new Set();
    return payload.map(item=>{
      if(!Number.isSafeInteger(item?.id)||item.id<=0||ids.has(item.id))throw new Error("官方活動編號缺漏或重複");
      ids.add(item.id);
      const title=String(item.title||"").trim();
      // 官網日期沒有時區，依同一份台北時間領域轉換，不依執行主機時區。
      const start=calendar.toInstant(item.start),end=calendar.toInstant(item.end);
      if(!title||title.length>500||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.end)||!start||!end||end<start||Number(calendar.dateInput(start).slice(0,4))!==year)throw new Error("官方課程日期或名稱異常，保留上次資料");
      return {id:item.id,title,start_at:start.toISOString(),end_at:end.toISOString(),description:String(item.description||"").slice(0,4000),source_url:officialUrl(item.url),category:category(title)};
    });
  }
  function range(mode="upcoming",now=new Date(),month="",from="",through=""){
    if(mode==="custom"){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(through)||!calendar.dateInput(from)||!calendar.dateInput(through)||from>through)return null;
      return {start:from,end:calendar.shiftDayKey(through,1),label:`${from} 至 ${through}`};
    }
    const today=calendar.dateInput(now),current=calendar.monthKey(now),year=calendar.taipeiParts(now).year;
    if(mode==="this-month"||mode==="next-month"||mode==="month"){
      const key=mode==="this-month"?current:mode==="next-month"?calendar.shiftMonthKey(current,1):month;
      if(!calendar.shiftMonthKey(key,0))return null;
      return {start:`${key}-01`,end:`${calendar.shiftMonthKey(key,1)}-01`,label:`${key.slice(0,4)} 年 ${Number(key.slice(5))} 月`};
    }
    if(mode==="this-year"||mode==="next-year"){
      const y=year+(mode==="next-year"?1:0);
      return {start:`${y}-01-01`,end:`${y+1}-01-01`,label:`${y} 全年度`};
    }
    return {start:today,end:calendar.shiftDateMonths(today,12),label:"未來 12 個月"};
  }
  function filterEvents(events,{query="",category:kind="",mode="upcoming",month="",from="",through="",now=new Date()}={}){
    const window=range(mode,now,month,from,through),terms=String(query).trim().split(/\s+/u).map(normalize).filter(Boolean);
    if(!window)return [];
    return events.filter(event=>{
      const day=calendar.dateInput(event.start_at);
      const text=normalize(event.title+" "+(CATEGORIES[event.category]||""));
      return day>=window.start&&day<window.end&&(!kind||event.category===kind)&&terms.every(term=>text.includes(term));
    }).sort((a,b)=>a.start_at.localeCompare(b.start_at)||a.id-b.id);
  }
  function eventTime(event){
    const start=calendar.formatTaipeiDate(event.start_at,{weekday:true}),from=calendar.formatTaipeiTime(event.start_at);
    const sameDay=calendar.dateInput(event.start_at)===calendar.dateInput(event.end_at);
    return `${start} ${from}～${sameDay?"":calendar.formatTaipeiDate(event.end_at)+" "}${calendar.formatTaipeiTime(event.end_at)}`;
  }
  return {SOURCE_URL,CATEGORIES,normalize,category,syncYears,officialUrl,parseEvents,range,filterEvents,eventTime};
});
