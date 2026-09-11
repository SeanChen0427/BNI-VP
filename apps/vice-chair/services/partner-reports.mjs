import {parsePalmsText,normalizeName} from "../../bni-analysis/engine/parse-reports.mjs";
import {normalizedPalmsMetrics} from "../bni-bridge.mjs";
import "../core/calendar-domain.js";

const calendar=globalThis.FulianCalendarDomain;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
function monthlyPeriod(row){
  const start=String(row.period_start||""),end=String(row.period_end||"");
  const category=row.metadata?.category;
  return (category==="monthly"||row.report_type==="monthly_palms")
    &&/^\d{4}-\d{2}-01$/.test(start)&&calendar.dateInput(start)
    &&end===calendar.monthEndDate(start.slice(0,7));
}
export function monthlyReportCatalog(imports=[]){
  const latest=new Map();
  for(const row of [...imports].sort((a,b)=>String(b.imported_at||"").localeCompare(String(a.imported_at||"")))){
    if(!monthlyPeriod(row))continue;
    const month=row.period_start.slice(0,7);
    if(!latest.has(month))latest.set(month,row);
  }
  return [...latest].sort(([a],[b])=>b.localeCompare(a)).map(([month,row])=>({month,period:{start:row.period_start,end:row.period_end},importedAt:row.imported_at||null,sourceId:row.id}));
}

// 僅讀取既有單月匯入檔；沿用分析核心解析，不產生新的計分或診斷。
export function createPartnerReportsApi({getImports,downloadReport,getRoster}){
  return async function partnerReportsApi(request,url,context){
    if(!["vp","committee","admin"].includes(context?.role))throw fail("請先登入工作台",403);
    if(request.method!=="GET")throw fail("夥伴名錄只提供查閱",405);
    const month=url.searchParams.get("month")||"";
    if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw fail("月份格式不正確",400);
    const imports=await getImports(),catalog=monthlyReportCatalog(imports);
    if(!month)return{schema:"fulian.partner-reports.v1",months:catalog};
    const selected=catalog.find(item=>item.month===month);
    if(!selected)throw fail("這個月份尚未匯入完整單月 PALMS",404);
    const source=imports.find(item=>item.id===selected.sourceId);
    const report=parsePalmsText(await downloadReport(source),"單月 PALMS");
    if(report.period.start!==selected.period.start||report.period.end!==selected.period.end)throw fail("匯入索引與報表期間不一致，請先核對資料");
    const names=report.members.map(member=>normalizeName(member.name));
    if(names.some(name=>!name)||new Set(names).size!==names.length)throw fail("單月報表姓名缺漏或重複，請先核對資料");
    const roster=new Set((await getRoster()).map(normalizeName));
    const members=report.members.filter(member=>roster.has(normalizeName(member.name))).map(member=>({name:member.name,metrics:normalizedPalmsMetrics(member)}));
    return{schema:"fulian.partner-reports.v1",month,period:report.period,importedAt:selected.importedAt,members,reportMemberCount:report.members.length,matchedMemberCount:members.length,reportOnlyCount:report.members.length-members.length};
  };
}
