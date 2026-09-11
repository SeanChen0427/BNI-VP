import {parseAuditWeekText} from "../../bni-analysis/engine/audit.mjs";
import {normalizeName} from "../../bni-analysis/engine/parse-reports.mjs";
import {buildMemberInteractions,interactionMonthCatalog,selectInteractionReports,validInteractionMonth} from "../../bni-analysis/engine/member-interactions.mjs";

const fail=(message,status)=>Object.assign(new Error(message),{status});
export function createMemberInteractionsApi({getImports,downloadReport,getRoster,now=()=>new Date()}){
  return async function memberInteractionsApi(request,url,context){
    if(!["vp","committee","admin"].includes(context?.role))throw fail("請先登入工作台",403);
    if(request.method!=="GET")throw fail("互動歷程只提供查閱",405);
    const member=normalizeName(url.searchParams.get("member")||"");
    const requestedMonth=url.searchParams.get("month")||"";
    if(!member||member.length>100)throw fail("請選擇一位會員",400);
    if(requestedMonth&&!validInteractionMonth(requestedMonth))throw fail("月份格式不正確",400);
    const names=(await getRoster()).map(normalizeName);
    if(names.filter(name=>name===member).length!==1)throw fail("會員不在目前名錄中，或姓名無法唯一對應",404);
    const reports=selectInteractionReports(await getImports()),at=now();
    const months=interactionMonthCatalog(reports,at);
    const month=requestedMonth||months[0]?.month||"";
    if(requestedMonth&&!months.some(item=>item.month===month))throw fail("這個月份尚未匯入審計週報，不能視為零互動",404);
    if(!month)return {schema:"fulian.member-interactions.v1",member,months:[],month:null,events:[],summary:null,coverage:null,importedAt:null};
    const selected=reports.filter(row=>row.period_start.startsWith(`${month}-`));
    const parsed=[];
    // 限制同時下載數；不保存跨使用者快取，也不把全分會明細傳到瀏覽器。
    for(let i=0;i<selected.length;i+=4){
      parsed.push(...await Promise.all(selected.slice(i,i+4).map(async row=>{
        const content=await downloadReport(row);
        const bytes=typeof content==="string"?new TextEncoder().encode(content):new Uint8Array(content);
        if(!/^[a-f0-9]{64}$/i.test(row.sha256||""))throw fail("審計報告缺少完整性指紋，請先核對資料",409);
        const digest=await crypto.subtle.digest("SHA-256",bytes);
        const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
        if(hash!==row.sha256.toLowerCase())throw fail("審計檔案與匯入指紋不一致，請先核對資料",409);
        const report=parseAuditWeekText(new TextDecoder().decode(bytes),"會員互動審計週報");
        if(report.week!==row.period_start)throw fail("審計報表與匯入索引週次不一致，請先核對資料",409);
        return report;
      })));
    }
    return {schema:"fulian.member-interactions.v1",...buildMemberInteractions({name:member,month,reports:parsed,now:at}),
      months,importedAt:selected.map(row=>row.imported_at).filter(Boolean).sort().at(-1)||null};
  };
}
