import {monthlyReportCatalog,readMonthlyReport} from "./partner-reports.mjs";
import {normalizeName} from "../../bni-analysis/engine/parse-reports.mjs";
import {parseXmlSpreadsheet} from "../../bni-analysis/engine/xml-sheet.mjs";

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const metrics=[
  {key:"oneToOne",label:"一對一次數",unit:"次",value:m=>m.oneToOne},
  {key:"given",label:"提供引薦數",unit:"筆",value:m=>m.refGivenInternal+m.refGivenExternal},
  {key:"amount",label:"引薦價值",unit:"元",value:m=>m.tyfcb},
  {key:"visitors",label:"來賓數",unit:"位",value:m=>m.visitors},
];
// 公告只比較既有單月原始數值，不重算燈號或診斷。
export function createMonthlyAwardsApi({getImports,downloadReport,getRoster}){
  return async function monthlyAwardsApi(request,url,context){
    if(!["vp","admin"].includes(context?.role))throw fail("每月績優公告僅供副主席查閱",403);
    if(request.method!=="GET")throw fail("每月績優公告只提供查閱",405);
    const month=url.searchParams.get("month")||"";
    if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw fail("月份格式不正確",400);
    const imports=await getImports(),catalog=monthlyReportCatalog(imports);
    if(!month)return{schema:"fulian.monthly-awards.v1",months:catalog.map(({month,period,importedAt})=>({month,period,importedAt}))};
    let sourceText;
    const {report,selected}=await readMonthlyReport({imports,catalog,month,downloadReport:async row=>{
      const content=await downloadReport(row),bytes=typeof content==="string"?new TextEncoder().encode(content):new Uint8Array(content);
      if(!/^[a-f0-9]{64}$/i.test(row.sha256||""))throw fail("單月報表缺少完整性指紋，請先核對資料");
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      if(hash!==row.sha256.toLowerCase())throw fail("單月報表與匯入指紋不一致，請先核對資料");
      sourceText=new TextDecoder().decode(bytes);return sourceText;
    }});
    const rosterNames=(await getRoster()).map(normalizeName);
    if(rosterNames.some(name=>!name)||new Set(rosterNames).size!==rosterNames.length)throw fail("現役名單姓名缺漏或重複，請先核對資料");
    const roster=new Set(rosterNames),members=report.members.filter(member=>roster.has(normalizeName(member.name)));
    if(!members.length)throw fail("該月報表沒有目前在會會員的資料，無法產生公告");
    // 核心解析以空白為零；公告額外拒絕缺值，避免把不完整來源誤報成零或第一名。
    const rows=parseXmlSpreadsheet(sourceText);
    for(const row of rows.slice(report.headerIndex+1)){
      if(!roster.has(normalizeName(String(row[0]||"")+(row[1]||""))))continue;
      if([10,11,15,17,18].some(i=>row[i]==null||String(row[i]).trim()===""||!Number.isFinite(Number(String(row[i]).replace(/,/g,"")))||Number(String(row[i]).replace(/,/g,""))<0))throw fail("單月報表的評比欄位缺漏或不正確，請先核對資料");
    }
    const awards=metrics.map(({key,label,unit,value})=>{
      const highest=Math.max(...members.map(value));
      return{key,label,unit,value:highest,status:highest===0?"no-records":"ranked",winners:highest===0?[]:members.filter(member=>value(member)===highest).map(member=>member.name).sort((a,b)=>a.localeCompare(b,"zh-Hant"))};
    });
    return{schema:"fulian.monthly-awards.v1",month,period:report.period,importedAt:selected.importedAt,
      scope:"current-members",memberCount:members.length,rosterCount:roster.size,missingMemberCount:roster.size-members.length,awards};
  };
}
