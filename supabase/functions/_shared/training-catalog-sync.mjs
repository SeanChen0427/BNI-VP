import "../../../apps/vice-chair/core/calendar-domain.js";
import "../../../apps/vice-chair/core/training-catalog-domain.js";

const domain=globalThis.FulianTrainingCatalog;
const jsonHeaders={"Content-Type":"application/json"};
export async function fetchOfficialEvents(year,{fetchImpl=fetch}={}){
  const url=new URL("https://bnikaohsiung.com.tw/web/open/cmsViewEventsCalendarJson");
  url.search=new URLSearchParams({regionIds:"7731",eventTypeId:"0",cmsv3:"true",start:`${year}-01-01`,end:`${year+1}-01-01`}).toString();
  // 只重試一次，不在官網故障時無限請求。
  for(let attempt=0;attempt<2;attempt++){
    try{
      const result=await fetchImpl(url.href,{signal:AbortSignal.timeout(20_000),headers:{Accept:"application/json"}});
      if(!result.ok)throw new Error(`官方課表暫時無法讀取（${result.status}）`);
      const text=await result.text();
      if(text.length>2_000_000)throw new Error("官方課表內容超過預期大小");
      return domain.parseEvents(JSON.parse(text),year);
    }catch(error){if(attempt===1)throw error;}
  }
}

export async function syncTrainingCatalog({db,fetchImpl=fetch,now=new Date(),trigger="scheduled"}){
  const years=domain.syncYears(now);
  const token=await db("rpc/edge_claim_training_sync",{method:"POST",headers:jsonHeaders,body:JSON.stringify({p_trigger:trigger})});
  if(!token)return {skipped:true,message:"正在同步或剛完成檢查，請稍後重新整理課表"};
  try{
    const batches=await Promise.all(years.map(year=>fetchOfficialEvents(year,{fetchImpl})));
    const records=batches.flat();
    if(new Set(records.map(item=>item.id)).size!==records.length)throw new Error("不同年度出現重複活動編號，需核對官方資料");
    return await db("rpc/edge_complete_training_sync",{method:"POST",headers:jsonHeaders,body:JSON.stringify({p_token:token,p_years:years,p_records:records})});
  }catch(error){
    await db("rpc/edge_fail_training_sync",{method:"POST",headers:jsonHeaders,body:JSON.stringify({p_token:token,p_message:"本次官方課表同步失敗，保留上次成功資料，請稍後重試。"})});
    throw Object.assign(new Error("本次官方課表同步失敗，保留上次成功資料，請稍後重試。"),{status:502,cause:error});
  }
}

export function createTrainingCatalogApi({db,sync=syncTrainingCatalog}){
  return async function(request,context){
    if(!["admin","vp","committee"].includes(context?.role))throw Object.assign(new Error("請先登入"),{status:403});
    let result=null;
    if(request.method==="POST"){
      if(!["admin","vp"].includes(context.role))throw Object.assign(new Error("只有副主席或 Admin 可以更新官方課表"),{status:403});
      const body=await request.json();
      if(body.action!=="sync")throw Object.assign(new Error("不支援的課表操作"),{status:400});
      result=await sync({db,trigger:"manual"});
    }else if(request.method!=="GET")throw Object.assign(new Error("不支援的操作"),{status:405});
    // 分頁讀取，不能因 PostgREST 預設 1,000 筆上限靜默漏掉歷史場次。
    const events=[];
    for(let offset=0;;offset+=1000){
      const page=await db(`training_events?select=*&order=start_at.asc,id.asc&limit=1000&offset=${offset}`);
      events.push(...(page||[]));
      if(!page||page.length<1000)break;
    }
    const [states,changes]=await Promise.all([
      db("training_sync_state?id=eq.1&select=last_success_at,last_attempt_at,last_error,synced_years,last_counts,lease_until&limit=1"),
      db("training_event_changes?select=event_id,change_kind,before_event,after_event,changed_at&order=id.desc&limit=50")
    ]);
    return {schema:"fulian.training-catalog.v1",events,state:states?.[0]||null,changes:changes||[],canSync:["admin","vp"].includes(context.role),result};
  };
}
