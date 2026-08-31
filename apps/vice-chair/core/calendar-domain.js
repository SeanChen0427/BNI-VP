(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianCalendarDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function validDate(value){
    const date=value instanceof Date?new Date(value):new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function dateOnly(value){
    const match=String(value||"").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    const date=validDate(value);
    return date?new Date(date.getFullYear(),date.getMonth(),date.getDate()):null;
  }
  function daysUntil(value,now=new Date()){
    const target=dateOnly(value),today=dateOnly(now);
    if(!target||!today)return null;
    const targetUtc=Date.UTC(target.getFullYear(),target.getMonth(),target.getDate());
    const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
    return Math.round((targetUtc-todayUtc)/864e5);
  }
  function countdownLabel(days){
    if(days===null||!Number.isFinite(days))return"—";
    if(days<0)return`已逾期 ${Math.abs(days)} 天`;
    if(days===0)return"今天截止";
    if(days===1)return"明天截止";
    return`${days} 天`;
  }
  function sameMonth(value,now=new Date()){
    const date=validDate(value),current=validDate(now);
    return Boolean(date&&current&&date.getFullYear()===current.getFullYear()&&date.getMonth()===current.getMonth());
  }
  function dateInput(now=new Date()){
    const date=validDate(now)||new Date(),z=value=>String(value).padStart(2,"0");
    return`${date.getFullYear()}-${z(date.getMonth()+1)}-${z(date.getDate())}`;
  }
  function monthKey(value=new Date()){
    const date=dateOnly(value),z=part=>String(part).padStart(2,"0");
    return date?`${date.getFullYear()}-${z(date.getMonth()+1)}`:"";
  }
  function shiftMonthKey(value,offset=0){
    const match=String(value||"").match(/^(\d{4})-(\d{2})$/),amount=Number(offset);
    if(!match||!Number.isInteger(amount))return"";
    const date=new Date(Number(match[1]),Number(match[2])-1+amount,1),z=part=>String(part).padStart(2,"0");
    return`${date.getFullYear()}-${z(date.getMonth()+1)}`;
  }
  function monthEndDate(value){
    const next=shiftMonthKey(value,1);
    if(!next)return"";
    const [year,month]=next.split("-").map(Number);
    return dateInput(new Date(year,month-1,0));
  }
  function analysisEffectiveOn(periodEnd){
    const reportMonth=String(periodEnd||"").slice(0,7),meetingMonth=shiftMonthKey(reportMonth,1);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(periodEnd||""))&&meetingMonth?`${meetingMonth}-01`:"";
  }
  function monthlyAnalysisCycle(now=new Date()){
    const today=dateInput(now),currentMonth=monthKey(now),activeReportMonth=shiftMonthKey(currentMonth,-1);
    if(!currentMonth||!activeReportMonth)return null;
    const active={reportMonth:activeReportMonth,meetingMonth:currentMonth,effectiveOn:`${currentMonth}-01`,phase:"active"};
    const preparation=today===monthEndDate(currentMonth)?{
      reportMonth:currentMonth,
      meetingMonth:shiftMonthKey(currentMonth,1),
      effectiveOn:`${shiftMonthKey(currentMonth,1)}-01`,
      phase:"preparation"
    }:null;
    return{today,currentMonth,active,preparation};
  }
  function defaultVoteDeadline(now=new Date()){
    const date=validDate(now)||new Date();
    date.setDate(date.getDate()+1);
    date.setHours(18,0,0,0);
    return`${dateInput(date)}T18:00`;
  }
  function monthHeading(now=new Date()){
    const date=validDate(now)||new Date();
    return{year:date.getFullYear(),month:date.getMonth()+1,english:new Intl.DateTimeFormat("en-US",{month:"long"}).format(date).toUpperCase()};
  }
  function renewalPalmsPeriod({renewalCount,membershipStart,now=new Date()}={}){
    const current=validDate(now),startDate=dateOnly(membershipStart),count=String(renewalCount||"");
    if(!current||!["1","2"].includes(count)||!startDate)return null;
    const endMonth=new Date(current.getFullYear(),current.getMonth()-1,1);
    const startMonth=count==="1"
      ?new Date(startDate.getFullYear(),startDate.getMonth(),1)
      :new Date(endMonth.getFullYear(),endMonth.getMonth()-11,1);
    if(startMonth>endMonth)return null;
    const endDate=new Date(endMonth.getFullYear(),endMonth.getMonth()+1,0);
    const monthCount=(endMonth.getFullYear()-startMonth.getFullYear())*12+endMonth.getMonth()-startMonth.getMonth()+1;
    return{start:dateInput(startMonth),end:dateInput(endDate),monthCount,first:count==="1"};
  }
  return{daysUntil,countdownLabel,sameMonth,dateInput,monthKey,shiftMonthKey,monthEndDate,analysisEffectiveOn,monthlyAnalysisCycle,defaultVoteDeadline,monthHeading,renewalPalmsPeriod};
});
