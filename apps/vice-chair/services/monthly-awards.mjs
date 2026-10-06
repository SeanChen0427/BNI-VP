import {monthlyReportCatalog,readMonthlyReport,readPalmsReport} from "./partner-reports.mjs";
import {normalizeName} from "../../bni-analysis/engine/parse-reports.mjs";
import {parseXmlSpreadsheet} from "../../bni-analysis/engine/xml-sheet.mjs";

import {reportTotalWeeks} from "../../bni-analysis/engine/score.mjs";

const calendar=globalThis.FulianCalendarDomain;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const metrics=[
  {key:"oneToOne",label:"一對一次數",unit:"次",value:m=>m.oneToOne},
  {key:"given",label:"提供引薦數",unit:"筆",value:m=>m.refGivenInternal+m.refGivenExternal},
  {key:"amount",label:"引薦價值",unit:"元",value:m=>m.tyfcb},
  {key:"visitors",label:"來賓數",unit:"位",value:m=>m.visitors},
];
const education={key:"education",label:"培訓積分",unit:"分",value:m=>m.ceu};
const sortedNames=members=>members.map(member=>member.name).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
function rank(members,fields=metrics){
  return fields.map(({key,label,unit,value})=>{
    const highest=Math.max(...members.map(value));
    return{key,label,unit,value:highest,status:highest===0?"no-records":"ranked",winners:highest===0?[]:sortedNames(members.filter(member=>value(member)===highest))};
  });
}
function validateColumns(rows,report,names,indices,label,integer=false){
  for(const row of rows.slice(report.headerIndex+1)){
    if(!names.has(normalizeName(String(row[0]||"")+(row[1]||""))))continue;
    if(indices.some(i=>{
      const value=Number(String(row[i]).replace(/,/g,""));
      return row[i]==null||String(row[i]).trim()===""||!Number.isFinite(value)||value<0||(integer&&!Number.isInteger(value));
    }))throw fail(`${label}欄位缺漏或不正確，請先核對資料`);
  }
}
async function checkedText(row,downloadReport,label){
  const content=await downloadReport(row),bytes=typeof content==="string"?new TextEncoder().encode(content):new Uint8Array(content);
  if(!/^[a-f0-9]{64}$/i.test(row.sha256||""))throw fail(`${label}缺少完整性指紋，請先核對資料`);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==row.sha256.toLowerCase())throw fail(`${label}與匯入指紋不一致，請先核對資料`);
  return new TextDecoder().decode(bytes);
}
async function halfYearResult({imports,month,roster,downloadReport}){
  const period={start:`${calendar.shiftMonthKey(month,-5)}-01`,end:calendar.monthEndDate(month)};
  const source=[...imports].filter(row=>
    (row.metadata?.category==="halfYear"||(!row.metadata?.category&&row.report_type==="half_year_palms"))
    &&row.period_start===period.start&&row.period_end===period.end
  ).sort((a,b)=>String(b.imported_at||"").localeCompare(String(a.imported_at||"")))[0];
  if(!source)return{status:"unavailable",period,message:"尚未匯入此期間的完整半年 PALMS，暫時無法複製中心區回覆。"};
  try{
    let sourceText;
    const report=await readPalmsReport({source,label:"半年報表",downloadReport:async row=>{
      sourceText=await checkedText(row,downloadReport,"半年報表");return sourceText;
    }});
    const members=report.members.filter(member=>roster.has(normalizeName(member.name)));
    if(!members.length)throw fail("半年報表沒有目前在會會員的資料，無法產生回覆");
    const rows=parseXmlSpreadsheet(sourceText);
    validateColumns(rows,report,roster,[10,11,15,17,18,19],"半年報表的評比");
    // 全部原始會員決定完整週數，不能因排除離會者而縮短半年。
    validateColumns(rows,report,new Set(report.members.map(member=>normalizeName(member.name))),[3,4,5,6,8],"半年報表的出勤",true);
    const totalWeeks=reportTotalWeeks(report.members);
    if(totalWeeks<=0)throw fail("半年報表沒有完整出勤週數，請先核對資料");
    const winners=sortedNames(members.filter(m=>m.present===totalWeeks&&[m.absent,m.medical,m.substitute,m.late].every(value=>value===0)));
    return{status:"ready",period,importedAt:source.imported_at||null,memberCount:members.length,missingMemberCount:roster.size-members.length,
      awards:rank(members,[...metrics,education]),attendance:{winners,totalWeeks,criteria:`出席滿完整半年（${totalWeeks} 次），缺席、請假、代理人、遲到皆為 0。`}};
  }catch(error){
    return{status:"unavailable",period,message:error.status===409?error.message:"半年報表無法讀取或解析，請核對資料後重新整理。"};
  }
}
// 公告比較 PALMS 原始數值；半年週數沿用分析核心，不重算燈號或診斷。
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
      sourceText=await checkedText(row,downloadReport,"單月報表");return sourceText;
    }});
    const rosterNames=(await getRoster()).map(normalizeName);
    if(rosterNames.some(name=>!name)||new Set(rosterNames).size!==rosterNames.length)throw fail("現役名單姓名缺漏或重複，請先核對資料");
    const roster=new Set(rosterNames),members=report.members.filter(member=>roster.has(normalizeName(member.name)));
    if(!members.length)throw fail("該月報表沒有目前在會會員的資料，無法產生公告");
    // 核心解析以空白為零；公告額外拒絕缺值，避免把不完整來源誤報成零或第一名。
    const rows=parseXmlSpreadsheet(sourceText);
    validateColumns(rows,report,roster,[10,11,15,17,18],"單月報表的評比");
    const awards=rank(members);
    const halfYear=url.searchParams.get("include")==="halfYear"?await halfYearResult({imports,month,roster,downloadReport}):null;
    return{schema:"fulian.monthly-awards.v1",month,period:report.period,importedAt:selected.importedAt,
      scope:"current-members",memberCount:members.length,rosterCount:roster.size,missingMemberCount:roster.size-members.length,awards,...(halfYear?{halfYear}:{})};
  };
}
