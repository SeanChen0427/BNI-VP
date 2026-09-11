import {normalizeName} from "./parse-reports.mjs";
import {taipeiDay} from "./time.mjs";

const fail=message=>Object.assign(new Error(message),{status:409});
export const validInteractionMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
function validDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}

// 沿用富聯每週二例會的審計週次口徑；停會／改期不得以其他週的重複匯入補足。
export function expectedInteractionWeeks(month){
  if(!validInteractionMonth(month))throw fail("月份格式不正確");
  const date=new Date(`${month}-01T00:00:00Z`),weeks=[];
  while(date.toISOString().startsWith(month)){
    if(date.getUTCDay()===2)weeks.push(date.toISOString().slice(0,10));
    date.setUTCDate(date.getUTCDate()+1);
  }
  return weeks;
}

export function selectInteractionReports(imports=[]){
  const latest=new Map();
  const rows=imports.filter(row=>row.report_type==="audit"||row.metadata?.category==="audit")
    .sort((a,b)=>String(b.imported_at||"").localeCompare(String(a.imported_at||""))||String(b.id||"").localeCompare(String(a.id||"")));
  for(const row of rows){
    const week=row.period_start;
    if(!validDay(week)||(row.period_end&&row.period_end!==week))throw fail("審計匯入索引日期缺漏或不一致，請先核對資料");
    const previous=latest.get(week);
    if(previous){
      if(previous.imported_at===row.imported_at&&previous.sha256!==row.sha256)throw fail("同週審計報告版本不明，請先核對資料");
      continue;
    }
    latest.set(week,row);
  }
  return [...latest.values()].sort((a,b)=>b.period_start.localeCompare(a.period_start));
}

export function interactionCoverage(month,weeks,now=new Date()){
  const expectedWeeks=expectedInteractionWeeks(month),availableWeeks=[...new Set(weeks)].sort();
  const missingWeeks=expectedWeeks.filter(week=>!availableWeeks.includes(week));
  const extraWeeks=availableWeeks.filter(week=>!expectedWeeks.includes(week));
  const closed=month<taipeiDay(now).slice(0,7);
  return {expectedWeeks,availableWeeks,missingWeeks,extraWeeks,closed,
    status:!availableWeeks.length?"unavailable":!closed?"ongoing":missingWeeks.length||extraWeeks.length?"partial":"complete"};
}

export function interactionMonthCatalog(reports,now=new Date()){
  const months=[...new Set(reports.map(row=>row.period_start.slice(0,7)))].sort().reverse();
  return months.map(month=>({month,...interactionCoverage(month,reports.filter(row=>row.period_start.startsWith(month)).map(row=>row.period_start),now)}));
}

// 一筆 slip 是一筆登錄，不推定為一場唯一會面，也不反推誰主動邀約。
export function buildMemberInteractions({name,month,reports,now=new Date()}){
  const member=normalizeName(name),events=[],weeks=[];
  for(const report of reports){
    if(!validDay(report.week)||!report.week.startsWith(`${month}-`))throw fail("審計報表與所選月份不一致，請先核對資料");
    if(weeks.includes(report.week))throw fail("同週審計重複，請先選定最新版本");
    weeks.push(report.week);
    for(const event of report.events){
      const from=normalizeName(event.from),to=normalizeName(event.to);
      if(from!==member&&to!==member)continue;
      if(!["一對一會面","引薦"].includes(event.type))continue;
      const self=from===member&&to===member;
      events.push({week:report.week,type:event.type==="引薦"?"referral":"oneToOne",
        direction:self?"self":from===member?"outgoing":"incoming",
        counterpart:from===member?to:from,
        inOut:event.type==="引薦"?String(event.inOut||""):"",
        chapterNote:/分會/.test(event.detail||"")?String(event.detail).slice(0,250):""});
    }
  }
  events.sort((a,b)=>b.week.localeCompare(a.week)||a.type.localeCompare(b.type)||a.counterpart.localeCompare(b.counterpart,"zh-Hant"));
  const oneToOne=events.filter(event=>event.type==="oneToOne");
  const given=events.filter(event=>event.type==="referral"&&event.direction!=="incoming");
  const received=events.filter(event=>event.type==="referral"&&event.direction!=="outgoing");
  return {member,month,coverage:interactionCoverage(month,weeks,now),events,
    summary:{oneToOne:oneToOne.length,given:given.length,received:received.length,
      counterpartCount:new Set(events.map(event=>event.counterpart).filter(name=>name&&name!==member)).size}};
}
